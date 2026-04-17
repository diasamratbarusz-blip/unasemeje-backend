// ================= IMPORTS =================
require("dotenv").config();

console.log("SMM_API_URL:", process.env.SMM_API_URL);
console.log("SMM_API_KEY:", process.env.SMM_API_KEY ? "Loaded ✅" : "Missing ❌");

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const connectDB = require("./config/db");
const log = require("./utils/logger");

// MODELS
const User = require("./models/User");
const Order = require("./models/Order");
const Deposit = require("./models/Deposit");
const Service = require("./models/Service");

// UTILS
const smmRequest = require("./utils/smmApi");

// ================= CONFIG =================
const app = express();
app.use(cors());
app.use(express.json());

connectDB();
log("Server starting...");

// ================= CURRENCY =================
const USD_TO_KSH = 160;

// ================= AUTH =================
function auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "No token" });

    const token = header.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);

    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ================= HELPERS =================
function cleanName(name = "") {
  return String(name)
    .replace(/\[.*?\]/g, "")
    .trim();
}

function detectPlatform(cat = "") {
  cat = cat.toLowerCase();

  if (cat.includes("instagram")) return "Instagram";
  if (cat.includes("tiktok")) return "TikTok";
  if (cat.includes("youtube")) return "YouTube";
  if (cat.includes("facebook")) return "Facebook";
  if (cat.includes("twitter") || cat.includes("x")) return "Twitter/X";

  return "Other";
}

// ================= SMART CURRENCY =================
function detectCurrency(rate) {
  rate = Number(rate);

  // If too small → USD
  if (rate > 0 && rate < 5) return "USD";

  return "KES";
}

function toKsh(rate) {
  const currency = detectCurrency(rate);

  if (currency === "USD") {
    return rate * USD_TO_KSH;
  }

  return rate;
}

// ================= YOUR CUSTOM MARKUP =================
function applyMarkup(rate) {
  rate = Number(rate);

  if (rate < 10) return rate + 30;
  if (rate >= 10 && rate < 20) return rate + 30;
  if (rate >= 20 && rate < 30) return rate + 20;
  if (rate >= 30 && rate < 40) return rate + 16;
  if (rate >= 40 && rate < 50) return rate + 12;
  if (rate >= 50 && rate < 60) return rate + 12;
  if (rate >= 60 && rate < 70) return rate + 12;
  if (rate >= 70 && rate < 100) return rate + 15;

  return rate + 30;
}

// ================= COST =================
function calculateCost(sellingRate, qty) {
  return (sellingRate / 1000) * qty;
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 SMM Backend Running");
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, phone } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "User exists" });

    await User.create({ email, password, phone });

    res.json({ message: "Registered" });
  } catch {
    res.status(500).json({ error: "Error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne(req.body);
    if (!user) return res.status(400).json({ error: "Invalid login" });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET
    );

    res.json({ token });
  } catch {
    res.status(500).json({ error: "Error" });
  }
});

app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
});

// ================= SERVICES =================
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();

    if (!services.length) {
      console.log("Fetching from provider...");

      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url);

      const list = Array.isArray(response.data)
        ? response.data
        : Object.values(response.data);

      const formatted = list.map(s => {
        const rawRate = Number(s.rate || 0);

        const kshRate = toKsh(rawRate);
        const selling = applyMarkup(kshRate);

        return {
          serviceId: String(s.service),
          name: cleanName(s.name),
          rate: kshRate,
          sellingRate: selling,
          min: s.min || 1,
          max: s.max || 100000,
          category: s.category || "Other",
          platform: detectPlatform(s.category)
        };
      });

      await Service.insertMany(formatted);
      services = formatted;
    }

    const grouped = {};

    services.forEach(s => {
      if (!grouped[s.platform]) grouped[s.platform] = [];

      grouped[s.platform].push({
        serviceId: s.serviceId,
        name: s.name,
        rate: s.sellingRate.toFixed(2),
        min: s.min,
        max: s.max
      });
    });

    res.json({ success: true, data: grouped });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed services" });
  }
});

// ================= ORDER =================
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Not found" });

    const cost = calculateCost(service.sellingRate, quantity);

    const user = await User.findById(req.user.id);

    if (user.balance < cost) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const smm = await smmRequest({
      action: "add",
      service: serviceId,
      link,
      quantity
    });

    if (!smm?.order) {
      return res.status(500).json({ error: "Provider failed" });
    }

    user.balance -= cost;
    await user.save();

    const order = await Order.create({
      userId: user._id,
      service: service.name,
      quantity,
      cost,
      smmOrderId: smm.order
    });

    res.json({ message: "Order placed", order });

  } catch {
    res.status(500).json({ error: "Order failed" });
  }
});

// ================= ORDERS =================
app.get("/api/orders", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id });
  res.json(orders);
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Running on", PORT);
});
