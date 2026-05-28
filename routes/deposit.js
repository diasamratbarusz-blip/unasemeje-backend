const express = require("express");
const auth = require("../middleware/auth");
const axios = require("axios");

const Deposit = require("../models/Deposit");
const User = require("../models/User");

const router = express.Router();

// ======================================
// PAYNECTA CONFIG
// ======================================
const PAYNECTA_BASE_URL = "https://paynecta.co.ke/api/v1";

const ADMIN_EMAIL =
  process.env.PAYNECTA_EMAIL || "diasamratb@gmail.com";

const API_KEY =
  process.env.PAYNECTA_API_KEY || "your_api_key_here";

// ======================================
// FORMAT PHONE NUMBER
// ======================================
function formatPhone(phone) {

  let formatted = String(phone).replace(/\D/g, "");

  // 0712345678 -> 254712345678
  if (formatted.startsWith("0")) {
    formatted = "254" + formatted.substring(1);
  }

  // 712345678 -> 254712345678
  if (formatted.startsWith("7")) {
    formatted = "254" + formatted;
  }

  return formatted;
}

// ======================================
// VERIFY PAYNECTA ACCOUNT
// ======================================
router.get("/verify", async (req, res) => {

  try {

    const response = await axios.get(
      `${PAYNECTA_BASE_URL}/auth/verify`,
      {
        headers: {
          "X-API-Key": API_KEY,
          "X-User-Email": ADMIN_EMAIL
        }
      }
    );

    res.json(response.data);

  } catch (error) {

    console.log("VERIFY ERROR:", error.response?.data);

    res.status(500).json({
      success: false,
      error: "Paynecta verification failed"
    });
  }
});

// ======================================
// PAYNECTA STK PUSH
// ======================================
router.post("/stkpush", auth, async (req, res) => {

  try {

    let { phone, amount } = req.body;

    // ===============================
    // VALIDATION
    // ===============================
    if (!phone || !amount) {

      return res.status(400).json({
        error: "Phone and amount are required"
      });
    }

    amount = Number(amount);

    if (amount < 1) {

      return res.status(400).json({
        error: "Minimum amount is 1"
      });
    }

    // ===============================
    // FORMAT PHONE
    // ===============================
    const formattedPhone = formatPhone(phone);

    // ===============================
    // VALIDATE SAFARICOM NUMBER
    // ===============================
    if (!/^2547\d{8}$/.test(formattedPhone)) {

      return res.status(400).json({
        error: "Invalid Safaricom phone number"
      });
    }

    // ===============================
    // SEND TO PAYNECTA
    // ===============================
    const response = await axios.post(

      `${PAYNECTA_BASE_URL}/payment/initialize`,

      {
        code: "600",
        amount,
        mobile_number: formattedPhone
      },

      {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
          "X-User-Email": ADMIN_EMAIL
        }
      }
    );

    console.log("PAYNECTA RESPONSE:", response.data);

    // ===============================
    // SAVE DEPOSIT RECORD
    // ===============================
    await Deposit.create({

      userId: req.user.id,

      phone: formattedPhone,

      amount,

      code:
        response.data?.transaction_reference ||
        response.data?.CheckoutRequestID ||
        `TX-${Date.now()}`,

      status: "pending",

      flagged: false
    });

    // ===============================
    // SUCCESS RESPONSE
    // ===============================
    res.json({

      success: true,

      message:
        "STK Push sent successfully",

      data: response.data
    });

  } catch (error) {

    console.log(
      "STK PUSH ERROR:",
      error.response?.data || error.message
    );

    res.status(
      error.response?.status || 500
    ).json({

      success: false,

      error:
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Failed to initiate payment"
    });
  }
});

// ======================================
// USER: REQUEST MANUAL DEPOSIT
// ======================================
router.post("/request", auth, async (req, res) => {

  try {

    const { phone, amount, code } = req.body;

    if (!phone || !amount || !code) {

      return res.status(400).json({
        error: "All fields are required"
      });
    }

    // ===============================
    // FORMAT PHONE
    // ===============================
    const formattedPhone = formatPhone(phone);

    // ===============================
    // VALIDATE PHONE
    // ===============================
    if (!/^2547\d{8}$/.test(formattedPhone)) {

      return res.status(400).json({
        error: "Invalid phone format"
      });
    }

    // ===============================
    // DUPLICATE CODE CHECK
    // ===============================
    const existing = await Deposit.findOne({
      code: code.toUpperCase()
    });

    if (existing) {

      return res.status(400).json({
        error: "Transaction code already used"
      });
    }

    let status = "pending";
    let flagged = false;

    // ===============================
    // AUTO APPROVAL
    // ===============================
    if (
      Number(amount) >= 100 &&
      Number(amount) <= 50000
    ) {

      status = "approved";

    } else {

      flagged = true;
    }

    // ===============================
    // CREATE DEPOSIT
    // ===============================
    const deposit = await Deposit.create({

      userId: req.user.id,

      phone: formattedPhone,

      amount: Number(amount),

      code: code.toUpperCase(),

      status,

      flagged
    });

    // ===============================
    // CREDIT USER
    // ===============================
    if (status === "approved") {

      const user = await User.findById(
        req.user.id
      );

      user.balance += Number(amount);

      await user.save();
    }

    // ===============================
    // RESPONSE
    // ===============================
    res.json({

      success: true,

      message: "Deposit processed",

      status,

      flagged,

      deposit
    });

  } catch (err) {

    console.log("REQUEST ERROR:", err.message);

    res.status(500).json({
      error: "Server error"
    });
  }
});

// ======================================
// ADMIN: GET ALL DEPOSITS
// ======================================
router.get("/admin/all", auth, async (req, res) => {

  try {

    if (req.user.role !== "admin") {

      return res.status(403).json({
        error: "Unauthorized"
      });
    }

    const deposits = await Deposit.find()
      .populate("userId")
      .sort({ createdAt: -1 });

    res.json(deposits);

  } catch (err) {

    res.status(500).json({
      error: "Server error"
    });
  }
});

// ======================================
// ADMIN: APPROVE DEPOSIT
// ======================================
router.post("/admin/approve", auth, async (req, res) => {

  try {

    if (req.user.role !== "admin") {

      return res.status(403).json({
        error: "Unauthorized"
      });
    }

    const deposit = await Deposit.findById(
      req.body.id
    );

    if (!deposit) {

      return res.status(404).json({
        error: "Deposit not found"
      });
    }

    if (deposit.status === "approved") {

      return res.status(400).json({
        error: "Already approved"
      });
    }

    const user = await User.findById(
      deposit.userId
    );

    if (!user) {

      return res.status(404).json({
        error: "User not found"
      });
    }

    // ===============================
    // CREDIT USER
    // ===============================
    user.balance += Number(deposit.amount);

    await user.save();

    // ===============================
    // UPDATE DEPOSIT
    // ===============================
    deposit.status = "approved";
    deposit.flagged = false;

    await deposit.save();

    res.json({
      success: true,
      message: "Deposit approved"
    });

  } catch (err) {

    console.log("APPROVE ERROR:", err.message);

    res.status(500).json({
      error: "Server error"
    });
  }
});

// ======================================
// ADMIN: REJECT DEPOSIT
// ======================================
router.post("/admin/reject", auth, async (req, res) => {

  try {

    if (req.user.role !== "admin") {

      return res.status(403).json({
        error: "Unauthorized"
      });
    }

    const deposit = await Deposit.findById(
      req.body.id
    );

    if (!deposit) {

      return res.status(404).json({
        error: "Deposit not found"
      });
    }

    deposit.status = "rejected";

    await deposit.save();

    res.json({
      success: true,
      message: "Deposit rejected"
    });

  } catch (err) {

    console.log("REJECT ERROR:", err.message);

    res.status(500).json({
      error: "Server error"
    });
  }
});

module.exports = router;
