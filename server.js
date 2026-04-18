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

// ================= VALIDATE =================
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
const CACHE_TIME = 5 * 60 * 1000;
let lastFetch = 0;

// ================= AUTH =================
function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });

    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ================= HELPERS =================
function cleanName(name = "") {
  return String(name)
    .replace(/\[.*?\]/g, "")
    .replace(/^TT.*?\s/i, "")
    .trim();
}

// ================= SMART PLATFORM DETECTION =================
function detectPlatform(service = {}) {
  const text = `
    ${service.name || ""}
    ${service.category || ""}
  `.toLowerCase();

  const rate = Number(service.rate || service.cost || 0);

  // TEXT BASED (MOST ACCURATE)
  if (text.includes("instagram") || text.includes("ig")) return "Instagram";
  if (text.includes("tiktok") || text.includes("tt")) return "TikTok";
  if (text.includes("youtube") || text.includes("yt")) return "YouTube";
  if (text.includes("facebook") || text.includes("fb")) return "Facebook";
  if (text.includes("twitter") || text.includes("x")) return "Twitter/X";

  // PRICE FALLBACK (SECONDARY SIGNAL)
  if (rate > 0 && rate < 5) return "TikTok/Instagram";
  if (rate >= 5 && rate < 20) return "Instagram";
  if (rate >= 20 && rate < 60) return "YouTube";
  if (rate >= 60) return "Facebook/Other";

  return "Other";
}

// ================= CURRENCY DETECTION =================
function detectCurrency(rate, text = "") {
  text = String(text).toLowerCase();

  if (text.includes("usd")) return "USD";
  if (text.includes("ksh") || text.includes("kes")) return "KES";

  rate = Number(rate);

  if (rate > 0 && rate < 5) return "USD";

  return "KES";
}

// ================= CONVERT =================
function toKsh(rate, currency) {
  rate = Number(rate);
  return currency === "USD" ? rate * USD_TO_KSH : rate;
}

// ================= MARKUP =================
function applyMarkup(rate) {
  rate = Number(rate);

  if (rate < 10) return rate + 30;
  if (rate < 20) return rate + 30;
  if (rate < 30) return rate + 20;
  if (rate < 40) return rate + 16;
  if (rate < 50) return rate + 12;
  if (rate < 70) return rate + 12;
  if (rate < 100) return rate + 15;

  return rate + 30;
}

// ================= COST (FIXED) =================
function calculateCost(rate, qty) {
  return (Number(rate) / 1000) * Number(qty);
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 SMM Backend Running");
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, phone } = req.body;

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
    process.env.MPESA_CONSUMER_KEY + ":" + process.env.MPESA_CONSUMER_SECRET
  ).toString("base64");

  const res = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: "Basic " + auth } }
  );

  return res.data.access_token;
}

app.post("/api/mpesa/stk", auth, async (req, res) => {
  try {
    const { phone, amount } = req.body;

    const token = await getMpesaToken();

    await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Amount: amount,
        PartyA: phone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: process.env.CALLBACK_URL,
        AccountReference: "SMM PANEL",
        TransactionDesc: "Deposit"
      },
      { headers: { Authorization: "Bearer " + token } }
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

// ================= SERVICES (CLEAN + GROUPED + FAST) =================
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();
    const now = Date.now();

    if (!services.length || now - lastFetch > CACHE_TIME) {
      console.log("⚡ Fetching provider services...");

      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url, { timeout: 20000 });

      const list = Array.isArray(response.data)
        ? response.data
        : Object.values(response.data);

      const formatted = list
        .map(s => {
          const rawRate = Number(s.rate || s.cost || s.price || 0);

          const currency = detectCurrency(rawRate, s.name);
          const kshRate = toKsh(rawRate, currency);

          const sellingRate = applyMarkup(kshRate);

          return {
            serviceId: String(s.service || s.id || ""),
            name: cleanName(s.name || "Service"),

            providerRate: rawRate,
            currency,

            rate: kshRate,
            sellingRate,

            min: Number(s.min || 1),
            max: Number(s.max || 100000),

            category: s.category || "Other",
            platform: detectPlatform(s)
          };
        })
        .filter(s => s.serviceId && s.name);

      await Service.deleteMany({});
      await Service.insertMany(formatted);

      services = formatted;
      lastFetch = now;
    }

    // ================= GROUP BY PLATFORM =================
    const grouped = {};

    services.slice(0, 500).forEach(s => {
      if (!grouped[s.platform]) grouped[s.platform] = [];

      grouped[s.platform].push({
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
    res.status(500).json({ error: "Failed to load services" });
  }
});

// ================= ORDER =================
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Not found" });

    const cost = calculateCost(service.sellingRate, quantity);

    const user = await User.findById(req.user.id);

    if (user.balance < cost)
      return res.status(400).json({ error: "Insufficient balance" });

    const smm = await smmRequest({
      action: "add",
      service: serviceId,
      link,
      quantity
    });

    if (!smm?.order)
      return res.status(500).json({ error: "Provider failed" });

    user.balance -= cost;
    await user.save();

    const order = await Order.create({
      userId: user._id,
      service: service.name,
      link,
      quantity,
      smmOrderId: smm.order,
      cost
    });

    res.json({ message: "Order placed", order });

  } catch (err) {
    console.error(err);
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
  log("Server running");
});
