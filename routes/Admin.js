const express = require("express");
const auth = require("../middleware/auth");
const Deposit = require("../models/Deposit");
const User = require("../models/User");

const router = express.Router();

// APPROVE DEPOSIT
router.post("/approve", auth, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.json({ error: "Unauthorized" });
  }

  const d = await Deposit.findById(req.body.id);

  const user = await User.findById(d.userId);
  user.balance += d.amount;

  await user.save();

  d.status = "approved";
  await d.save();

  res.json({ message: "Approved" });
});

module.exports = router;
