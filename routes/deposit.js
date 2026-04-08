const express = require("express");
const auth = require("../middleware/auth");
const Deposit = require("../models/Deposit");
const User = require("../models/User");

const router = express.Router();


// ===============================
// USER: REQUEST DEPOSIT
// ===============================
router.post("/request", auth, async (req, res) => {
  try {
    const { phone, amount, code } = req.body;

    if (!phone || !amount || !code) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Validate phone format (Kenya)
    if (!/^07\d{8}$/.test(phone)) {
      return res.status(400).json({ error: "Invalid phone format" });
    }

    // Prevent duplicate transaction code
    const existing = await Deposit.findOne({ code });
    if (existing) {
      return res.status(400).json({ error: "Transaction code already used" });
    }

    let status = "pending";
    let flagged = false;

    // ===============================
    // AUTO-APPROVAL RULES
    // ===============================
    if (amount >= 100 && amount <= 50000) {
      status = "approved";
    } else {
      flagged = true;
    }

    const deposit = await Deposit.create({
      userId: req.user.id,
      phone,
      amount,
      code,
      status,
      flagged
    });

    // If auto-approved → credit user
    if (status === "approved") {
      const user = await User.findById(req.user.id);
      user.balance += Number(amount);
      await user.save();
    }

    res.json({
      message: "Deposit processed",
      status,
      flagged
    });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// ===============================
// ADMIN: GET ALL DEPOSITS
// ===============================
router.get("/admin/all", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const deposits = await Deposit.find()
      .populate("userId")
      .sort({ createdAt: -1 });

    res.json(deposits);

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// ===============================
// ADMIN: APPROVE DEPOSIT
// ===============================
router.post("/admin/approve", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const deposit = await Deposit.findById(req.body.id);
    if (!deposit) {
      return res.status(404).json({ error: "Deposit not found" });
    }

    if (deposit.status === "approved") {
      return res.status(400).json({ error: "Already approved" });
    }

    const user = await User.findById(deposit.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.balance += deposit.amount;
    await user.save();

    deposit.status = "approved";
    deposit.flagged = false;
    await deposit.save();

    res.json({ message: "Deposit approved" });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// ===============================
// ADMIN: REJECT DEPOSIT
// ===============================
router.post("/admin/reject", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const deposit = await Deposit.findById(req.body.id);
    if (!deposit) {
      return res.status(404).json({ error: "Deposit not found" });
    }

    deposit.status = "rejected";
    await deposit.save();

    res.json({ message: "Deposit rejected" });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
