// ================= IMPORTS & CONFIG =================
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

const app = express();

/**
 * =========================================
 * MIDDLEWARE
 * =========================================
 */
app.use(cors({
  origin: ["https://unasemeje-frontend.vercel.app", "http://localhost:3000", "http://localhost:5000"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); 

// Brand Constants
const ADMIN_EMAIL = "diasamratbarusz@gmail.com";
const ADMIN_PHONE = "0715509440";

// Database Connection
connectDB();
log("UNASEMEJE ø DIA - Server starting...");

/**
 * =========================================
 * AUTHENTICATION MIDDLEWARE
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
function generateReferralCode() { 
  return crypto.randomBytes(4).toString("hex"); 
}

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
  } catch (err) { 
    log("Referral Bonus Error: " + err.message); 
  }
}

function cleanServiceName(name = "") {
  return String(name || "").replace(/\[.*?\]/g, "").trim() || "SMM Service";
}

function detectPlatform(name = "", category = "") {
  const text = `${name} ${category}`.toLowerCase();
  if (/(instagram|insta|ig)/.test(text)) return "Instagram";
  if (/(tiktok|tik tok|tt)/.test(text)) return "TikTok";
  if (/(youtube|yt)/.test(text)) return "YouTube";
  if (/(facebook|fb)/.test(text)) return "Facebook";
  if (/(twitter|x)/.test(text)) return "Twitter/X";
  if (/(telegram|tg)/.test(text)) return "Telegram";
  return "Other";
}

/**
 * =========================================
 * AUTH ROUTES (STRICTLY NO GOOGLE)
 * =========================================
 */

// Registration
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password, phone, referralCode } = req.body;
    const exists = await User.findOne({ 
      $or: [
        { email: email?.toLowerCase() }, 
        { phone }, 
        { username: username?.toLowerCase() }
      ] 
    });
    
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
  } catch (err) { 
    res.status(500).json({ error: "Registration failed" }); 
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { identifier, password } = req.body; 
    const user = await User.findOne({ 
      $or: [{ email: identifier?.toLowerCase() }, { username: identifier?.toLowerCase() }], 
      password 
    });
    
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, email: user.email, username: user.username }, 
      process.env.JWT_SECRET, 
      { expiresIn: "7d" }
    );
    res.json({ token, balance: user.balance });
  } catch (err) { 
    res.status(500).json({ error: "Login failed" }); 
  }
});

/**
 * =========================================
 * SERVICE ROUTES (UNASEMEJE ø DIA MARKUP)
 * =========================================
 */
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find({ status: "active" });
    
    // Sync with Delixgains if DB is empty or refresh requested
    if (!services.length || req.query.refresh === "true") {
      const url = `https://delixgainske.com/api/v2?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url);
      const list = Array.isArray(response.data) ? response.data : [];

      if (list.length > 0) {
        // We use a loop with .save() or .create() so the Pre-Save markup logic triggers
        await Service.deleteMany({});
        for (const s of list) {
          await Service.create({
            serviceId: String(s.service),
            name: cleanServiceName(s.name),
            rate: Number(s.rate || 0),
            min: Number(s.min || 1),
            max: Number(s.max || 10000),
            category: s.category || "General",
            platform: detectPlatform(s.name, s.category),
            provider: "DELIXGAINS"
          });
        }
        services = await Service.find({ status: "active" });
      }
    }

    // Grouping for Frontend display
    const grouped = {};
    services.forEach(s => {
      const p = s.platform;
      const c = s.category;
      if (!grouped[p]) grouped[p] = {};
      if (!grouped[p][c]) grouped[p][c] = [];
      grouped[p][c].push(s);
    });

    res.json({ success: true, data: grouped });
  } catch (err) { 
    res.status(500).json({ error: "Failed to load services" }); 
  }
});

/**
 * =========================================
 * ORDER ROUTES
 * =========================================
 */
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;
    const service = await Service.findOne({ serviceId, status: "active" });
    if (!service) return res.status(404).json({ error: "Service unavailable" });

    const user = await User.findById(req.user.id);
    const totalCost = (service.sellingRate / 1000) * Number(quantity);

    if (user.balance < totalCost) {
      return res.status(400).json({ error: `Insufficient balance. KES ${totalCost.toFixed(2)} required.` });
    }

    // Provider Call (Delixgains)
    const providerUrl = `https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${quantity}`;
    const providerRes = await axios.get(providerUrl);
    
    if (providerRes.data && providerRes.data.order) {
        const order = await Order.create({
            userId: user._id, 
            serviceId, 
            serviceName: service.name, 
            orderId: String(providerRes.data.order), 
            link, 
            quantity, 
            cost: totalCost, 
            status: "pending",
            providerCharge: service.rate // Storing original rate for profit tracking
        });

        user.balance -= totalCost;
        await user.save();
        
        // Trigger 10% referral bonus
        await giveReferralBonus(user._id, totalCost);

        res.json({ success: true, orderId: order.orderId, newBalance: user.balance.toFixed(2) });
    } else { 
        res.status(400).json({ error: providerRes.data.error || "Provider error." }); 
    }
  } catch (err) { 
    res.status(500).json({ error: "Order fulfillment failed." }); 
  }
});

// Order Status Sync
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
        if (data?.status) {
          await Order.findOneAndUpdate({ orderId }, { 
            status: data.status.toLowerCase(),
            remains: data.remains,
            startCount: data.start_count
          });
        }
      }
    }
    const history = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(history);
  } catch (err) { 
    res.status(500).json({ error: "Failed to sync order history" }); 
  }
});

/**
 * =========================================
 * SERVER INITIALIZATION
 * =========================================
 */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
  🚀 UNASEMEJE ø DIA - Online
  -----------------------------------
  Port: ${PORT}
  Admin: ${ADMIN_EMAIL}
  Provider: Delixgains (Active)
  -----------------------------------
  `);
});
