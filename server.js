// ================= IMPORTS =================
require("dotenv").config();

const crypto = require("crypto");
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

// ================= ADMIN =================
const ADMIN_EMAIL = "diasamratbarusz@gmail.com";
const ADMIN_PHONE = "0715509440";

// ================= CONNECT DB =================
connectDB();
log("Server starting...");

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

// ================= REFERRAL =================
function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex");
}

async function giveReferralBonus(userId, amount) {
  const user = await User.findById(userId);
  if (!user || !user.referredBy) return;

  const referrer = await User.findOne({ referralCode: user.referredBy });
  if (!referrer) return;

  const bonus = amount * 0.10;

  referrer.balance += bonus;
  referrer.referralEarnings = (referrer.referralEarnings || 0) + bonus;

  await referrer.save();
}

// ================= HELPERS =================
function cleanName(name = "") {
  return String(name)
    .replace(/^TTF\d+\s*/i, "")
    .replace(/^TTV\d+\s*/i, "")
    .replace(/^TTL\d+\s*/i, "")
    .replace(/\[.*?\]/g, "")
    .trim() || "Service";
}

function detectPlatform(service = {}) {
  const text = `${service.name || ""} ${service.category || ""}`.toLowerCase();

  if (/(instagram|insta|ig)/.test(text)) return "Instagram";
  if (/(tiktok|tik tok|tt)/.test(text)) return "TikTok";
  if (/(youtube|yt)/.test(text)) return "YouTube";
  if (/(facebook|fb)/.test(text)) return "Facebook";
  if (/(twitter|x)/.test(text)) return "Twitter/X";
  if (/(telegram|tg)/.test(text)) return "Telegram";

  return "Other";
}

// ================= PRICING ENGINE (FIXED) =================

// provider base rate adjustment
function applyProviderRate(rate) {
  rate = Number(rate || 0);

  if (rate < 50) return rate * 1.8;
  if (rate < 200) return rate * 1.5;
  return rate * 1.3;
}

// markup rules
function getMarkup(name = "") {
  const text = String(name).toLowerCase();

  if (text.includes("like")) return 30;
  if (text.includes("follower")) return 25;
  if (text.includes("view")) return 35;
  if (text.includes("comment")) return 40;
  if (text.includes("save")) return 40;

  return 40;
}

// FINAL SELL PRICE (ONLY FOR DISPLAY)
function getSellPrice(baseRate, name) {
  const provider = applyProviderRate(baseRate);
  const markup = getMarkup(name);

  return Number((provider + markup).toFixed(2));
}

// COST TO YOU (IMPORTANT FIX)
function calculateCost(baseRate, qty) {
  return (Number(baseRate || 0) / 1000) * Number(qty || 0);
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 Backend Running Successfully");
});

// ================= REGISTER =================
app.post("/api/register", async (req, res) => {
  const { email, password, phone, referralCode } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: "User exists" });

  await User.create({
    email,
    password,
    phone,
    referralCode: generateReferralCode(),
    referredBy: referralCode || null,
    balance: 0,
    referralEarnings: 0
  });

  res.json({ message: "Registered" });
});

// ================= LOGIN =================
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, password });
  if (!user) return res.status(400).json({ error: "Invalid login" });

  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

// ================= USER =================
app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);

  res.json({
    email: user.email,
    phone: user.phone,
    balance: user.balance,
    referralCode: user.referralCode,
    referralEarnings: user.referralEarnings || 0
  });
});

// ================= SERVICES (FIXED - NO OVERWRITE BUG) =================
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();

    if (!services.length) {
      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url, { timeout: 20000 });

      const raw = response.data;
      const list = Array.isArray(raw) ? raw : Object.values(raw || {}).flat();

      const mapped = list.map((s, i) => ({
        serviceId: String(s.service || s.id || `srv_${i}`),
        name: cleanName(s.name),
        baseRate: Number(s.rate || 0),   // 🔥 IMPORTANT FIX
        min: Number(s.min || 1),
        max: Number(s.max || 10000),
        category: s.category || "General",
        platform: detectPlatform(s)
      }));

      await Service.insertMany(mapped);
      services = mapped;
    }

    // DO NOT overwrite baseRate
    const formatted = services.map(s => ({
      serviceId: s.serviceId,
      name: s.name,
      rate: getSellPrice(s.baseRate || s.rate, s.name), // display only
      baseRate: s.baseRate || s.rate, // keep original safe
      min: s.min,
      max: s.max,
      category: s.category,
      platform: s.platform
    }));

    const grouped = {};

    formatted.forEach(s => {
      const p = s.platform || "Other";
      const c = s.category || "General";

      if (!grouped[p]) grouped[p] = {};
      if (!grouped[p][c]) grouped[p][c] = [];

      grouped[p][c].push({
        serviceId: s.serviceId,
        name: s.name,
        rate: s.rate
      });
    });

    res.json({ success: true, data: grouped });

  } catch (err) {
    res.status(500).json({ error: "Services failed" });
  }
});

// ================= ORDER (FIXED COST LOGIC) =================
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Service not found" });

    const cost = calculateCost(service.baseRate, quantity); // 🔥 FIXED

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

    await giveReferralBonus(req.user.id, cost);

    res.json({
      message: "Order placed",
      order,
      balance: user.balance
    });

  } catch (err) {
    res.status(500).json({ error: "Order failed" });
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
  log("Server running on port " + PORT);
});
