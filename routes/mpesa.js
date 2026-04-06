const express = require("express");
const auth = require("../middleware/auth");
const Deposit = require("../models/Deposit");
const User = require("../models/User");
const { stkPush } = require("../utils/mpesa");

const router = express.Router();

// STK
router.post("/stk", auth, async (req, res) => {
  const { phone, amount } = req.body;

  await stkPush(phone, amount);

  await Deposit.create({
    userId: req.user.id,
    phone,
    amount
  });

  res.json({ message: "STK sent" });
});

// CALLBACK
router.post("/callback", async (req, res) => {
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
});

module.exports = router;
