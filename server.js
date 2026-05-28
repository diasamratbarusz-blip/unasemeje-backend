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

// MODELS
const User = require("./models/User");
const Order = require("./models/Order");
const Deposit = require("./models/Deposit");
const Service = require("./models/Service");

// ================= CONFIGURATION & CONSTANTS =================
const ADMIN_EMAIL = "diasamratb@gmail.com".toLowerCase();
const ADMIN_PHONE = "0715509440";
const PAYNECTA_BASE_URL = "https://paynecta.co.ke/api/v1";

// UPDATED: Fetches the payment link from environment variables or defaults to your link
const PAYNECTA_PAYMENT_PAGE = process.env.PAYNECTA_BASE_URL || "https://paynecta.co.ke/pay/Unasemeje";

const app = express();

/**
=========================================
MIDDLEWARE & CONFIG
=========================================
*/
// Updated CORS to be more flexible for development while keeping your origins
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = ["https://unasemeje-frontend.vercel.app", "http://localhost:3000", "http://localhost:5000", "http://localhost:3001"];
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-User-Email"]
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ================= PAYNECTA UTILS =================
async function verifyPaynecta() {
    try {
        const response = await axios.get(`${PAYNECTA_BASE_URL}/auth/verify`, {
            headers: {
                "X-API-Key": process.env.PAYNECTA_API_KEY || "your_api_key_here",
                "X-User-Email": ADMIN_EMAIL
            }
        });
        if (response.data && response.data.success) {
            const firstName = response.data.data?.kyc?.first_name || "N/A";
            console.log("Paynecta Status:", "✅ Verified -", firstName);
        }
    } catch (error) {
        console.log("Paynecta Status:", "❌ Error: API Key or Email might be incorrect");
    }
}

// Connect to MongoDB & Boot Status
connectDB().then(() => {
    console.log("--- UNASEMEJE ø DIA PROVIDER STATUS ---");
    console.log("P1 (Delixgains):", "https://delixgainske.com/api/v2", process.env.SMM_API_KEY ? "✅" : "❌");
    verifyPaynecta();
});

/**
=========================================
AUTHENTICATION HELPERS
=========================================
*/
function auth(req, res, next) {
    try {
        const header = req.headers.authorization;
        if (!header) return res.status(401).json({ error: "Access denied. No token provided." });
        const token = header.split(" ")[1];
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

function adminAuth(req, res, next) {
    auth(req, res, () => {
        const userEmail = req.user.email ? req.user.email.toLowerCase() : "";
        const isAuthorized = userEmail === ADMIN_EMAIL && req.user.phone === ADMIN_PHONE;
        if (!isAuthorized) return res.status(403).json({ error: "Forbidden: Owner access only." });
        next();
    });
}

/**
=========================================
BUSINESS LOGIC UTILS
=========================================
*/
function generateReferralCode() { return crypto.randomBytes(4).toString("hex"); }

async function giveReferralBonus(userId, orderCost) {
    try {
        const user = await User.findById(userId);
        if (!user || !user.referredBy) return;
        const referrer = await User.findOne({ referralCode: user.referredBy });
        if (!referrer) return;
        const bonus = orderCost * 0.10;
        referrer.balance += bonus;
        referrer.referralEarnings = (referrer.referralEarnings || 0) + bonus;
        await referrer.save();
    } catch (err) { log("Referral Bonus Error: " + err.message); }
}

function cleanServiceName(name = "") { return String(name || "").replace(/\\/g, "").trim() || "SMM Service"; }

function detectPlatform(service = {}) {
    const text = `${service.name || ""} ${service.category || ""}`.toLowerCase();
    if (/(instagram|insta|ig)/.test(text)) return "Instagram";
    if (/(tiktok|tik tok|tt)/.test(text)) return "TikTok";
    if (/(youtube|yt)/.test(text)) return "YouTube";
    if (/(facebook|fb)/.test(text)) return "Facebook";
    if (/(twitter|x)/.test(text)) return "Twitter/X";
    if (/(telegram|tg)/.test(text)) return "Telegram";
    return "Other";
}

function applyFinalPrice(originalRate, name) {
    const t = String(name).toLowerCase();
    let markup = 40;
    if (t.includes("like")) markup = 30;
    if (t.includes("follower")) markup = 25;
    if (t.includes("view")) markup = 35;
    return Number((Number(originalRate || 0) + markup).toFixed(2));
}

/**
=========================================
PAYNECTA WEBHOOK & CALLBACKS
=========================================
*/
app.post("/api/paynecta/webhook", async (req, res) => {
    const event = req.body;
    res.status(200).send("Webhook received");
    try {
        const { event_type, data } = event;
        const transaction = data.transaction;
        const phone = transaction?.mobile_number || data?.PhoneNumber || data?.phone;

        if (event_type === "payment.completed") {
            let searchPhone = String(phone);
            if (searchPhone.startsWith('0')) searchPhone = searchPhone.substring(1);
            if (searchPhone.startsWith('254')) searchPhone = searchPhone.substring(3);

            const user = await User.findOne({ phone: { $regex: searchPhone } });
            if (user) {
                const transCode = data.MpesaReceiptNumber || transaction.reference;
                const existingDeposit = await Deposit.findOne({ transactionCode: transCode });
                if (!existingDeposit) {
                    await Deposit.create({
                        userId: user._id, userEmail: user.email, phone: user.phone,
                        amount: Number(transaction.amount), transactionCode: transCode, status: "completed"
                    });
                    user.balance += Number(transaction.amount);
                    await user.save();
                }
            }
        } 
    } catch (err) { log(`Webhook Error: ${err.message}`); }
});

/**
=========================================
PAYNECTA INTEGRATION ENDPOINTS
=========================================
*/
app.get("/api/paynecta/link", auth, (req, res) => {
    res.json({ success: true, payment_url: PAYNECTA_PAYMENT_PAGE });
});

app.post("/api/paynecta/initialize", auth, async (req, res) => {
    try {
        const { code, amount, mobile_number } = req.body;
        let formattedPhone = String(mobile_number);
        if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);
        if (!formattedPhone.startsWith('254')) formattedPhone = '254' + formattedPhone;

        const response = await axios.post(`${PAYNECTA_BASE_URL}/payment/initialize`, {
            code: code || "600",
            amount,
            mobile_number: formattedPhone
        }, {
            headers: {
                "X-API-Key": process.env.PAYNECTA_API_KEY,
                "X-User-Email": ADMIN_EMAIL,
                "Content-Type": "application/json"
            }
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        const status = error.response ? error.response.status : 500;
        res.status(status).json(error.response ? error.response.data : { error: "Payment initiation failed" });
    }
});

app.get("/api/paynecta/status", auth, async (req, res) => {
    try {
        const { transaction_reference } = req.query;
        const response = await axios.get(`${PAYNECTA_BASE_URL}/payment/status`, {
            params: { transaction_reference },
            headers: { "X-API-Key": process.env.PAYNECTA_API_KEY, "X-User-Email": ADMIN_EMAIL }
        });
        res.json(response.data);
    } catch (error) { res.status(400).json({ success: false, message: "Could not retrieve status" }); }
});

/**
=========================================
SMM & USER ENDPOINTS
=========================================
*/
app.post("/api/register", async (req, res) => {
    try {
        const { username, email, password, phone, referralCode } = req.body;
        const exists = await User.findOne({ $or: [{ email: email?.toLowerCase() }, { phone }, { username: username?.toLowerCase() }] });
        if (exists) return res.status(400).json({ error: "Account already exists" });
        await User.create({ username: username?.toLowerCase(), email: email?.toLowerCase(), password, phone, referralCode: generateReferralCode(), referredBy: referralCode || null, balance: 0 });  
        res.json({ success: true, message: "Registration successful" });
    } catch (err) { res.status(500).json({ error: "Registration failed" }); }
});

app.post("/api/login", async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const user = await User.findOne({ $or: [{ email: identifier?.toLowerCase() }, { username: identifier?.toLowerCase() }], password });
        if (!user) return res.status(400).json({ error: "Invalid credentials" });  
        const token = jwt.sign({ id: user._id, email: user.email, username: user.username, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: "7d" });  
        res.json({ token, balance: user.balance });
    } catch (err) { res.status(500).json({ error: "Login failed" }); }
});

app.get("/api/services", async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === "true";
        let services = await Service.find();
        if (!services.length || forceRefresh) {  
            const url = `https://delixgainske.com/api/v2?action=services&key=${process.env.SMM_API_KEY}`;  
            const response = await axios.get(url);  
            const list = Array.isArray(response.data) ? response.data : [];  
            if (list.length > 0) {  
                await Service.deleteMany({});  
                const mapped = list.map(s => ({ serviceId: String(s.service), name: cleanServiceName(s.name), rate: Number(s.rate || 0), min: Number(s.min || 1), max: Number(s.max || 10000), category: s.category || "General", platform: detectPlatform(s), provider: "DELIXGAINS" }));  
                await Service.insertMany(mapped);  
                services = await Service.find();  
            }  
        }  
        const grouped = {};  
        services.forEach(s => {  
            const p = s.platform; const c = s.category;  
            if (!grouped[p]) grouped[p] = {}; if (!grouped[p][c]) grouped[p][c] = [];  
            grouped[p][c].push({ ...s.toObject(), rate: applyFinalPrice(s.rate, s.name) });  
        });  
        res.json({ success: true, data: grouped });
    } catch (err) { res.status(500).json({ error: "Failed to load services" }); }
});

app.post("/api/order", auth, async (req, res) => {
    try {
        const { serviceId, link, quantity } = req.body;
        const service = await Service.findOne({ serviceId });
        const user = await User.findById(req.user.id);  
        const totalCost = (applyFinalPrice(service.rate, service.name) / 1000) * Number(quantity);  
        if (user.balance < totalCost) return res.status(400).json({ error: `Insufficient balance` });  
        const providerRes = await axios.get(`https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${quantity}`);  
        if (providerRes.data && providerRes.data.order) {  
            const order = await Order.create({ userId: user._id, userEmail: user.email, serviceId, serviceName: service.name, orderId: String(providerRes.data.order), link, quantity, cost: totalCost, status: "pending" });  
            user.balance -= totalCost; await user.save(); await giveReferralBonus(user._id, totalCost);  
            res.json({ success: true, orderId: order.orderId, newBalance: user.balance.toFixed(2) });  
        } else { res.status(400).json({ error: "Provider error." }); }
    } catch (err) { res.status(500).json({ error: "Order failed." }); }
});

/**
=========================================
ADMIN & ROUTES
=========================================
*/
app.get("/api/admin/users", adminAuth, async (req, res) => { res.json(await User.find().select("-password")); });

const pagesList = ["home", "platform", "packages", "new-order", "my-orders", "services", "add-funds", "referrals", "dashboard"];
pagesList.forEach(page => {
    app.get(`/${page}`, (req, res) => res.sendFile(path.join(__dirname, "public", `${page}.html`)));
});
app.get("/admin", adminAuth, (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 UNASEMEJE ø DIA - Online on port ${PORT}`));
