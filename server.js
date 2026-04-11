// ================= IMPORTS =================
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const bcrypt = require("bcrypt");

const connectDB = require("./config/db");
const log = require("./utils/logger");
const smmRequest = require("./utils/smmApi");

// MODELS
const User = require("./models/User");
const Order = require("./models/Order");
const Deposit = require("./models/Deposit");

// ================= VALIDATE ENV =================
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET missing");
  process.exit(1);
}

// ================= INIT =================
const app = express();
app.use(cors());
app.use(express.json());

// ================= CONNECT DB =================
connectDB();
log("🚀 Server starting...");

// ================= AUTH MIDDLEWARE =================
function auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "No token" });

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 SMM Backend Running");
});

// ================= AUTH =================

// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, phone } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Missing fields" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "User exists" });

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      email,
      password: hashed,
      phone,
      balance: 0,
      role: "user"
    });

    res.json({ message: "Registered successfully" });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ================= USER =================
app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
});

// ================= SERVICES =================
app.get("/api/services", async (req, res) => {
  try {
    const services = await smmRequest.getServices();

    if (!services) {
      return res.status(500).json({ error: "Failed to fetch services" });
    }

    const formatted = services.map(s => ({
      serviceId: s.service,
      name: s.name,
      category: s.category,
      rate: Number(s.rate),
      min: s.min,
      max: s.max
    }));

    res.json(formatted);

  } catch (err) {
    res.status(500).json({ error: "Services error" });
  }
});

// ================= ORDER =================
function calculateCost(rate, quantity) {
  return (rate / 1000) * quantity;
}

app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    if (!serviceId || !link || !quantity)
      return res.status(400).json({ error: "Missing fields" });

    const service = await smmRequest.getServices();
    const selected = service.find(s => s.service == serviceId);

    if (!selected)
      return res.status(404).json({ error: "Service not found" });

    const user = await User.findById(req.user.id);

    const cost = calculateCost(selected.rate, quantity);

    if (user.balance < cost)
      return res.status(400).json({ error: "Insufficient balance" });

    // CREATE ORDER VIA PROVIDER
    const response = await smmRequest.createOrder(
      serviceId,
      link,
      quantity
    );

    if (!response || !response.order) {
      return res.status(500).json({ error: "SMM API failed" });
    }

    user.balance -= cost;
    await user.save();

    const order = await Order.create({
      userId: user._id,
      service: selected.name,
      link,
      quantity,
      smmOrderId: response.order,
      cost,
      status: "Pending"
    });

    res.json({
      message: "Order placed",
      order,
      balance: user.balance
    });

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

// ================= MPESA =================
async function getMpesaToken() {
  const auth = Buffer.from(
    process.env.MPESA_CONSUMER_KEY + ":" + process.env.MPESA_CONSUMER_SECRET
  ).toString("base64");

  const res = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    {
      headers: { Authorization: `Basic ${auth}` }
    }
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
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    await Deposit.create({
      userId: req.user.id,
      phone,
      amount,
      status: "pending"
    });

    res.json({ message: "STK sent" });

  } catch (err) {
    res.status(500).json({ error: "STK failed" });
  }
});

// ================= ADMIN =================
app.post("/api/admin/approve", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Unauthorized" });

    const d = await Deposit.findById(req.body.id);
    const user = await User.findById(d.userId);

    user.balance += d.amount;
    await user.save();

    d.status = "approved";
    await d.save();

    res.json({ message: "Approved" });

  } catch {
    res.status(500).json({ error: "Admin error" });
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
  log(`Server running on ${PORT}`);
});
