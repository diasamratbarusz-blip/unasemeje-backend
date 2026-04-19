// ================= IMPORTS =================
require("dotenv").config();

// ✅ DEBUG ENV VARIABLES (ADDED)
console.log("SMM_API_URL:", process.env.SMM_API_URL);
console.log("SMM_API_KEY:", process.env.SMM_API_KEY ? "Loaded ✅" : "Missing ❌");

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");

// DB
const connectDB = require("./config/db");
const log = require("./utils/logger");

// MODELS
const User = require("./models/User");
const Order = require("./models/Order");
const Deposit = require("./models/Deposit");
const Service = require("./models/Service");

// UTILS (optional)
const smmRequest = require("./utils/smmApi");

// ================= VALIDATE ENV =================
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET missing in environment variables");
  process.exit(1);
}

// ================= INIT =================
const app = express();

app.use(cors());
app.use(express.json());

// ================= CONNECT DB =================
connectDB();
log("Server starting...");

// ================= AUTH =================
function auth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ================= CLEAN SERVICE NAME =================
function cleanName(name = "") {
  return name
    .replace(/^TTF\d+\s*/i, "")
    .replace(/^TTV\d+\s*/i, "")
    .replace(/^TTL\d+\s*/i, "")
    .replace(/\[.*?\]/g, "")
    .trim();
}

// ================= PLATFORM DETECTION =================
function detectPlatform(service = {}) {
  const text = `${service.name || ""} ${service.category || ""}`.toLowerCase();

  if (text.includes("instagram")) return "Instagram";
  if (text.includes("tiktok")) return "TikTok";
  if (text.includes("youtube")) return "YouTube";
  if (text.includes("facebook")) return "Facebook";
  if (text.includes("twitter") || text.includes("x")) return "Twitter/X";

  return "Other";
}

// ================= PROFIT SYSTEM =================
function getProfit(rate) {
  if (rate < 50) return 1.8;
  if (rate < 200) return 1.5;
  return 1.3;
}

function applyProfit(rate) {
  return Number((rate * getProfit(rate)).toFixed(2));
}

function calculateCost(rate, qty) {
  return (applyProfit(rate) / 1000) * Number(qty);
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 Backend running successfully");
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  const { email, password, phone } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: "User already exists" });

  await User.create({ email, password, phone });

  res.json({ message: "Registered successfully" });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, password });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

// ================= USER =================
app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
});

// ================= SERVICES (FIXED + GUARANTEED DISPLAY) =================
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();

    // IF EMPTY → FETCH FROM PROVIDER
    if (!services.length) {
      console.log("⚠️ Fetching services from provider...");

      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url, { timeout: 20000 });

      const raw = response.data;
      const list = Array.isArray(raw) ? raw : Object.values(raw || {});

      services = list.map(s => ({
        serviceId: String(s.service || s.id),
        name: cleanName(s.name || "Service"),
        baseRate: Number(s.rate || 0),
        rate: applyProfit(Number(s.rate || 0)),
        min: Number(s.min || 1),
        max: Number(s.max || 10000),
        category: s.category || "Other",
        platform: detectPlatform({
          name: s.name,
          category: s.category
        })
      }));

      await Service.deleteMany({});
      await Service.insertMany(services);
    }

    // GROUP SERVICES (FRONTEND READY)
    const grouped = {};

    services.forEach(s => {
      const platform = s.platform || "Other";
      const category = s.category || "General";

      if (!grouped[platform]) grouped[platform] = {};
      if (!grouped[platform][category]) grouped[platform][category] = [];

      grouped[platform][category].push({
        serviceId: s.serviceId,
        name: s.name,
        rate: Number(s.rate).toFixed(2),
        min: s.min,
        max: s.max
      });
    });

    res.json({
      success: true,
      data: grouped
    });

  } catch (err) {
    console.error("❌ SERVICES ERROR:", err.message);

    res.status(500).json({
      success: false,
      error: "Failed to load services"
    });
  }
});

// ================= ORDER =================
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Service not found" });

    const cost = calculateCost(service.baseRate, quantity);

    const user = await User.findById(req.user.id);

    if (user.balance < cost) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    user.balance -= cost;
    await user.save();

    const order = await Order.create({
      userId: user._id,
      service: service.name,
      serviceId,
      link,
      quantity,
      cost
    });

    res.json({
      message: "Order placed",
      order,
      balance: user.balance
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Order failed" });
  }
});

// ================= ORDERS =================
app.get("/api/orders", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id });
  res.json(orders);
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
  log(`Server running on port ${PORT}`);
});
