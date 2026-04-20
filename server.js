// ================= IMPORTS =================
require("dotenv").config();

const crypto = require("crypto");

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

// ================= CLEAN NAME =================
function cleanName(name = "") {
  return String(name || "")
    .replace(/^TTF\d+\s*/i, "")
    .replace(/^TTV\d+\s*/i, "")
    .replace(/^TTL\d+\s*/i, "")
    .replace(/\[.*?\]/g, "")
    .trim() || "Service";
}

// ================= PLATFORM =================
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

// ================= 🔥 YOUR ONLY PRICING SYSTEM =================

// ONLY MARKUP SYSTEM (NO PROVIDER LOGIC ANYWHERE)
function getMarkup(name = "") {
  const t = String(name).toLowerCase();

  if (t.includes("like")) return 30;
  if (t.includes("follower")) return 25;
  if (t.includes("view")) return 35;
  if (t.includes("comment")) return 40;
  if (t.includes("save")) return 40;

  return 40;
}

// FINAL PRICE = RAW RATE + YOUR MARKUP ONLY
function applyFinalPrice(rate, name) {
  rate = Number(rate || 0);
  const markup = getMarkup(name);

  return Number((rate + markup).toFixed(2));
}

// COST FOR BALANCE (UNCHANGED SAFE FORMULA)
function calculateCost(rate, qty) {
  return (Number(rate || 0) / 1000) * Number(qty || 0);
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
    apiKey: user.apiKey || null,
    referralCode: user.referralCode,
    referralEarnings: user.referralEarnings || 0
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
      const list = Array.isArray(raw) ? raw : Object.values(raw || {}).flat();

      services = list.map((s, i) => ({
        serviceId: String(s.service || s.id || `srv_${i}`),
        name: cleanName(s.name),
        rate: Number(s.rate || 0),
        min: Number(s.min || 1),
        max: Number(s.max || 10000),
        category: s.category || "General",
        platform: detectPlatform(s)
      }));

      await Service.deleteMany({});
      await Service.insertMany(services);
    }

    // 🔥 ONLY YOUR MARKUP PRICE IS USED HERE
    const formatted = services.map(s => ({
      serviceId: s.serviceId,
      name: s.name,
      rate: applyFinalPrice(s.rate, s.name), // ONLY SYSTEM
      min: s.min,
      max: s.max,
      category: s.category,
      platform: detectPlatform(s)
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

// ================= ORDER =================
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Service not found" });

    // 🔥 SAME PRICE SYSTEM USED (MARKUP ONLY)
    const cost = calculateCost(service.rate, quantity);

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

// ================= ORDERS =================
app.get("/api/orders", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id });
  res.json(orders);
});

// ================= DEPOSIT =================
app.post("/api/deposit", auth, async (req, res) => {
  const { message } = req.body;

  const code = message?.match(/[A-Z0-9]{8,12}/)?.[0];
  const amount = message?.match(/Ksh\s?([\d,]+)/i)?.[1];
  const phone = message?.match(/(\d{10,12})/)?.[0];

  if (!code) return res.status(400).json({ error: "Invalid message" });

  const exists = await Deposit.findOne({ transactionCode: code });
  if (exists) return res.status(400).json({ error: "Used transaction" });

  await Deposit.create({
    userId: req.user.id,
    phone,
    amount: Number(amount || 0),
    transactionCode: code,
    message,
    status: "pending"
  });

  res.json({ message: "Deposit submitted. Request is in progress." });
});

// ================= API KEY =================
app.get("/api/api-key", auth, async (req, res) => {
  const user = await User.findById(req.user.id);

  if (user.apiKey) return res.json({ apiKey: user.apiKey });

  const apiKey = crypto.randomBytes(24).toString("hex");

  user.apiKey = apiKey;
  await user.save();

  res.json({ apiKey });
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
  log("Server running on port " + PORT);
});
