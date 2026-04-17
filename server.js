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

// ================= VALIDATE ENV =================
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET missing in environment variables");
  process.exit(1);
}

// ================= INIT =================
const app = express();
app.use(cors());
app.use(express.json());

connectDB();
log("Server starting...");

// ================= CURRENCY CONFIG =================
const USD_TO_KSH = 160;

// ================= AUTH MIDDLEWARE =================
function auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "No token provided" });

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
    .replace(/^TTF\d+\s*/i, "")
    .replace(/^TTV\d+\s*/i, "")
    .replace(/^TTL\d+\s*/i, "")
    .replace(/\[.*?\]/g, "")
    .trim();
}

function detectPlatform(cat = "") {
  cat = String(cat).toLowerCase();

  if (cat.includes("instagram")) return "Instagram";
  if (cat.includes("tiktok")) return "TikTok";
  if (cat.includes("youtube")) return "YouTube";
  if (cat.includes("facebook")) return "Facebook";
  if (cat.includes("twitter") || cat.includes("x")) return "Twitter/X";

  return "Other";
}

// ================= CURRENCY DETECTION =================
function detectCurrency(rate) {
  rate = Number(rate);

  // Very small values usually = USD
  if (rate > 0 && rate < 2) return "USD";

  return "KES";
}

function toKsh(rate, currency) {
  rate = Number(rate);

  if (currency === "USD") {
    return rate * USD_TO_KSH;
  }

  return rate;
}

// ================= PRICE MARKUP SYSTEM =================
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

// ================= ORDER COST =================
function calculateCost(rate, qty) {
  return (applyMarkup(rate) / 1000) * qty;
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 SMM Backend Running");
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, phone } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "User already exists" });

    await User.create({ email, password, phone });

    res.json({ message: "Registered successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed to load user" });
  }
});

// ================= MPESA =================
async function getMpesaToken() {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const res = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${auth}` } }
  );

  return res.data.access_token;
}

app.post("/api/mpesa/stk", auth, async (req, res) => {
  try {
    const { phone, amount } = req.body;

    const token = await getMpesaToken();

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14);

    const password = Buffer.from(
      process.env.MPESA_SHORTCODE +
      process.env.MPESA_PASSKEY +
      timestamp
    ).toString("base64");

    await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: process.env.CALLBACK_URL,
        AccountReference: "SMM PANEL",
        TransactionDesc: "Deposit"
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    await Deposit.create({
      userId: req.user.id,
      phone,
      amount,
      status: "pending"
    });

    res.json({ message: "STK sent" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "STK failed" });
  }
});

app.post("/api/mpesa/callback", async (req, res) => {
  try {
    const cb = req.body?.Body?.stkCallback;

    if (cb?.ResultCode === 0) {
      const items = cb.CallbackMetadata.Item;

      const amount = items.find(i => i.Name === "Amount")?.Value;
      const phone = items.find(i => i.Name === "PhoneNumber")?.Value;

      const user = await User.findOne({ phone });

      if (user) {
        user.balance += Number(amount);
        await user.save();

        await Deposit.findOneAndUpdate(
          { phone, amount, status: "pending" },
          { status: "completed" }
        );
      }
    }

    res.sendStatus(200);
  } catch {
    res.sendStatus(500);
  }
});

// ================= SERVICES =================
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find({ status: "active" });

    if (!services.length) {
      console.log("⚠️ Fetching provider services...");

      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url, { timeout: 20000 });

      const raw = response.data;
      const list = Array.isArray(raw) ? raw : Object.values(raw);

      const formatted = list
        .map(s => {
          let rawRate = Number(s.rate || s.cost || 0);

          const currency = detectCurrency(rawRate);
          const baseRate = toKsh(rawRate, currency);

          return {
            serviceId: String(s.service || s.id || ""),
            name: cleanName(s.name || s.title || ""),

            rate: baseRate,
            sellingRate: applyMarkup(baseRate),

            min: Number(s.min || 1),
            max: Number(s.max || 100000),

            category: s.category || "Other",
            platform: detectPlatform(s.category || "")
          };
        })
        .filter(s => s.serviceId && s.name);

      await Service.bulkWrite(
        formatted.map(s => ({
          updateOne: {
            filter: { serviceId: s.serviceId },
            update: { $set: s },
            upsert: true
          }
        }))
      );

      services = formatted;
    }

    const grouped = {};

    services.forEach(s => {
      const platform = s.platform || "Other";

      if (!grouped[platform]) grouped[platform] = [];

      grouped[platform].push({
        serviceId: s.serviceId,
        name: s.name,
        rate: Number(s.sellingRate).toFixed(2),
        min: s.min,
        max: s.max,
        category: s.category
      });
    });

    res.json({ success: true, data: grouped });

  } catch (err) {
    console.error("SERVICES ERROR:", err.message);

    res.status(500).json({
      success: false,
      error: "Failed to load services",
      details: err.message
    });
  }
});

// ================= ORDER =================
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Service not found" });

    const cost = calculateCost(service.rate, quantity);

    const user = await User.findById(req.user.id);

    if (user.balance < cost) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const response = await smmRequest({
      action: "add",
      service: serviceId,
      link,
      quantity
    });

    if (!response?.order) {
      return res.status(500).json({ error: "SMM API failed" });
    }

    user.balance -= cost;
    await user.save();

    const order = await Order.create({
      userId: user._id,
      service: service.name,
      link,
      quantity,
      smmOrderId: response.order,
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

// ================= ORDERS =================
app.get("/api/orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id });
    res.json(orders);
  } catch {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on", PORT);
  log("Server running");
});
