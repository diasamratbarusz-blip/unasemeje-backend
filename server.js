require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const connectDB = require("./config/db");

// MODELS
const User = require("./models/User");
const Order = require("./models/Order");
const Deposit = require("./models/Deposit");
const Service = require("./models/Service");

// PROVIDER UTILS
const smmRequest = require("./utils/smmApi");

const app = express();

app.use(cors());
app.use(express.json());

connectDB();

// =====================================================
// AUTH MIDDLEWARE
// =====================================================
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

// =====================================================
// ROOT
// =====================================================
app.get("/", (req, res) => {
  res.send("🚀 SMM PANEL BACKEND RUNNING");
});

// =====================================================
// AUTH
// =====================================================

// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, phone } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Missing fields" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "User exists" });

    await User.create({ email, password, phone });

    res.json({ message: "Registered" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });
    if (!user) return res.status(400).json({ error: "Invalid login" });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET USER
app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
});

// =====================================================
// SERVICES
// =====================================================

// GET FROM DB
app.get("/api/services", async (req, res) => {
  const services = await Service.find();
  res.json(services);
});

// GET FROM PROVIDER DIRECT
app.get("/api/services/external", async (req, res) => {
  try {
    const response = await axios.post(process.env.API_URL, {
      key: process.env.API_KEY,
      action: "services",
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SYNC PROVIDER → DB
app.get("/api/sync-services", async (req, res) => {
  try {
    const response = await axios.post(process.env.API_URL, {
      key: process.env.API_KEY,
      action: "services",
    });

    const services = response.data;

    if (!Array.isArray(services)) {
      return res.status(500).json({ error: "Invalid provider data" });
    }

    let added = 0;
    let updated = 0;

    for (const s of services) {
      const exists = await Service.findOne({ serviceId: s.service });

      if (exists) {
        await Service.updateOne(
          { serviceId: s.service },
          {
            name: s.name,
            rate: s.rate,
            min: s.min,
            max: s.max,
            category: s.category || "General",
          }
        );
        updated++;
      } else {
        await Service.create({
          serviceId: s.service,
          name: s.name,
          rate: s.rate,
          min: s.min,
          max: s.max,
          category: s.category || "General",
        });
        added++;
      }
    }

    res.json({ message: "Synced", added, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// ORDER SYSTEM
// =====================================================

function calcCost(rate, qty) {
  return (rate / 1000) * qty;
}

app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    const service = await Service.findOne({ serviceId });
    if (!service) return res.status(404).json({ error: "Not found" });

    const user = await User.findById(req.user.id);

    const cost = calcCost(service.rate, quantity);

    if (user.balance < cost) {
      return res.status(400).json({ error: "Low balance" });
    }

    const provider = await smmRequest.addOrder({
      service: serviceId,
      link,
      quantity,
    });

    if (!provider?.order) {
      return res.status(500).json({ error: "Provider failed" });
    }

    user.balance -= cost;
    await user.save();

    const order = await Order.create({
      userId: user._id,
      service: service.name,
      link,
      quantity,
      smmOrderId: provider.order,
      cost,
      status: "processing",
    });

    res.json({ message: "Order placed", order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ORDERS
app.get("/api/orders", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id });
  res.json(orders);
});

// =====================================================
// MPESA (OPTIONAL)
// =====================================================

async function getToken() {
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

    const token = await getToken();

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
        TransactionDesc: "Deposit",
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    await Deposit.create({
      userId: req.user.id,
      phone,
      amount,
      status: "pending",
    });

    res.json({ message: "STK sent" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// START SERVER
// =====================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
