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

// ADMIN CREDENTIALS
const ADMIN_EMAIL = "diasamratbarusz@gmail.com";
const ADMIN_PHONE = "0715509440";

// CONNECT DB
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
 * USER & AUTH ROUTES
 * =========================================
 */

app.get("/", (req, res) => res.send("🚀 UNASEMEJE ø DIA SMM Backend Operational"));

app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password, phone, referralCode } = req.body;
    
    const exists = await User.findOne({ 
      $or: [{ email }, { phone }, { username: username?.toLowerCase() }] 
    });
    
    if (exists) return res.status(400).json({ error: "Account already exists" });

    const newUser = await User.create({
      username: username?.toLowerCase(),
      email, 
      password, 
      phone,
      referralCode: generateReferralCode(),
      referredBy: referralCode || null,
      balance: 0
    });
    res.json({ message: "Registration successful", referralCode: newUser.referralCode });
  } catch (err) { 
    log("Registration Error: " + err.message);
    res.status(500).json({ error: "Registration failed" }); 
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { identifier, password } = req.body; 
    
    const user = await User.findOne({ 
      $or: [
          { email: identifier?.toLowerCase() }, 
          { username: identifier?.toLowerCase() }
      ],
      password 
    });

    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, email: user.email, phone: user.phone, username: user.username },
      process.env.JWT_SECRET, { expiresIn: "7d" }
    );
    res.json({ token, balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
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
      const url1 = `https://delixgainske.com/api/v2?action=services&key=${process.env.SMM_API_KEY}`;
      const response1 = await axios.get(url1);
      const list1 = Array.isArray(response1.data) ? response1.data : Object.values(response1.data).flat();

      const p1Mapped = list1.map((s, i) => ({
        serviceId: String(s.service || s.id || i),
        name: cleanServiceName(s.name),
        rate: Number(s.rate || 0),
        min: Number(s.min || 1),
        max: Number(s.max || 10000),
        category: s.category || "General",
        platform: detectPlatform(s),
        provider: "PROVIDER1"
      }));

      let p2Mapped = [];
      if (process.env.API_KEY_PROVIDER2) {
        const response2 = await axios.post(process.env.API_URL_PROVIDER2 || "https://smm.africa/api/v3", {
           key: process.env.API_KEY_PROVIDER2,
           action: "services"
        });
        const list2 = Array.isArray(response2.data) ? response2.data : [];
        p2Mapped = list2.map(s => ({
          serviceId: String(s.service),
          name: cleanServiceName(s.name),
          rate: Number(s.rate || 0),
          min: Number(s.min || 1),
          max: Number(s.max || 10000),
          category: s.category || "General",
          platform: detectPlatform(s),
          provider: "PROVIDER2"
        }));
      }

      await Service.deleteMany({});
      await Service.insertMany([...p1Mapped, ...p2Mapped]);
      services = await Service.find();
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
    log.error("Service Fetch Error: " + err.message);
    res.status(500).json({ error: "Failed to load services" }); 
  }
});

app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;
    
    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Service not found" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const userRate = applyFinalPrice(service.rate, service.name);
    const totalCost = (userRate / 1000) * Number(quantity);

    if (user.balance < totalCost) {
      return res.status(400).json({ error: `Insufficient balance.` });
    }

    let providerRes;
    const providerType = service.provider || "PROVIDER1";

    try {
        if (providerType === "PROVIDER2") {
            providerRes = await axios.post(process.env.API_URL_PROVIDER2, {
                key: process.env.API_KEY_PROVIDER2,
                action: "add",
                service: serviceId,
                link: link,
                quantity: quantity
            });
        } else {
            // Delixgains URL matches your provided documentation
            const providerUrl = `https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=add&service=${serviceId}&link=${link}&quantity=${quantity}`;
            providerRes = await axios.get(providerUrl);
        }
    } catch (apiErr) {
        log.error("API Connection Error: " + apiErr.message);
        return res.status(500).json({ error: "Provider is currently unreachable." });
    }
    
    const pData = providerRes.data;
    // Delixgains returns { "order": 1 }
    if (!pData || (!pData.order && !pData.id)) {
        log.error("Provider Rejection: " + JSON.stringify(pData));
        return res.status(400).json({ error: pData.error || "Provider rejected the order." });
    }

    const providerOrderId = String(pData.order || pData.id);

    user.balance -= totalCost;
    user.totalSpent = (user.totalSpent || 0) + totalCost;
    user.totalOrders = (user.totalOrders || 0) + 1;
    await user.save();

    const order = await Order.create({
      userId: user._id,
      serviceId: serviceId,
      serviceName: service.name, 
      orderId: providerOrderId, 
      link: link,
      quantity: quantity,
      cost: totalCost,
      status: "pending",
      provider: providerType
    });

    await giveReferralBonus(user._id, totalCost);

    res.json({ 
      success: true, 
      orderId: order.orderId, 
      newBalance: user.balance 
    });

  } catch (err) { 
    log.error("Critical Order Error: " + err.message);
    res.status(500).json({ error: "Server error during order." }); 
  }
});

app.get("/api/sync-orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ 
        userId: req.user.id, 
        status: { $in: ["pending", "processing", "inprogress", "Pending", "Partial", "partial"] } 
    });

    for (let order of orders) {
      let response;
      if (order.provider === "PROVIDER2") {
          response = await axios.post(process.env.API_URL_PROVIDER2, {
              key: process.env.API_KEY_PROVIDER2,
              action: "status",
              order: order.orderId
          });
      } else {
          const url = `https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=status&order=${order.orderId}`;
          response = await axios.get(url);
      }
      
      const data = response.data;
      if (data && data.status) {
        order.status = data.status; 
        order.remains = data.remains || order.remains;
        order.startCount = data.start_count || order.startCount;
        await order.save();
      }
    }
    
    const updatedOrders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(updatedOrders);
  } catch (err) {
    res.status(500).json({ error: "Sync failed" });
  }
});

app.post('/api/refill', auth, async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ error: "Order not found" });

        let response;
        const url = `https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=refill&order=${order.orderId}`;
        response = await axios.get(url);

        if (response.data.refill || response.data.status === "success") {
            res.json({ success: true, message: "Refill request sent!" });
        } else {
            res.json({ success: false, error: "Refill not available yet." });
        }
    } catch (error) {
        res.status(500).json({ error: "Refill error" });
    }
});

/**
 * =========================================
 * PAYMENTS & ADMIN
 * =========================================
 */

app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { message, amount } = req.body;
    const codeMatch = message?.match(/[A-Z0-9]{8,12}/);
    let extractedCode = codeMatch ? codeMatch[0] : req.body.transactionCode;
    
    if (!extractedCode) return res.status(400).json({ error: "Invalid M-Pesa code." });

    const exists = await Deposit.findOne({ transactionCode: extractedCode.toUpperCase() });
    if (exists) return res.status(400).json({ error: "Code already used." });

    await Deposit.create({
      userId: req.user.id,
      amount: Number(amount),
      transactionCode: extractedCode.toUpperCase(),
      message: message,
      status: "pending"
    });
    res.json({ success: true, message: "Deposit submitted for approval." });
  } catch (error) {
    res.status(500).json({ error: "Deposit failed." });
  }
});

app.get("/api/admin/deposits", auth, isAdmin, async (req, res) => {
  const deposits = await Deposit.find({ status: "pending" }).sort({ createdAt: -1 });
  res.json(deposits);
});

app.post("/api/admin/approve-deposit", auth, isAdmin, async (req, res) => {
  try {
    const { depositId } = req.body;
    const dep = await Deposit.findById(depositId);
    if (!dep || dep.status === "approved") return res.status(400).json({ error: "Invalid deposit." });

    const user = await User.findById(dep.userId);
    user.balance += Number(dep.amount);
    await user.save();
    
    dep.status = "approved";
    await dep.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Approval error." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 UNASEMEJE ø DIA running on port ${PORT}`));
