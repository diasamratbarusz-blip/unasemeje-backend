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
console.log("--- UNASEMEJE ø DIA PROVIDER STATUS ---");
console.log("P1 (Delixgains):", "https://delixgainske.com/api/v2", process.env.SMM_API_KEY ? "✅" : "❌");

const app = express();

/**
 * =========================================
 * MIDDLEWARE & CONFIG
 * =========================================
 */
app.use(cors({
  origin: ["https://unasemeje-frontend.vercel.app", "http://localhost:3000", "http://localhost:5000"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); 

const ADMIN_EMAIL = "diasamratbarusz@gmail.com";
const ADMIN_PHONE = "0715509440";

// Connect to MongoDB
connectDB();
log("UNASEMEJE ø DIA - Server starting...");

/**
 * =========================================
 * PAGE ROUTES
 * =========================================
 */
const pages = ["home", "platform", "packages", "new-order", "my-orders", "services", "add-funds", "referrals", "order-placed"];
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => res.sendFile(path.join(__dirname, "public", `${page}.html`)));
});

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
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * =========================================
 * BUSINESS LOGIC UTILS
 * =========================================
 */
function generateReferralCode() { return crypto.randomBytes(4).toString("hex"); }

async function giveReferralBonus(userId, orderCost) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.referredBy) return;
    const referrer = await User.findOne({ referralCode: user.referredBy });
    if (!referrer) return;
    const bonus = orderCost * 0.10; // ✅ 10% Referral Bonus
    referrer.balance += bonus;
    referrer.referralEarnings = (referrer.referralEarnings || 0) + bonus;
    await referrer.save();
    log(`Referral bonus of KES ${bonus} given to ${referrer.username}`);
  } catch (err) { log("Referral Bonus Error: " + err.message); }
}

function cleanServiceName(name = "") {
  return String(name || "").replace(/\[.*?\]/g, "").trim() || "SMM Service";
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

function applyFinalPrice(originalRate, name) {
  const t = String(name).toLowerCase();
  let markup = 40; 
  if (t.includes("like")) markup = 30;
  if (t.includes("follower")) markup = 25;
  if (t.includes("view")) markup = 35;
  return Number((Number(originalRate || 0) + markup).toFixed(2));
}

/**
 * =========================================
 * API ENDPOINTS
 * =========================================
 */

// REGISTER - Strictly Email, Password, Phone
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password, phone, referralCode } = req.body;
    const exists = await User.findOne({ $or: [{ email: email?.toLowerCase() }, { phone }, { username: username?.toLowerCase() }] });
    if (exists) return res.status(400).json({ error: "Account already exists (Email/Phone/Username)" });

    const newUser = await User.create({
      username: username?.toLowerCase(),
      email: email?.toLowerCase(), 
      password, 
      phone,
      referralCode: generateReferralCode(),
      referredBy: referralCode || null,
      balance: 0
    });
    res.json({ success: true, message: "Registration successful", referralCode: newUser.referralCode });
  } catch (err) { res.status(500).json({ error: "Registration failed" }); }
});

// LOGIN - Support for Email/Username (No Google)
app.post("/api/login", async (req, res) => {
  try {
    const { identifier, password } = req.body; 
    const user = await User.findOne({ 
      $or: [{ email: identifier?.toLowerCase() }, { username: identifier?.toLowerCase() }], 
      password 
    });
    
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, email: user.email, username: user.username }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, balance: user.balance });
  } catch (err) { res.status(500).json({ error: "Login failed" }); }
});

// GET SERVICES - Sync with Delixgains
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();
    if (!services.length) {
      const url = `https://delixgainske.com/api/v2?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url);
      const list = Array.isArray(response.data) ? response.data : [];

      const mapped = list.map(s => ({
        serviceId: String(s.service),
        name: cleanServiceName(s.name),
        rate: Number(s.rate || 0),
        min: Number(s.min || 1),
        max: Number(s.max || 10000),
        category: s.category || "General",
        platform: detectPlatform(s),
        provider: "DELIXGAINS"
      }));

      if (mapped.length > 0) {
          await Service.deleteMany({});
          await Service.insertMany(mapped);
          services = await Service.find();
      }
    }

    const grouped = {};
    services.forEach(s => {
      const p = s.platform;
      const c = s.category;
      if (!grouped[p]) grouped[p] = {};
      if (!grouped[p][c]) grouped[p][c] = [];
      grouped[p][c].push({ ...s.toObject(), rate: applyFinalPrice(s.rate, s.name) });
    });
    res.json({ success: true, data: grouped });
  } catch (err) { res.status(500).json({ error: "Failed to load services" }); }
});

// PLACE ORDER
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;
    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Service unavailable" });

    const user = await User.findById(req.user.id);
    const totalCost = (applyFinalPrice(service.rate, service.name) / 1000) * Number(quantity);

    if (user.balance < totalCost) return res.status(400).json({ error: `Insufficient balance. Need KES ${totalCost.toFixed(2)}` });

    const providerUrl = `https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${quantity}`;
    const providerRes = await axios.get(providerUrl);
    
    if (providerRes.data && providerRes.data.order) {
        const order = await Order.create({
            userId: user._id, 
            serviceId, 
            serviceName: service.name, 
            orderId: String(providerRes.data.order), 
            link, quantity, cost: totalCost, status: "pending"
        });

        user.balance -= totalCost;
        await user.save();
        await giveReferralBonus(user._id, totalCost);

        res.json({ success: true, orderId: order.orderId, newBalance: user.balance.toFixed(2) });
    } else { 
        res.status(400).json({ error: providerRes.data.error || "Provider error. Check link/quantity." }); 
    }
  } catch (err) { 
    log.error("Order Error: " + err.message);
    res.status(500).json({ error: "Provider communication error." }); 
  }
});

// SYNC HISTORY - Enhanced for Delixgains response format
app.get("/api/sync-orders", auth, async (req, res) => {
  try {
    const activeOrders = await Order.find({ 
      userId: req.user.id, 
      status: { $nin: ["completed", "canceled", "partial"] } 
    });

    if (activeOrders.length > 0) {
        const ids = activeOrders.map(o => o.orderId).join(",");
        const url = `https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=status&orders=${ids}`;
        const response = await axios.get(url);
        
        for (let orderId in response.data) {
            const data = response.data[orderId];
            if (data && typeof data === 'object' && data.status) {
                await Order.findOneAndUpdate({ orderId }, { status: data.status.toLowerCase() });
            }
        }
    }
    const updated = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: "Failed to sync orders" }); }
});

// DEPOSIT
app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, transactionCode } = req.body;
    const exists = await Deposit.findOne({ transactionCode: transactionCode.toUpperCase() });
    if (exists) return res.status(400).json({ error: "Code already submitted" });

    await Deposit.create({
      userId: req.user.id, 
      amount: Number(amount),
      transactionCode: transactionCode.toUpperCase(), 
      status: "pending"
    });
    res.json({ success: true, message: "Deposit verification pending." });
  } catch (error) { res.status(500).json({ error: "Submission failed" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 UNASEMEJE ø DIA - Online on port ${PORT}`));
