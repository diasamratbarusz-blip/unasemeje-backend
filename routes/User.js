const express = require("express");
const bcrypt = require("bcryptjs"); // Used for comparing and hashing security profiles
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
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      email: user.email,
      phone: user.phone || null, // Primary account number fallback channel
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
      "paymentProfileName paymentProfileEmail paymentPhone1 paymentPhone2 paymentPhone3 phone"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      profile: {
        name: user.paymentProfileName,
        email: user.paymentProfileEmail,
        phones: [user.phone, user.paymentPhone1, user.paymentPhone2, user.paymentPhone3].filter(Boolean)
      }
    });
  } catch (err) {
    console.error("GET PROFILE ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch payment profile" });
  }
});

/**
 * =========================================
 * UPDATE PAYMENT PROFILE (LEGACY APP MAPPING)
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
        phones: [updatedUser.phone, updatedUser.paymentPhone1, updatedUser.paymentPhone2, updatedUser.paymentPhone3].filter(Boolean)
      }
    });
  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err.message);
    res.status(500).json({ error: "Failed to update payment profile" });
  }
});

/**
 * =======================================================
 * NEW: UPDATE PROFILE METADATA (ADD FUNDS PROFILE SYNC)
 * =======================================================
 * Receives: { username, firstName, lastName, paymentPhone1, paymentPhone2 }
 * Maps seamlessly to `updateProfileData()` layout function call.
 */
router.put("/update-profile", auth, async (req, res) => {
  try {
    const { username, firstName, lastName, paymentPhone1, paymentPhone2 } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username configuration input field is mandatory." });
    }

    // Remove any accidental whitespace formatting from funding targets
    const cleanPhone1 = paymentPhone1 ? paymentPhone1.replace(/\s/g, '') : null;
    const cleanPhone2 = paymentPhone2 ? paymentPhone2.replace(/\s/g, '') : null;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          username: username.trim(),
          firstName: firstName ? firstName.trim() : null,
          lastName: lastName ? lastName.trim() : null,
          paymentPhone1: cleanPhone1,
          paymentPhone2: cleanPhone2
        }
      },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Identity and structural gateway channels modified successfully.",
      user: {
        username: updatedUser.username,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        paymentPhone1: updatedUser.paymentPhone1,
        paymentPhone2: updatedUser.paymentPhone2
      }
    });
  } catch (err) {
    console.error("METADATA PROFILE UPDATE ERROR:", err.message);
    res.status(500).json({ error: "Node database execution dropped updates." });
  }
});

/**
 * =======================================================
 * NEW: CHANGE PASSWORD GATEWAY (SECURITY SYNC)
 * =======================================================
 * Receives: { currentPassword, newPassword }
 * Maps seamlessly to `changePassword()` layout function call.
 */
router.post("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password keys are explicitly required." });
    }

    // Retrieve user model instance manually checking for stored hash target
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "Active identity user not found." });
    }

    // Validate the accuracy of historical system password block
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Authentication checkpoint failed. Incorrect current password." });
    }

    // Hash the new parameter code string cleanly before storage sequence
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    await user.save();

    res.json({
      success: true,
      message: "Security infrastructure gateway successfully updated."
    });
  } catch (err) {
    console.error("SECURITY CHANGE PASSWORD ERROR:", err.message);
    res.status(500).json({ error: "Internal processing anomaly handling encryption updates." });
  }
});

module.exports = router;
