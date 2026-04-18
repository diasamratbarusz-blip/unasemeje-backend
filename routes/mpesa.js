const express = require("express");
const auth = require("../middleware/auth");
const Deposit = require("../models/Deposit");
const User = require("../models/User");
const { stkPush } = require("../utils/mpesa");

const router = express.Router();

/* =========================
   STK PUSH (INITIATE PAYMENT)
========================= */
router.post("/stk", auth, async (req, res) => {
  try {
    const { phone, amount } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({
        success: false,
        error: "Phone and amount required"
      });
    }

    // Send STK
    const response = await stkPush(phone, amount);

    // Save pending deposit
    await Deposit.create({
      userId: req.user.id,
      phone,
      amount,
      status: "pending"
    });

    res.json({
      success: true,
      message: "STK push sent",
      data: response
    });

  } catch (err) {
    console.error("STK ERROR:", err.message);

    res.status(500).json({
      success: false,
      error: "STK push failed"
    });
  }
});

/* =========================
   CALLBACK (M-PESA RESPONSE)
========================= */
router.post("/callback", async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;

    if (!callback) {
      return res.sendStatus(200);
    }

    const resultCode = callback.ResultCode;

    // ================= SUCCESS PAYMENT =================
    if (resultCode === 0) {
      const metadata = callback.CallbackMetadata?.Item || [];

      const amountObj = metadata.find(i => i.Name === "Amount");
      const phoneObj = metadata.find(i => i.Name === "PhoneNumber");
      const receiptObj = metadata.find(i => i.Name === "MpesaReceiptNumber");

      const amount = amountObj?.Value;
      const phone = phoneObj?.Value;
      const receipt = receiptObj?.Value;

      if (!phone || !amount) {
        return res.sendStatus(200);
      }

      // ================= FIND USER =================
      const user = await User.findOne({ phone });

      if (user) {
        // avoid double credit
        const existing = await Deposit.findOne({
          transactionCode: receipt
        });

        if (!existing) {
          // update balance
          user.balance += Number(amount);
          await user.save();

          // update deposit
          await Deposit.findOneAndUpdate(
            {
              phone,
              amount,
              status: "pending"
            },
            {
              status: "completed",
              transactionCode: receipt,
              proof: JSON.stringify(callback)
            }
          );

          console.log("✅ Deposit credited:", phone, amount);
        }
      }

    } else {
      // ================= FAILED PAYMENT =================
      console.log("❌ STK Failed:", callback.ResultDesc);

      await Deposit.findOneAndUpdate(
        { status: "pending" },
        {
          status: "failed",
          proof: JSON.stringify(callback)
        }
      );
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("CALLBACK ERROR:", err.message);
    res.sendStatus(200); // MUST always respond 200 to Safaricom
  }
});

module.exports = router;
