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

const app = express();

app.use(cors());
app.use(express.json());

// ================= CONNECT DB =================
connectDB();
log("Server starting...");

// ================= 🔥 ADMIN CHECK =================
function isAdminUser(user) {
  return (
    user.email === "diasamratbarusz@gmail.com" ||
    user.phone === "0715509440"
  );
}

// ================= AUTH =================
function auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "No token" });

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ================= ADMIN MIDDLEWARE =================
async function admin(req, res, next) {
  const user = await User.findById(req.user.id);

  if (!user || !isAdminUser(user)) {
    return res.status(403).json({ error: "Admin only" });
  }

  next();
}

// ================= CLEAN NAME =================
function cleanName(name = "") {
  return String(name || "")
    .replace(/^TTF\d+\s*/i, "")
    .replace(/^TTV\d+\s*/i, "")
    .replace(/^TTL\d+\s*/i, "")
    .replace(/\[.*?\]/g, "")
    .trim() || "Service";
}

// ================= PLATFORM DETECTION =================
function detectPlatform(service = {}) {
  const text = `${service.name || ""} ${service.category || ""}`.toLowerCase();

  if (/(instagram|insta|ig)/.test(text)) return "Instagram";
  if (/(tiktok|tik tok|tt)/.test(text)) return "TikTok";
  if (/(youtube|yt|subscriber)/.test(text)) return "YouTube";
  if (/(facebook|fb)/.test(text)) return "Facebook";
  if (/(twitter|x.com|tweet)/.test(text)) return "Twitter/X";
  if (/(telegram|tg)/.test(text)) return "Telegram";

  return "Other";
}

// ================= MARKUP =================
function getMarkup(name = "") {
  const text = String(name).toLowerCase();

  if (text.includes("like")) return 30;
  if (text.includes("follower")) return 20;
  if (text.includes("view")) return 40;
  if (text.includes("comment")) return 35;

  return 40;
}

// ================= PRICE ENGINE =================
function applyProviderRate(rate) {
  rate = Number(rate || 0);

  if (rate < 50) return rate * 1.8;
  if (rate < 200) return rate * 1.5;
  return rate * 1.3;
}

function applyFinalPrice(rate, name) {
  const provider = applyProviderRate(rate);
  const markup = getMarkup(name);

  return Number((provider + markup).toFixed(2));
}

// ================= COST =================
function calculateCost(rate, qty) {
  return (Number(rate || 0) / 1000) * Number(qty || 0);
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 Backend Running Successfully");
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  const { email, password, phone } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: "User exists" });

  const user = await User.create({ email, password, phone });

  res.json({ message: "Registered", user });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, password });
  if (!user) return res.status(400).json({ error: "Invalid login" });

  const token = jwt.sign(
    {
      id: user._id,
      email: user.email,
      isAdmin: isAdminUser(user)
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

// ================= USER =================
app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);

  res.json({
    ...user.toObject(),
    isAdmin: isAdminUser(user)
  });
});

// ================= SERVICES =================
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();

    if (!services.length) {
      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url, { timeout: 20000 });

      const raw = response.data;
      const list = Array.isArray(raw)
        ? raw
        : Object.values(raw || {}).flat();

      services = list.map((s, i) => ({
        serviceId: String(s.service || s.id || `srv_${i}`),
        name: cleanName(s.name),
        rate: Number(s.rate || 0),
        min: Number(s.min || 1),
        max: Number(s.max || 10000),
        category: s.category || "General"
      }));

      await Service.deleteMany({});
      await Service.insertMany(services);
    }

    services = services.map((s, i) => {
      const clean = cleanName(s.name);
      const finalPrice = applyFinalPrice(s.rate, clean);

      return {
        serviceId: String(s.serviceId || `srv_${i}`),
        name: clean,
        rate: finalPrice,
        min: s.min,
        max: s.max,
        category: s.category || "General",
        platform: detectPlatform(s)
      };
    });

    const grouped = {};

    for (const s of services) {
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
    }

    res.json({ success: true, data: grouped });

  } catch (err) {
    console.error("SERVICES ERROR:", err.message);
    res.status(500).json({ error: "Services failed" });
  }
});

// ================= ORDER =================
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Service not found" });

    const finalRate = applyFinalPrice(service.rate, service.name);
    const cost = calculateCost(finalRate, quantity);

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
    res.status(500).json({ error: "Order failed" });
  }
});

// ================= ADMIN ROUTES =================

// USERS
app.get("/api/admin/users", auth, admin, async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// DEPOSITS
app.get("/api/admin/deposits", auth, admin, async (req, res) => {
  const deposits = await Deposit.find();
  res.json(deposits);
});

// APPROVE DEPOSIT
app.post("/api/admin/approve-deposit", auth, admin, async (req, res) => {
  const { depositId } = req.body;

  const deposit = await Deposit.findById(depositId);
  if (!deposit) return res.status(400).json({ error: "Not found" });

  const user = await User.findById(deposit.userId);

  user.balance += deposit.amount;
  await user.save();

  deposit.status = "approved";
  await deposit.save();

  res.json({ message: "Approved" });
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
  log("Server running on port " + PORT);
});
