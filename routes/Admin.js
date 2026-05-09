const express = require("express");
const auth = require("../middleware/auth");
const Deposit = require("../models/Deposit");
const User = require("../models/User");
const Order = require("../models/Order"); // Added to support the Orders view

const router = express.Router();

/**
 * IDENTITY GATEKEEPER MIDDLEWARE
 * Strictly limits access to your specific credentials.
 */
const identityGuard = (req, res, next) => {
    const OWNER_EMAIL = "diasamratbarusz@gmail.com".toLowerCase();
    const OWNER_PHONE = "0715509440";

    const isEmailMatch = req.user.email && req.user.email.toLowerCase() === OWNER_EMAIL;
    // Check if phone matches (handles formats like 0715... or 254715...)
    const isPhoneMatch = req.user.phone && String(req.user.phone).includes("715509440");

    if (isEmailMatch || isPhoneMatch) {
        next();
    } else {
        return res.status(403).json({ error: "Access Denied: Permanent Identity Lock Active" });
    }
};

// 1. GET ALL DEPOSITS (For the Admin Table)
router.get("/deposits", auth, identityGuard, async (req, res) => {
    try {
        const deposits = await Deposit.find().sort({ createdAt: -1 });
        res.json(deposits);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch deposits" });
    }
});

// 2. APPROVE DEPOSIT (Funds User Wallet)
router.post("/approve-deposit", auth, identityGuard, async (req, res) => {
    try {
        const { depositId } = req.body;
        const d = await Deposit.findById(depositId);

        if (!d || d.status !== "pending") {
            return res.status(400).json({ error: "Deposit already processed or not found" });
        }

        const user = await User.findById(d.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        // Update User Balance
        user.balance += d.amount;
        await user.save();

        // Update Deposit Status
        d.status = "approved";
        await d.save();

        res.json({ message: "Funds approved and added to user wallet successfully" });
    } catch (err) {
        res.status(500).json({ error: "Server error during approval" });
    }
});

// 3. GET ALL USERS (For User Management)
router.get("/users", auth, identityGuard, async (req, res) => {
    try {
        const users = await User.find({}, "username email phone balance createdAt").sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// 4. GET ALL ORDERS (Global Order History)
router.get("/orders", auth, identityGuard, async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch global orders" });
    }
});

module.exports = router;
