const express = require("express");
const auth = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

// BALANCE
router.get("/balance", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ balance: user.balance });
  } catch (err) {
    console.error("BALANCE ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

module.exports = router;
