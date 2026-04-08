// ================= IMPORTS =================
require("dotenv").config();

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

// ================= INIT =================
const app = express();
app.use(express.json());
app.use(cors());

// ================= CONNECT DB =================
connectDB();
log("Server started");

// ================= AUTH MIDDLEWARE =================
function auth(req, res, next) {
  try {
    const header = req.headers["authorization"];
    if (!header) return res.status(401).json({ error: "No token" });

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "User exists" });

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
    if (!user) return res.status(400).json({ error: "Invalid login" });

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

// ================= USER =================
app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
});

// ================= MPESA STK =================
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
        AccountReference: "UNASEMEJE",
        TransactionDesc: "Deposit"
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    await Deposit.create({
      userId: req.user.id,
      phone,
      amount
    });

    res.json({ message: "STK sent" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "STK failed" });
  }
});

// ================= CALLBACK =================
app.post("/api/mpesa/callback", async (req, res) => {
  try {
    const result = req.body.Body.stkCallback;

    if (result.ResultCode === 0) {
      const items = result.CallbackMetadata.Item;

      const amount = items.find(i => i.Name === "Amount").Value;
      const phone = items.find(i => i.Name === "PhoneNumber").Value;

      const user = await User.findOne({ phone });

      if (user) {
        user.balance += amount;
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
  const services = await Service.find();
  res.json(services);
});

// ================= ORDER =================
function calculateCost(rate, quantity) {
  return (rate / 1000) * quantity;
}

app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    if (!serviceId || !link || !quantity) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const service = await Service.findOne({ serviceId });
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    const cost = calculateCost(service.rate, quantity);

    const user = await User.findById(req.user.id);

    if (user.balance < cost) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Send to SMM API
    const response = await smmRequest({
      action: "add",
      service: serviceId,
      link,
      quantity
    });

    if (!response || !response.order) {
      return res.status(500).json({ error: "SMM API failed" });
    }

    // Deduct balance
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
    console.error(err);
    res.status(500).json({ error: "Order failed" });
  }
});

// ================= GET ORDERS =================
app.get("/api/orders", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id });
  res.json(orders);
});

// ================= ADMIN =================
app.post("/api/admin/approve", auth, async (req, res) => {
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
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  log(`Server running on port ${PORT}`);
});
