const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");

const app = express();
app.use(express.json());
app.use(cors());

// ===== GOOGLE CLIENT =====
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ===== DATABASE =====
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// ===== MODELS =====
const User = mongoose.model("User", {
  email: { type: String, unique: true },
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

// ===== AUTH MIDDLEWARE =====
function auth(req, res, next) {
  try {
    const token = req.headers["authorization"];
    if (!token) return res.status(401).json({ error: "No token" });

    const user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Unauthorized" });
  }
}

// ===== REGISTER =====
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({ error: "All fields required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({ error: "User already exists" });
    }

    const user = new User({ email, password });
    await user.save();

    res.json({ message: "Registered successfully" });

  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

// ===== LOGIN =====
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });
    if (!user) {
      return res.json({ error: "Invalid login" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET
    );

    res.json({ token });

  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// ===== GOOGLE LOGIN =====
app.post("/auth/google", async (req, res) => {
  try {
    const { token } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const email = payload.email;

    let user = await User.findOne({ email });

    if (!user) {
      user = new User({ email, password: "" });
      await user.save();
    }

    const jwtToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET
    );

    res.json({ token: jwtToken });

  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Google authentication failed" });
  }
});

// ===== BALANCE =====
app.get("/balance", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ balance: user.balance });
});

// ===== DEPOSIT =====
app.post("/deposit", auth, async (req, res) => {
  try {
    const { amount, code } = req.body;

    if (!amount || !code) {
      return res.json({ error: "All fields required" });
    }

    const deposit = new Deposit({
      userId: req.user.id,
      amount,
      code
    });

    await deposit.save();

    res.json({ message: "Deposit submitted" });

  } catch (err) {
    res.status(500).json({ error: "Deposit failed" });
  }
});

// ===== ADMIN APPROVE =====
app.post("/admin/approve", async (req, res) => {
  try {
    const d = await Deposit.findById(req.body.id);

    if (!d) return res.json({ error: "Deposit not found" });

    await User.findByIdAndUpdate(d.userId, {
      $inc: { balance: d.amount }
    });

    d.status = "Approved";
    await d.save();

    res.json({ message: "Approved" });

  } catch (err) {
    res.status(500).json({ error: "Approval failed" });
  }
});

// ===== ORDER =====
app.post("/order", auth, async (req, res) => {
  try {
    const { service, link, quantity } = req.body;

    if (!service || !link || !quantity) {
      return res.json({ error: "All fields required" });
    }

    const response = await axios.post(process.env.SMM_API_URL, {
      key: process.env.SMM_API_KEY,
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
      status: "Processing"
    });

    await order.save();

    res.json({
      message: "Order placed successfully",
      providerOrderId: response.data.order
    });

  } catch (err) {
    console.log(err);
    res.json({ error: "Order failed" });
  }
});

// ===== GET ORDERS =====
app.get("/orders", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id });
  res.json(orders);
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
