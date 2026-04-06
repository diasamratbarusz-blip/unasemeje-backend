const log = require("./utils/logger");log("Server started");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

/* ================= MODELS ================= */
const User = mongoose.model("User", {
  email: { type: String, unique: true },
  password: String,
  phone: String,
  balance: { type: Number, default: 0 },
  role: { type: String, default: "user" }
});

const Deposit = mongoose.model("Deposit", {
  userId: String,
  phone: String,
  amount: Number,
  status: { type: String, default: "pending" }
});

const Order = mongoose.model("Order", {
  userId: String,
  service: String,
  link: String,
  quantity: Number,
  status: { type: String, default: "processing" }
});

/* ================= AUTH MIDDLEWARE ================= */
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

/* ================= TEST ================= */
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

/* ================= REGISTER ================= */
app.post("/register", async (req, res) => {
  const { email, password, phone } = req.body;

  if (!email || !password) {
    return res.json({ error: "All fields required" });
  }

  const exists = await User.findOne({ email });
  if (exists) return res.json({ error: "User exists" });

  const user = new User({ email, password, phone });
  await user.save();

  res.json({ message: "Registered successfully" });
});

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, password });
  if (!user) return res.json({ error: "Invalid login" });

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

/* ================= BALANCE ================= */
app.get("/balance", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ balance: user.balance });
});

/* ================= M-PESA TOKEN ================= */
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

/* ================= STK PUSH ================= */
app.post("/stk", auth, async (req, res) => {
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

    // Save pending deposit
    await Deposit.create({
      userId: req.user.id,
      phone,
      amount
    });

    res.json({ message: "STK sent to phone" });

  } catch (err) {
    console.log(err);
    res.json({ error: "STK failed" });
  }
});

/* ================= CALLBACK ================= */
app.post("/callback", async (req, res) => {
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

  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

/* ================= ADMIN APPROVE ================= */
app.post("/admin/approve", auth, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.json({ error: "Unauthorized" });
  }

  const d = await Deposit.findById(req.body.id);
  if (!d) return res.json({ error: "Not found" });

  const user = await User.findById(d.userId);
  user.balance += d.amount;

  await user.save();

  d.status = "approved";
  await d.save();

  res.json({ message: "Approved" });
});

/* ================= ORDER ================= */
app.post("/order", auth, async (req, res) => {
  try {
    const { service, link, quantity } = req.body;

    const response = await axios.post(process.env.SMM_API_URL, {
      key: process.env.SMM_API_KEY,
      action: "add",
      service,
      link,
      quantity
    });

    await Order.create({
      userId: req.user.id,
      service,
      link,
      quantity
    });

    res.json({
      message: "Order placed",
      orderId: response.data.order
    });

  } catch (err) {
    res.json({ error: "Order failed" });
  }
});

/* ================= GET ORDERS ================= */
app.get("/orders", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id });
  res.json(orders);
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
