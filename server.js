// ================= IMPORTS =================
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// ================= DB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ DB connected"))
  .catch(err => console.log("DB error:", err));

// ================= MODELS =================
const User = require("./models/User");
const Order = require("./models/Order");
const Deposit = require("./models/Deposit");
const Service = require("./models/Service");

// ================= CONFIG =================
const ADMIN_EMAIL = "diasamratbarusz@gmail.com";

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

// ================= ADMIN =================
function adminOnly(req, res, next) {
  if (req.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

// ================= HELPERS =================
function cleanName(name = "") {
  return String(name)
    .replace(/\[.*?\]/g, "")
    .replace(/^TT.*?\s/i, "")
    .trim();
}

// ================= PLATFORM DETECTION (SMART + PRICE) =================
function detectPlatform(service = {}) {
  const text = `${service.name || ""} ${service.category || ""}`.toLowerCase();
  const rate = Number(service.rate || 0);

  if (text.includes("instagram") || text.includes("ig")) return "Instagram";
  if (text.includes("tiktok") || text.includes("tt")) return "TikTok";
  if (text.includes("youtube") || text.includes("yt")) return "YouTube";
  if (text.includes("facebook") || text.includes("fb")) return "Facebook";

  // PRICE BASED FALLBACK
  if (rate > 0 && rate < 5) return "TikTok";
  if (rate >= 5 && rate < 20) return "Instagram";
  if (rate >= 20 && rate < 60) return "YouTube";

  return "Other";
}

// ================= COST =================
function calculateCost(rate, qty) {
  return (Number(rate) / 1000) * Number(qty);
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 SMM Backend Running");
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  const { email, password, phone } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return res.json({ error: "User exists" });

  await User.create({ email, password, phone });

  res.json({ message: "Registered" });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, password });
  if (!user) return res.json({ error: "Invalid login" });

  const token = jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
});

// ================= MPESA MESSAGE DEPOSIT =================
function extractMpesa(message) {
  const code = message.match(/[A-Z0-9]{8,12}/)?.[0];
  const amount = message.match(/Ksh\s?([\d,]+)/i)?.[1];
  const phone = message.match(/(\d{10,12})/)?.[0];

  return {
    code,
    amount: amount ? Number(amount.replace(/,/g, "")) : 0,
    phone
  };
}

app.post("/api/deposit", auth, async (req, res) => {
  const { message } = req.body;

  const data = extractMpesa(message);

  if (!data.code) {
    return res.json({ error: "Invalid M-Pesa message" });
  }

  const exists = await Deposit.findOne({ transactionCode: data.code });
  if (exists) {
    return res.json({ error: "Transaction already used" });
  }

  await Deposit.create({
    userId: req.user.id,
    phone: data.phone,
    amount: data.amount,
    transactionCode: data.code,
    proof: message,
    status: "pending"
  });

  res.json({ message: "Deposit submitted for approval" });
});

// ================= ADMIN DEPOSITS =================
app.get("/api/admin/deposits", auth, adminOnly, async (req, res) => {
  const deposits = await Deposit.find().sort({ createdAt: -1 });
  res.json(deposits);
});

// ================= ADMIN APPROVE =================
app.post("/api/admin/approve", auth, adminOnly, async (req, res) => {
  const { id } = req.body;

  const dep = await Deposit.findById(id);
  if (!dep || dep.status === "approved") {
    return res.json({ error: "Invalid request" });
  }

  const user = await User.findById(dep.userId);
  user.balance += dep.amount;
  await user.save();

  dep.status = "approved";
  await dep.save();

  res.json({ message: "Deposit approved" });
});

// ================= SERVICES (GROUPED + PRICE DETECT) =================
app.get("/api/services", async (req, res) => {
  try {
    let services = await Service.find();

    if (!services.length) {
      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url);

      const list = Array.isArray(response.data)
        ? response.data
        : Object.values(response.data);

      services = list.map(s => ({
        serviceId: String(s.service || s.id),
        name: cleanName(s.name),
        rate: Number(s.rate || 0),
        category: s.category,
        platform: detectPlatform({
          name: s.name,
          category: s.category,
          rate: s.rate
        })
      }));

      await Service.deleteMany({});
      await Service.insertMany(services);
    }

    const grouped = {};

    services.forEach(s => {
      if (!grouped[s.platform]) grouped[s.platform] = [];

      grouped[s.platform].push({
        serviceId: s.serviceId,
        name: s.name,
        rate: s.rate,
        category: s.category
      });
    });

    res.json({ data: grouped });

  } catch (err) {
    res.status(500).json({ error: "Services failed" });
  }
});

// ================= ORDER =================
app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Not found" });

    const cost = calculateCost(service.rate, quantity);

    const user = await User.findById(req.user.id);

    if (user.balance < cost)
      return res.status(400).json({ error: "Insufficient balance" });

    user.balance -= cost;
    await user.save();

    const order = await Order.create({
      userId: user._id,
      service: service.name,
      link,
      quantity,
      cost
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
