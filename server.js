// ================= IMPORTS =================
require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const path = require("path");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const log = require("./utils/logger");

// MODELS
const User = require("./models/User");
const Order = require("./models/Order");
const Deposit = require("./models/Deposit");
const Service = require("./models/Service");

// Log API status on boot
console.log("SMM_API_URL:", process.env.SMM_API_URL);
console.log("SMM_API_KEY:", process.env.SMM_API_KEY ? "Loaded ✅" : "Missing ❌");

const app = express();

/**
 * =========================================
 * MIDDLEWARE & CONFIG
 * =========================================
 */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); 

// ADMIN CREDENTIALS
const ADMIN_EMAIL = "diasamratbarusz@gmail.com";
const ADMIN_PHONE = "0715509440";

// CONNECT DB
connectDB();
log("Server starting...");

/**
 * =========================================
 * AUTHENTICATION HELPERS
 * =========================================
 */

function auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "Access denied. No token provided." });

    const token = header.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function isAdmin(req, res, next) {
  if (req.user && (req.user.email === ADMIN_EMAIL || req.user.phone === ADMIN_PHONE)) {
    next();
  } else {
    res.status(403).json({ error: "Access denied. Admin privileges required." });
  }
}

/**
 * =========================================
 * BUSINESS LOGIC UTILS
 * =========================================
 */

function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex");
}

async function giveReferralBonus(userId, orderCost) {
  const user = await User.findById(userId);
  if (!user || !user.referredBy) return;

  const referrer = await User.findOne({ referralCode: user.referredBy });
  if (!referrer) return;

  const bonus = orderCost * 0.10; 
  referrer.balance += bonus;
  referrer.referralEarnings = (referrer.referralEarnings || 0) + bonus;

  await referrer.save();
  log(`Referral bonus of ${bonus} given to ${referrer.email}`);
}

function cleanServiceName(name = "") {
  return String(name || "")
    .replace(/^TTF\d+\s*/i, "")
    .replace(/^TTV\d+\s*/i, "")
    .replace(/^TTL\d+\s*/i, "")
    .replace(/\[.*?\]/g, "")
    .trim() || "SMM Service";
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

function getMarkup(name = "") {
  const t = String(name).toLowerCase();
  if (t.includes("like")) return 30;
  if (t.includes("follower")) return 25;
  if (t.includes("view")) return 35;
  return 40; 
}

function applyFinalPrice(originalRate, name) {
  const markup = getMarkup(name);
  return Number((Number(originalRate || 0) + markup).toFixed(2));
}

/**
 * =========================================
 * USER & AUTH ROUTES
 * =========================================
 */

app.get("/", (req, res) => res.send("🚀 Unasemeje SMM Backend Operational"));

app.post("/api/register", async (req, res) => {
  try {
    const { email, password, phone, referralCode } = req.body;
    const exists = await User.findOne({ $or: [{ email }, { phone }] });
    if (exists) return res.status(400).json({ error: "Email or Phone already registered" });

    const newUser = await User.create({
      email, password, phone,
      referralCode: generateReferralCode(),
      referredBy: referralCode || null,
      balance: 0
    });
    res.json({ message: "Registration successful", referralCode: newUser.referralCode });
  } catch (err) { res.status(500).json({ error: "Registration failed" }); }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user._id, email: user.email, phone: user.phone },
    process.env.JWT_SECRET, { expiresIn: "7d" }
  );
  res.json({ token, balance: user.balance });
});

app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

/**
 * =========================================
 * SERVICES & ORDERS
 * =========================================
 */

app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();
    
    if (!services.length) {
      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url);
      const list = Array.isArray(response.data) ? response.data : Object.values(response.data).flat();

      services = list.map((s, i) => ({
        serviceId: String(s.service || s.id || i),
        name: cleanServiceName(s.name),
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
      
      const serviceObj = s.toObject ? s.toObject() : s;
      grouped[p][c].push({
        ...serviceObj,
        rate: applyFinalPrice(s.rate, s.name)
      });
    });
    res.json({ success: true, data: grouped });
  } catch (err) { 
    log("Service Fetch Error: " + err.message);
    res.status(500).json({ error: "Failed to load services" }); 
  }
});

// CORE: Order Placement with detail verification
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;
    
    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Service not found" });

    const userRate = applyFinalPrice(service.rate, service.name);
    const totalCost = (userRate / 1000) * Number(quantity);

    const user = await User.findById(req.user.id);
    if (user.balance < totalCost) {
      return res.status(400).json({ error: `Insufficient balance. Required: KES ${totalCost.toFixed(2)}` });
    }

    const providerUrl = `${process.env.SMM_API_URL}?key=${process.env.SMM_API_KEY}&action=add&service=${serviceId}&link=${link}&quantity=${quantity}`;
    const providerRes = await axios.get(providerUrl);
    
    if (!providerRes.data || providerRes.data.error) {
        return res.status(400).json({ error: providerRes.data.error || "Provider connection error" });
    }

    user.balance -= totalCost;
    await user.save();

    // The order object now matches exactly what the frontend dashboard expects
    const order = await Order.create({
      userId: user._id,
      serviceId: serviceId,
      serviceName: service.name, 
      orderId: providerRes.data.order,
      link: link,
      quantity: quantity,
      cost: totalCost,
      status: "pending"
    });

    await giveReferralBonus(user._id, totalCost);

    res.json({ 
      success: true, 
      message: "Order placed successfully", 
      orderId: order._id, 
      newBalance: user.balance 
    });

  } catch (err) { 
    log("Order Placement Error: " + err.message);
    res.status(500).json({ error: "Internal server error" }); 
  }
});

app.get("/api/orders", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(orders);
});

// SYNC: Ensures real-time status updates from the provider
app.get("/api/sync-orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ 
        userId: req.user.id, 
        status: { $in: ["pending", "processing", "inprogress", "Pending", "Processing", "In progress"] } 
    });

    for (let order of orders) {
      if (order.orderId) { 
        const url = `${process.env.SMM_API_URL}?key=${process.env.SMM_API_KEY}&action=status&order=${order.orderId}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.status) {
          order.status = response.data.status.toLowerCase();
          await order.save();
        }
      }
    }
    
    const updatedOrders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(updatedOrders);
  } catch (err) {
    res.status(500).json({ error: "Failed to sync orders" });
  }
});

app.post('/api/refill', auth, async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ error: "Order not found" });

        const url = `${process.env.SMM_API_URL}?key=${process.env.SMM_API_KEY}&action=refill&order=${order.orderId}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.refill || data.status === "success" || data.refill_id) {
            res.json({ success: true, message: "Refill request sent successfully!" });
        } else {
            res.json({ success: false, error: data.error || "Refill not available for this order yet." });
        }
    } catch (error) {
        log("Refill Error: " + error.message);
        res.status(500).json({ error: "Server error during refill request" });
    }
});

/**
 * =========================================
 * PAYMENTS & ADMIN
 * =========================================
 */

app.post("/api/deposit", auth, async (req, res) => {
  const { message, phone, amount } = req.body;
  const code = message?.match(/[A-Z0-9]{8,12}/)?.[0];
  
  if (!code) return res.status(400).json({ error: "Invalid transaction code" });

  const exists = await Deposit.findOne({ transactionCode: code });
  if (exists) return res.status(400).json({ error: "Code already claimed" });

  await Deposit.create({
    userId: req.user.id,
    userEmail: req.user.email,
    phone, amount, transactionCode: code, message, status: "pending"
  });
  res.json({ message: "Deposit submitted for verification." });
});

app.post("/api/admin/approve-deposit", auth, isAdmin, async (req, res) => {
  const { depositId } = req.body;
  const dep = await Deposit.findById(depositId);
  if (!dep || dep.status === "approved") return res.status(400).json({ error: "Invalid deposit" });

  const user = await User.findById(dep.userId);
  if (user) {
    user.balance += Number(dep.amount);
    await user.save();
  }
  
  dep.status = "approved";
  await dep.save();
  res.json({ message: "Deposit approved" });
});

app.get("/api/admin/users", auth, isAdmin, async (req, res) => {
  const users = await User.find({}, "-password");
  res.json(users);
});

/**
 * =========================================
 * START SERVER
 * =========================================
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
