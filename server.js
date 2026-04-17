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
  console.error("❌ JWT_SECRET missing");
  process.exit(1);
}

// ================= INIT =================
const app = express();
app.use(cors());
app.use(express.json());

connectDB();
log("Server starting...");

// ================= CONFIG =================
const USD_TO_KSH = 160;

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

// ================= CURRENCY =================
function detectCurrency(rate) {
  rate = Number(rate);

  if (rate > 0 && rate < 2) return "USD"; // small numbers → USD
  return "KES";
}

function toKsh(rate, currency) {
  rate = Number(rate);

  if (currency === "USD") return rate * USD_TO_KSH;
  return rate;
}

// ================= MARKUP =================
function applyMarkup(rate) {
  rate = Number(rate);

  if (rate < 10) return rate + 30;
  if (rate < 20) return rate + 30;
  if (rate < 30) return rate + 20;
  if (rate < 40) return rate + 16;
  if (rate < 50) return rate + 12;
  if (rate < 60) return rate + 12;
  if (rate < 70) return rate + 12;
  if (rate < 100) return rate + 15;

  return rate + 30;
}

// ✅ IMPORTANT: NO DOUBLE MARKUP HERE
function calculateCost(sellingRate, qty) {
  return (Number(sellingRate) / 1000) * qty;
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 Backend running");
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, phone } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Missing fields" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "User exists" });

    await User.create({ email, password, phone });

    res.json({ message: "Registered" });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });
    if (!user) return res.status(400).json({ error: "Invalid login" });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
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
  } catch {
    res.status(500).json({ error: "STK failed" });
  }
});

// ================= SERVICES =================
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();

    if (!services.length) {
      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url);

      const list = Array.isArray(response.data)
        ? response.data
        : Object.values(response.data);

      const formatted = list.map(s => {
        let rawRate = Number(s.rate || 0);

        const currency = detectCurrency(rawRate);
        const baseRate = toKsh(rawRate, currency);

        return {
          serviceId: String(s.service),
          name: cleanName(s.name),

          providerRate: baseRate,
          sellingRate: applyMarkup(baseRate),

          min: Number(s.min),
          max: Number(s.max),
          category: s.category || "Other",
          platform: detectPlatform(s.category)
        };
      });

      await Service.insertMany(formatted);
      services = formatted;
    }

    res.json({
      success: true,
      data: services.map(s => ({
        serviceId: s.serviceId,
        name: s.name,
        rate: s.sellingRate,
        min: s.min,
        max: s.max,
        category: s.category
      }))
    });

  } catch (err) {
    res.status(500).json({ error: "Services failed" });
  }
});

// ================= ORDER =================
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    const service = await Service.findOne({ serviceId });

    const cost = calculateCost(service.sellingRate, quantity);

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

    user.balance -= cost;
    await user.save();

    const order = await Order.create({
      userId: user._id,
      service: service.name,
      link,
      quantity,
      cost,
      smmOrderId: response.order
    });

    res.json({ message: "Order placed", order });

  } catch {
    res.status(500).json({ error: "Order failed" });
  }
});

// ================= ORDERS =================
app.get("/api/orders", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id });
  res.json(orders);
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on", PORT);
});
