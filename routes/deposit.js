const express = require("express");
const auth = require("../middleware/auth");
const Deposit = require("../models/Deposit");
const User = require("../models/User");

const router = express.Router();

// APPROVE DEPOSIT (ADMIN ONLY)
router.post("/approve", auth, async (req, res) => {
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
    await deposit.save();

    res.json({ message: "Deposit approved" });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
