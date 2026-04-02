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
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

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
  status: String
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

// ===== ROUTES =====

// Register
app.post("/register", async (req, res) => {
  const user = new User(req.body);
  await user.save();
  res.json({ message: "Registered successfully" });
});

// Login
app.post("/login", async (req, res) => {
  const user = await User.findOne(req.body);
  if (!user) return res.json({ error: "Invalid login" });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token });
});

// Balance
app.get("/balance", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ balance: user.balance });
});

// Deposit
app.post("/deposit", auth, async (req, res) => {
  const d = new Deposit({
    userId: req.user.id,
    amount: req.body.amount,
    code: req.body.code
  });
  await d.save();
  res.json({ message: "Deposit submitted" });
});

// Admin approve deposit
app.post("/admin/approve", async (req, res) => {
  const d = await Deposit.findById(req.body.id);

  await User.findByIdAndUpdate(d.userId, {
    $inc: { balance: d.amount }
  });

  d.status = "Approved";
  await d.save();

  res.json({ message: "Approved" });
});

// ===== SMM ORDER =====
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

    const o = new Order({
      userId: req.user.id,
      service,
      link,
      quantity,
      status: "Processing"
    });

    await o.save();

    res.json({
      message: "Order placed successfully",
      providerOrderId: response.data.order
    });

  } catch (error) {
    console.log(error);
    res.json({ error: "Order failed" });
  }
});

// Get orders
app.get("/orders", auth, async (req, res) => {
  res.json(await Order.find({ userId: req.user.id }));
});

// ===== START =====
app.listen(3000, () => console.log("Server running"));
