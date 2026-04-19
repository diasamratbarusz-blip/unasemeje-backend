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

const app = express();

app.use(cors());
app.use(express.json());

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

// ================= CLEAN NAME =================
function cleanName(name = "") {
  const cleaned = String(name || "")
    .replace(/^TTF\d+\s*/i, "")
    .replace(/^TTV\d+\s*/i, "")
    .replace(/^TTL\d+\s*/i, "")
    .replace(/\[.*?\]/g, "")
    .trim();

  return cleaned || "Service";
}

// ================= PLATFORM (FIXED STRONG DETECTION) =================
function detectPlatform(service = {}) {
  const text = `${service.name || ""} ${service.category || ""}`.toLowerCase();

  // 🔥 EXTENDED KEYWORDS (THIS FIXES YOUR ISSUE)
  if (
    text.includes("instagram") ||
    text.includes("ig ")
  ) return "Instagram";

  if (
    text.includes("tiktok") ||
    text.includes("tik tok")
  ) return "TikTok";

  if (
    text.includes("youtube") ||
    text.includes("yt ")
  ) return "YouTube";

  if (
    text.includes("facebook") ||
    text.includes("fb ")
  ) return "Facebook";

  if (
    text.includes("twitter") ||
    text.includes("tweet") ||
    text.includes("x.com")
  ) return "Twitter/X";

  if (text.includes("telegram")) return "Telegram";
  if (text.includes("whatsapp")) return "WhatsApp";
  if (text.includes("spotify")) return "Spotify";
  if (text.includes("threads")) return "Threads";

  return "Other";
}

// ================= MARKUP =================
function getMarkup(name = "") {
  const text = String(name).toLowerCase();

  if (text.includes("like")) return 30;
  if (text.includes("follower")) return 20;
  if (text.includes("view")) return 40;
  if (text.includes("save")) return 40;

  return 40;
}

// ================= PROFIT =================
function applyProviderRate(rate) {
  rate = Number(rate || 0);

  if (rate < 50) return rate * 1.8;
  if (rate < 200) return rate * 1.5;
  return rate * 1.3;
}

// ================= FINAL PRICE =================
function applyFinalPrice(rate, name) {
  const provider = applyProviderRate(rate);
  const markup = getMarkup(name);

  return {
    baseRate: Number(provider.toFixed(2)),
    rate: Number((provider + markup).toFixed(2))
  };
}

// ================= COST =================
function calculateCost(rate, qty) {
  return (Number(rate || 0) / 1000) * Number(qty || 0);
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 Backend Running Successfully");
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  const { email, password, phone } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: "User exists" });

  await User.create({ email, password, phone });

  res.json({ message: "Registered" });
});

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
  res.json(user);
});

// ================= SERVICES =================
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();

    if (!services.length) {
      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url, { timeout: 20000 });

      const raw = response.data;
      const list = Array.isArray(raw) ? raw : Object.values(raw || {});

      services = list.map((s, i) => {
        const safeName = cleanName(s.name);
        const pricing = applyFinalPrice(s.rate, safeName);

        return {
          serviceId: String(s.service || s.id || `srv_${i}`),
          name: safeName,
          baseRate: pricing.baseRate,
          rate: pricing.rate,
          min: Number(s.min || 1),
          max: Number(s.max || 10000),
          category: s.category || "Other",
          platform: detectPlatform(s) // ✅ NOW WORKS PROPERLY
        };
      });

      await Service.deleteMany({});
      await Service.insertMany(services);
    }

    // GROUP
    const grouped = {};

    services.forEach(s => {
      const platform = s.platform || "Other";
      const category = s.category || "General";

      if (!grouped[platform]) grouped[platform] = {};
      if (!grouped[platform][category]) grouped[platform][category] = [];

      grouped[platform][category].push({
        serviceId: s.serviceId,
        name: s.name,
        rate: Number(s.rate || 0).toFixed(2)
      });
    });

    res.json({ success: true, data: grouped });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Services failed" });
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

  res.json({ message: "Deposit submitted" });
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
  log("Server running on port " + PORT);
});
