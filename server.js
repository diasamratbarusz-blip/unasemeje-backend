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

// Log API status on boot - Verified for UNASEMEJE ø DIA
console.log("--- UNASEMEJE ø DIA PROVIDER STATUS ---");
console.log("P1 (Delixgains):", "https://delixgainske.com/api/v2", process.env.SMM_API_KEY ? "✅" : "❌");
console.log("P2 (SMM Africa):", process.env.API_URL_PROVIDER2 || "https://smm.africa/api/v3", process.env.API_KEY_PROVIDER2 ? "✅" : "❌");

const app = express();

/**
 * =========================================
 * MIDDLEWARE & CONFIG
 * =========================================
 */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); 

const ADMIN_EMAIL = "diasamratbarusz@gmail.com";
const ADMIN_PHONE = "0715509440";

connectDB();
log("UNASEMEJE ø DIA - Server starting...");

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
  try {
    const user = await User.findById(userId);
    if (!user || !user.referredBy) return;

    const referrer = await User.findOne({ referralCode: user.referredBy });
    if (!referrer) return;

    const bonus = orderCost * 0.10; // 10% Referral Bonus
    referrer.balance += bonus;
    referrer.referralEarnings = (referrer.referralEarnings || 0) + bonus;

    await referrer.save();
    log(`Referral bonus of ${bonus} given to ${referrer.email}`);
  } catch (err) {
    log("Referral Bonus Error: " + err.message);
  }
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
 * ROUTES
 * =========================================
 */

app.get("/", (req, res) => res.send("🚀 UNASEMEJE ø DIA SMM Backend Operational"));

app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password, phone, referralCode } = req.body;
    const exists = await User.findOne({ $or: [{ email }, { phone }, { username: username?.toLowerCase() }] });
    if (exists) return res.status(400).json({ error: "Account already exists" });

    const newUser = await User.create({
      username: username?.toLowerCase(),
      email, password, phone,
      referralCode: generateReferralCode(),
      referredBy: referralCode || null,
      balance: 0
    });
    res.json({ message: "Registration successful", referralCode: newUser.referralCode });
  } catch (err) { 
    res.status(500).json({ error: "Registration failed" }); 
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { identifier, password } = req.body; 
    const user = await User.findOne({ $or: [{ email: identifier?.toLowerCase() }, { username: identifier?.toLowerCase() }], password });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, email: user.email, phone: user.phone, username: user.username }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();
    if (!services.length) {
      const url1 = `https://delixgainske.com/api/v2?action=services&key=${process.env.SMM_API_KEY}`;
      const response1 = await axios.get(url1);
      const list1 = Array.isArray(response1.data) ? response1.data : [];

      const p1Mapped = list1.map(s => ({
        serviceId: String(s.service),
        name: cleanServiceName(s.name),
        rate: Number(s.rate || 0),
        min: Number(s.min || 1),
        max: Number(s.max || 10000),
        category: s.category || "General",
        platform: detectPlatform(s),
        provider: "PROVIDER1"
      }));

      await Service.deleteMany({});
      await Service.insertMany(p1Mapped);
      services = await Service.find();
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
  } catch (err) { 
    res.status(500).json({ error: "Failed to load services" }); 
  }
});

// ORDER PLACEMENT - UPDATED FOR DELIXGAINS JSON RESPONSE
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;
    if (!serviceId || !link || !quantity) return res.status(400).json({ error: "Missing fields" });

    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Service not found" });

    const user = await User.findById(req.user.id);
    const totalCost = (applyFinalPrice(service.rate, service.name) / 1000) * Number(quantity);

    if (user.balance < totalCost) return res.status(400).json({ error: `Insufficient balance: KES ${totalCost.toFixed(2)}` });

    const providerUrl = `https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${quantity}`;
    const providerRes = await axios.get(providerUrl);
    
    // Delixgains Response: { "order": 1 }
    if (providerRes.data && providerRes.data.order) {
        const order = await Order.create({
            userId: user._id,
            serviceId: serviceId,
            serviceName: service.name, 
            orderId: String(providerRes.data.order), 
            link, quantity, cost: totalCost, status: "pending"
        });

        user.balance -= totalCost;
        await user.save();
        await giveReferralBonus(user._id, totalCost);

        res.json({ success: true, orderId: order.orderId, newBalance: user.balance });
    } else {
        res.status(400).json({ error: providerRes.data.error || "Provider error" });
    }
  } catch (err) { 
    res.status(500).json({ error: "Server error" }); 
  }
});

// SYNC HISTORY - UPDATED FOR DELIXGAINS MULTI-STATUS RESPONSE
app.get("/api/sync-orders", auth, async (req, res) => {
  try {
    const dbOrders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(15);
    const activeIds = dbOrders.filter(o => !["completed", "canceled"].includes(o.status)).map(o => o.orderId);

    if (activeIds.length > 0) {
        const url = `https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=status&orders=${activeIds.join(",")}`;
        const response = await axios.get(url);
        
        for (let order of dbOrders) {
            const update = response.data[order.orderId];
            if (update && update.status) {
                await Order.findByIdAndUpdate(order._id, {
                    status: update.status.toLowerCase(),
                    remains: update.remains,
                    startCount: update.start_count
                });
            }
        }
    }
    const finalOrders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(finalOrders);
  } catch (err) { res.status(500).json({ error: "Sync failed" }); }
});

app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, transactionCode } = req.body;
    if (!transactionCode) return res.status(400).json({ error: "Invalid code" });

    const exists = await Deposit.findOne({ transactionCode: transactionCode.toUpperCase() });
    if (exists) return res.status(400).json({ error: "Code already used" });

    await Deposit.create({
      userId: req.user.id,
      amount: Number(amount),
      transactionCode: transactionCode.toUpperCase(),
      status: "pending"
    });
    res.json({ success: true, message: "Deposit submitted" });
  } catch (error) { res.status(500).json({ error: "Deposit failed" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 UNASEMEJE ø DIA running on port ${PORT}`));
