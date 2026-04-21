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

// ================= ADMIN CREDENTIALS =================
const ADMIN_EMAIL = "diasamratbarusz@gmail.com";
const ADMIN_PHONE = "0715509440";

// ================= CONNECT DB =================
connectDB();
log("Server starting...");

// ================= AUTH MIDDLEWARE =================
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

// ================= ADMIN MIDDLEWARE =================
function isAdmin(req, res, next) {
  if (req.user && (req.user.email === ADMIN_EMAIL || req.user.phone === ADMIN_PHONE)) {
    next();
  } else {
    res.status(403).json({ error: "Access denied. Admin only." });
  }
}

// ================= REFERRAL SYSTEM =================
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

// ================= SERVICE UTILS =================
function cleanName(name = "") {
  return String(name || "")
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

// ================= PRICING & MONEY DETECTION =================
function getMarkup(name = "") {
  const t = String(name).toLowerCase();
  if (t.includes("like")) return 30;
  if (t.includes("follower")) return 25;
  if (t.includes("view")) return 35;
  if (t.includes("comment")) return 40;
  return 40;
}

function applyFinalPrice(rate, name) {
  const markup = getMarkup(name);
  return Number((Number(rate || 0) + markup).toFixed(2));
}

function calculateCost(finalRate, qty) {
  return (finalRate / 1000) * Number(qty || 0);
}

// ================= ROUTES =================

app.get("/", (req, res) => res.send("🚀 Backend Operational"));

// REGISTER / LOGIN
app.post("/api/register", async (req, res) => {
  const { email, password, phone, referralCode } = req.body;
  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: "User exists" });

  await User.create({
    email, password, phone,
    referralCode: generateReferralCode(),
    referredBy: referralCode || null,
    balance: 0
  });
  res.json({ message: "Registered" });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });
  if (!user) return res.status(400).json({ error: "Invalid login" });

  const token = jwt.sign(
    { id: user._id, email: user.email, phone: user.phone },
    process.env.JWT_SECRET, { expiresIn: "7d" }
  );
  res.json({ token });
});

// USER DATA
app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
});

// SERVICES
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();
    if (!services.length) {
      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url);
      const list = Array.isArray(response.data) ? response.data : Object.values(response.data).flat();

      services = list.map((s, i) => ({
        serviceId: String(s.service || s.id || i),
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

    const grouped = {};
    services.forEach(s => {
      const p = s.platform;
      const c = s.category;
      if (!grouped[p]) grouped[p] = {};
      if (!grouped[p][c]) grouped[p][c] = [];
      grouped[p][c].push({
        ...s.toObject(),
        rate: applyFinalPrice(s.rate, s.name)
      });
    });
    res.json({ success: true, data: grouped });
  } catch (err) { res.status(500).json({ error: "Failed to load services" }); }
});

// ================= PLACING ORDER & MONEY DETECTION =================
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;
    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Service not found" });

    // 1. Calculate final rate with markup
    const finalRate = applyFinalPrice(service.rate, service.name);
    // 2. Calculate final cost
    const cost = calculateCost(finalRate, quantity);

    const user = await User.findById(req.user.id);
    if (user.balance < cost) return res.status(400).json({ error: "Insufficient balance" });

    // 3. Detect (Deduct) Money
    user.balance -= cost;
    await user.save();

    // 4. Record Order
    const order = await Order.create({
      userId: user._id,
      service: service.name,
      serviceId,
      link,
      quantity,
      cost,
      status: "pending",
      refill: false // Initial refill status
    });

    await giveReferralBonus(req.user.id, cost);

    res.json({ message: "Order placed successfully", order, balance: user.balance });
  } catch (err) { res.status(500).json({ error: "Order failed" }); }
});

// REFILL ORDER LOGIC
app.post("/api/order/refill", auth, async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findOne({ _id: orderId, userId: req.user.id });
        
        if (!order) return res.status(404).json({ error: "Order not found" });
        
        // Mark for refill processing
        order.status = "refilling";
        await order.save();
        
        res.json({ message: "Refill request sent successfully" });
    } catch (err) { res.status(500).json({ error: "Refill failed" }); }
});

app.get("/api/orders", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(orders);
});

// DEPOSIT
app.post("/api/deposit", auth, async (req, res) => {
  const { message, phone, amount } = req.body;
  const code = message?.match(/[A-Z0-9]{8,12}/)?.[0];
  if (!code) return res.status(400).json({ error: "Invalid M-Pesa code" });

  const exists = await Deposit.findOne({ transactionCode: code });
  if (exists) return res.status(400).json({ error: "Code already used" });

  await Deposit.create({
    userId: req.user.id,
    userEmail: req.user.email,
    phone, amount, transactionCode: code, message, status: "pending"
  });
  res.json({ message: "Deposit submitted for approval" });
});

// ================= ADMIN ROUTES =================
app.get("/api/admin/users", auth, isAdmin, async (req, res) => {
  const users = await User.find({}, "-password");
  res.json(users);
});

app.get("/api/admin/deposits", auth, isAdmin, async (req, res) => {
  const deposits = await Deposit.find().sort({ createdAt: -1 });
  res.json(deposits);
});

app.post("/api/admin/approve-deposit", auth, isAdmin, async (req, res) => {
  const { depositId } = req.body;
  const dep = await Deposit.findById(depositId);
  if (!dep || dep.status === "approved") return res.status(400).json({ error: "Invalid" });

  const user = await User.findById(dep.userId);
  user.balance += Number(dep.amount);
  dep.status = "approved";

  await user.save();
  await dep.save();
  res.json({ message: "Approved" });
});

app.get("/api/admin/orders", auth, isAdmin, async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.json(orders);
});

// START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server Port:", PORT));
