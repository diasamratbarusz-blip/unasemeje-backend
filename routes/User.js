const express = require("express");
const auth = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

/**
 * =========================================
 * GET ME (CHANNELS DATA TO ADD FUNDS PAGE)
 * =========================================
 * Frontend looks for `${API_URL}/me` to load balance and profiles instantly.
 */
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Returns structural keys directly mapped to your frontend layout logic
    res.json({
      username: user.username || user.name || "User Profile",
      email: user.email,
      balance: user.balance || 0,
      paymentProfileName: user.paymentProfileName || null,
      paymentProfileEmail: user.paymentProfileEmail || null,
      paymentPhone1: user.paymentPhone1 || null,
      paymentPhone2: user.paymentPhone2 || null,
      paymentPhone3: user.paymentPhone3 || null
    });
  } catch (err) {
    console.error("GET ME ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch dashboard user details" });
  }
});

/**
 * =========================================
 * GET BALANCE
 * =========================================
 */
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

/**
 * =========================================
 * GET PAYMENT PROFILE
 * =========================================
 * Fetches the registered payment details for the Add Funds dashboard.
 */
router.get("/payment-profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "paymentProfileName paymentProfileEmail paymentPhone1 paymentPhone2 paymentPhone3"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      profile: {
        name: user.paymentProfileName,
        email: user.paymentProfileEmail,
        phones: [user.paymentPhone1, user.paymentPhone2, user.paymentPhone3].filter(Boolean)
      }
    });
  } catch (err) {
    console.error("GET PROFILE ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch payment profile" });
  }
});

/**
 * =========================================
 * UPDATE PAYMENT PROFILE
 * =========================================
 * Saves the 3 authorized phone numbers and identity info from the frontend modal.
 */
router.post("/update-payment-profile", auth, async (req, res) => {
  try {
    const { name, email, phones } = req.body;

    if (!name || !email || !phones || !phones[0]) {
      return res.status(400).json({ error: "Name, Email, and Primary Phone are required." });
    }

    // Clean whitespaces from incoming phone array to guarantee match precision for webhooks
    const cleanPhones = (phones || []).map(p => typeof p === 'string' ? p.replace(/\s/g, '') : p);

    // Update the user document with the specific payment gateway channels
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          paymentProfileName: name,
          paymentProfileEmail: email,
          paymentPhone1: cleanPhones[0] || null,
          paymentPhone2: cleanPhones[1] || null,
          paymentPhone3: cleanPhones[2] || null
        }
      },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Payment profile activated and synchronized.",
      profile: {
        name: updatedUser.paymentProfileName,
        email: updatedUser.paymentProfileEmail,
        phones: [updatedUser.paymentPhone1, updatedUser.paymentPhone2, updatedUser.paymentPhone3].filter(Boolean)
      }
    });
  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err.message);
    res.status(500).json({ error: "Failed to update payment profile" });
  }
});

module.exports = router;
