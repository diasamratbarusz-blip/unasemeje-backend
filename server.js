// ================= IMPORTS =================
require("dotenv").config();

// ✅ DEBUG ENV VARIABLES (ADDED)
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

// ================= CONNECT DB =================
connectDB();
log("Server starting...");

// ================= AUTH MIDDLEWARE =================
function auth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ================= CLEAN SERVICE NAME =================
function cleanName(name = "") {
  return name
    .replace(/^TTF\d+\s*/i, "")
    .replace(/^TTV\d+\s*/i, "")
    .replace(/^TTL\d+\s*/i, "")
    .replace(/\[.*?\]/g, "")
    .trim();
}

// ================= PROFIT SYSTEM =================
function getProfitMargin(rate) {
  if (rate < 50) return 0.90;   // 90%
  if (rate < 200) return 0.60;  // 60%
  return 0.40;                  // 40%
}

function applyProfit(rate) {
  return Number((rate + rate * getProfitMargin(rate)).toFixed(2));
}

function calculateCost(rate, quantity) {
  const sellingRate = applyProfit(rate);
  return (sellingRate / 1000) * quantity;
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 Backend running successfully");
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, phone } = req.body;

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

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ================= USER =================
app.get("/api/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ================= MPESA TOKEN =================
async function getMpesaToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");

  const res = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${auth}` } }
  );

  return res.data.access_token;
}

// ================= MPESA STK =================
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

    res.json({ message: "STK push sent" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "STK failed" });
  }
});

// ================= CALLBACK =================
app.post("/api/mpesa/callback", async (req, res) => {
  try {
    const result = req.body?.Body?.stkCallback;

    if (result?.ResultCode === 0) {
      const items = result.CallbackMetadata.Item;

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
    let services = await Service.find();

    if (!services || services.length === 0) {

      console.log("⚠️ Fetching services from provider...");

      const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;
      const response = await axios.get(url, { timeout: 20000 });

      let raw = response.data;

      let list = Array.isArray(raw) ? raw : Object.values(raw);

      const formatted = list.map(s => ({
        serviceId: s.service,
        name: cleanName(s.name),

        baseRate: Number(s.rate),
        rate: applyProfit(Number(s.rate)),

        min: Number(s.min),
        max: Number(s.max),
        category: s.category || "Other"
      }));

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
      const cat = (s.category || "").toLowerCase();

      let platform = "Other";
      if (cat.includes("instagram")) platform = "Instagram";
      else if (cat.includes("tiktok")) platform = "TikTok";
      else if (cat.includes("youtube")) platform = "YouTube";
      else if (cat.includes("facebook")) platform = "Facebook";
      else if (cat.includes("twitter") || cat.includes("x")) platform = "Twitter/X";

      if (!grouped[platform]) grouped[platform] = [];

      grouped[platform].push({
        ...s,
        rate: Number(s.rate).toFixed(2)
      });
    });

    res.json({ success: true, data: grouped });

  } catch (err) {
    console.error("❌ SERVICES ERROR:", err.message);

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

    const cost = calculateCost(service.baseRate, quantity);

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

// ================= ADMIN =================
app.post("/api/admin/approve", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const d = await Deposit.findById(req.body.id);
    if (!d) return res.status(404).json({ error: "Not found" });

    const user = await User.findById(d.userId);

    user.balance += d.amount;
    await user.save();

    d.status = "approved";
    await d.save();

    res.json({ message: "Approved" });

  } catch {
    res.status(500).json({ error: "Approval failed" });
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  log(`Server running on port ${PORT}`);
});
