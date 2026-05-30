// ================= IMPORTS =================
require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const path = require("path");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const log = require("./utils/logger");

// ================= MODELS =================
const User = require("./models/User");
const Order = require("./models/Order");
const Deposit = require("./models/Deposit");
const Service = require("./models/Service");

// ================= CONFIGURATION & CONSTANTS =================
const ADMIN_EMAIL = "diasamratb@gmail.com".toLowerCase();
const ADMIN_PHONE = "0715509440";

const PAYNECTA_BASE_URL = "https://paynecta.co.ke/api/v1";

const app = express();

/**
 * =========================================
 * MIDDLEWARE & CONFIG
 * =========================================
 */
app.use(cors({
    origin: "*", // Allow all for maximum compatibility during dev
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-User-Email"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/**
 * =========================================
 * DATABASE CONNECTION
 * =========================================
 */
connectDB()
    .then(() => {
        console.log("🚀 UNASEMEJE ø DIA SERVER READY");
        verifyPaynecta();
    })
    .catch(err => console.log("❌ DB Error:", err.message));

async function verifyPaynecta() {
    try {
        await axios.get(`${PAYNECTA_BASE_URL}/auth/verify`, {
            headers: { "X-API-Key": process.env.PAYNECTA_API_KEY, "X-User-Email": ADMIN_EMAIL }
        });
        console.log("✅ Paynecta Integrated");
    } catch (e) { console.log("⚠️ Paynecta Offline"); }
}

/**
 * =========================================
 * AUTHENTICATION MIDDLEWARES
 * =========================================
 */
function auth(req, res, next) {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ error: "Unauthorized" });
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) { res.status(401).json({ error: "Session Expired" }); }
}

function adminAuth(req, res, next) {
    auth(req, res, () => {
        const isOwner = req.user.email?.toLowerCase() === ADMIN_EMAIL || req.user.phone === ADMIN_PHONE;
        if (!isOwner) return res.status(403).json({ error: "Access Denied" });
        next();
    });
}

/**
 * =========================================
 * BUSINESS HELPERS
 * =========================================
 */
function applyFinalPrice(originalRate, name) {
    const t = String(name).toLowerCase();
    let markup = 40; // Base markup
    if (t.includes("like")) markup = 30;
    if (t.includes("follower")) markup = 35;
    if (t.includes("view")) markup = 25;
    return Number((Number(originalRate || 0) + markup).toFixed(2));
}

function detectPlatform(name, category) {
    const text = `${name} ${category}`.toLowerCase();
    if (text.includes("instagram")) return "Instagram";
    if (text.includes("tiktok")) return "TikTok";
    if (text.includes("youtube")) return "YouTube";
    if (text.includes("facebook")) return "Facebook";
    if (text.includes("twitter")) return "Twitter/X";
    if (text.includes("telegram")) return "Telegram";
    return "Other";
}

/**
 * =========================================
 * ADMIN DATA ROUTES
 * =========================================
 */
app.get("/api/admin/users", adminAuth, async (req, res) => {
    const users = await User.find().select("-password");
    res.json(users);
});

app.get("/api/admin/deposits", adminAuth, async (req, res) => {
    const deposits = await Deposit.find().sort({ createdAt: -1 });
    res.json(deposits);
});

app.get("/api/admin/orders", adminAuth, async (req, res) => {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
});

// Manual Balance Update
app.post("/api/admin/update-balance", adminAuth, async (req, res) => {
    try {
        const { userId, amount } = req.body;
        await User.findByIdAndUpdate(userId, { balance: amount });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Approve Manual/Failed Deposit
app.post("/api/admin/approve-deposit", adminAuth, async (req, res) => {
    try {
        const dep = await Deposit.findById(req.body.depositId);
        if (dep && dep.status !== "completed") {
            const user = await User.findById(dep.userId);
            user.balance += dep.amount;
            dep.status = "completed";
            await user.save();
            await dep.save();
            return res.json({ success: true });
        }
        res.status(400).json({ error: "Invalid deposit" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * =========================================
 * SERVICES & SYNC (DELIX)
 * =========================================
 */
app.get("/api/services", async (req, res) => {
    try {
        const refresh = req.query.refresh === "true";
        let services = await Service.find();

        if (refresh || services.length === 0) {
            const resp = await axios.get(`https://delixgainske.com/api/v2?action=services&key=${process.env.SMM_API_KEY}`);
            const list = Array.isArray(resp.data) ? resp.data : [];

            if (list.length > 0) {
                await Service.deleteMany({});
                const mapped = list.map(s => ({
                    serviceId: String(s.service),
                    name: s.name,
                    rate: Number(s.rate),
                    min: Number(s.min),
                    max: Number(s.max),
                    category: s.category,
                    platform: detectPlatform(s.name, s.category),
                    provider: "DELIX"
                }));
                await Service.insertMany(mapped);
                services = await Service.find();
            }
        }

        // Apply Markups
        const grouped = {};
        services.forEach(s => {
            if (!grouped[s.platform]) grouped[s.platform] = {};
            if (!grouped[s.platform][s.category]) grouped[s.platform][s.category] = [];
            grouped[s.platform][s.category].push({
                ...s.toObject(),
                rate: applyFinalPrice(s.rate, s.name)
            });
        });
        res.json({ success: true, data: grouped });
    } catch (e) { res.status(500).json({ error: "Service sync failed" }); }
});

/**
 * =========================================
 * ORDERING SYSTEM
 * =========================================
 */
app.post("/api/order", auth, async (req, res) => {
    try {
        const { serviceId, link, quantity } = req.body;
        const service = await Service.findOne({ serviceId });
        const user = await User.findById(req.user.id);
        
        const price = (applyFinalPrice(service.rate, service.name) / 1000) * quantity;
        if (user.balance < price) return res.status(400).json({ error: "Top up your wallet" });

        const provider = await axios.get(`https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=add&service=${serviceId}&link=${link}&quantity=${quantity}`);

        if (provider.data && provider.data.order) {
            await Order.create({
                userId: user._id,
                userEmail: user.email,
                serviceId,
                serviceName: service.name,
                orderId: provider.data.order,
                link,
                quantity,
                cost: price,
                status: "Pending"
            });
            user.balance -= price;
            await user.save();
            res.json({ success: true, newBalance: user.balance });
        } else {
            res.status(400).json({ error: "Provider busy. Try later." });
        }
    } catch (e) { res.status(500).json({ error: "Ordering failed" }); }
});

app.get("/api/my-orders", auth, async (req, res) => {
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
});

/**
 * =========================================
 * PAYMENT & WEBHOOKS
 * =========================================
 */
app.post("/api/paynecta/stkpush", auth, async (req, res) => {
    try {
        const { amount, phone } = req.body;
        const response = await axios.post(`${PAYNECTA_BASE_URL}/payment/initialize`, {
            amount: Number(amount),
            mobile_number: phone,
            code: "STK",
            reference: "UNAS_" + Date.now()
        }, {
            headers: { "X-API-Key": process.env.PAYNECTA_API_KEY, "X-User-Email": ADMIN_EMAIL }
        });
        res.json({ success: true, data: response.data });
    } catch (e) { res.status(500).json({ error: "STK Push failed" }); }
});

app.post("/api/paynecta/webhook", async (req, res) => {
    const { event_type, data } = req.body;
    if (event_type === "payment.completed") {
        const tx = data.transaction;
        const user = await User.findOne({ phone: { $regex: tx.mobile_number.slice(-9) } });
        if (user) {
            const exists = await Deposit.findOne({ transactionCode: tx.reference });
            if (!exists) {
                user.balance += Number(tx.amount);
                await Deposit.create({
                    userId: user._id,
                    userEmail: user.email,
                    amount: tx.amount,
                    transactionCode: tx.reference,
                    status: "completed"
                });
                await user.save();
            }
        }
    }
    res.sendStatus(200);
});

/**
 * =========================================
 * AUTH & USER ROUTES
 * =========================================
 */
app.post("/api/register", async (req, res) => {
    try {
        const { username, email, password, phone } = req.body;
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: "User exists" });
        await User.create({ username, email, password, phone, balance: 0 });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Error" }); }
});

app.post("/api/login", async (req, res) => {
    const user = await User.findOne({ email: req.body.identifier, password: req.body.password });
    if (!user) return res.status(400).json({ error: "Invalid" });
    const token = jwt.sign({ id: user._id, email: user.email, phone: user.phone }, process.env.JWT_SECRET);
    res.json({ token, balance: user.balance });
});

app.get("/api/me", auth, async (req, res) => {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
});

// UI Routes
const pages = ["home", "dashboard", "my-orders", "admin", "add-funds", "services"];
pages.forEach(p => app.get(`/${p}`, (req, res) => res.sendFile(path.join(__dirname, "public", `${p}.html`))));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "home.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Port: ${PORT}`));
