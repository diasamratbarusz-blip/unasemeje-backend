const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(cors());

// ===== DATABASE =====
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"));

// ===== MODELS =====
const User = mongoose.model("User", {
  email: String,
  password: String,
  balance: { type: Number, default: 0 }
});

const Deposit = mongoose.model("Deposit", {
  userId: String,
  amount: Number,
  code: String,
  status: { type: String, default: "Pending" }
});

const Order = mongoose.model("Order", {
  userId: String,
  service: String,
  link: String,
  quantity: Number,
  status: String,
  providerOrderId: String
});

// ===== AUTH =====
function auth(req, res, next) {
  try {
    const token = req.headers["authorization"];
    const user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

// ===== REGISTER =====
app.post("/register", async (req, res) => {
  const user = new User(req.body);
  await user.save();
  res.json({ message: "Registered" });
});

// ===== LOGIN =====
app.post("/login", async (req, res) => {
  const user = await User.findOne(req.body);
  if (!user) return res.json({ error: "Invalid" });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token });
});

// ===== BALANCE =====
app.get("/balance", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ balance: user.balance });
});

// ===== DEPOSIT =====
app.post("/deposit", auth, async (req, res) => {
  const d = new Deposit({
    userId: req.user.id,
    amount: req.body.amount,
    code: req.body.code
  });
  await d.save();
  res.json({ message: "Submitted" });
});

// ===== ADMIN =====
app.get("/admin/deposits", async (req, res) => {
  res.json(await Deposit.find());
});

app.post("/admin/approve", async (req, res) => {
  const d = await Deposit.findById(req.body.id);

  await User.findByIdAndUpdate(d.userId, {
    $inc: { balance: d.amount }
  });

  d.status = "Approved";
  await d.save();

  res.json({ message: "Approved" });
});

// ===== SMM API CONFIG =====
const API_URL = process.env.SMM_API_URL;
const API_KEY = process.env.SMM_API_KEY;

// ===== GET SERVICES =====
app.get("/services", async (req, res) => {
  try {
    const response = await axios.post(API_URL, {
      key: API_KEY,
      action: "services"
    });

    res.json(response.data);
  } catch (err) {
    res.json({ error: "Failed to load services" });
  }
});

// ===== ORDER (REAL API) =====
app.post("/order", auth, async (req, res) => {
  const { service, link, quantity } = req.body;

  try {
    const api = await axios.post(API_URL, {
      key: API_KEY,
      action: "add",
      service,
      link,
      quantity
    });

    const order = new Order({
      userId: req.user.id,
      service,
      link,
      quantity,
      status: "Processing",
      providerOrderId: api.data.order
    });

    await order.save();

    res.json({ message: "Order placed", provider: api.data });

  } catch (err) {
    res.json({ error: "Order failed" });
  }
});

// ===== USER ORDERS =====
app.get("/orders", auth, async (req, res) => {
  res.json(await Order.find({ userId: req.user.id }));
});

// ===== START =====
app.listen(3000, () => console.log("Server running"));
