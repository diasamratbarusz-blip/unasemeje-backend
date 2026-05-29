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

const PAYNECTA_PAYMENT_PAGE =
    process.env.PAYNECTA_PAYMENT_PAGE ||
    "https://paynecta.co.ke/pay/Unasemeje";

const app = express();

/**
 * =========================================
 * MIDDLEWARE & CONFIG
 * =========================================
 */
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            "https://unasemeje-frontend.vercel.app",
            "http://localhost:3000",
            "http://localhost:5000",
            "http://localhost:3001"
        ];
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-API-Key",
        "X-User-Email"
    ]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/**
 * =========================================
 * DATABASE CONNECTION & STARTUP
 * =========================================
 */
connectDB()
    .then(() => {
        console.log("\n=======================================");
        console.log("🚀 UNASEMEJE ø DIA SERVER STARTED");
        console.log("=======================================\n");

        console.log(
            "P1 (Delixgains):",
            "https://delixgainske.com/api/v2",
            process.env.SMM_API_KEY ? "✅ CONNECTED" : "❌ NO API KEY"
        );

        console.log(
            "Paynecta API:",
            process.env.PAYNECTA_API_KEY ? "✅ CONNECTED" : "❌ NO API KEY"
        );

        verifyPaynecta();
    })
    .catch(err => {
        console.log("❌ MongoDB Connection Error:", err.message);
    });

/**
 * =========================================
 * PAYNECTA VERIFY UTILITY
 * =========================================
 */
async function verifyPaynecta() {
    try {
        const response = await axios.get(
            `${PAYNECTA_BASE_URL}/auth/verify`,
            {
                headers: {
                    "X-API-Key": process.env.PAYNECTA_API_KEY,
                    "X-User-Email": ADMIN_EMAIL
                }
            }
        );

        if (response.data && response.data.success) {
            console.log("✅ Paynecta Verified:", response.data.data?.email || ADMIN_EMAIL);
        } else {
            console.log("❌ Paynecta Verification Failed");
        }
    } catch (error) {
        console.log("❌ Paynecta Verify Error:", error.response?.data || error.message);
    }
}

/**
 * =========================================
 * AUTHENTICATION MIDDLEWARES
 * =========================================
 */
function auth(req, res, next) {
    try {
        const header = req.headers.authorization;
        if (!header) return res.status(401).json({ error: "Access denied. No token provided." });

        const token = header.split(" ")[1];
        if (!token) return res.status(401).json({ error: "Invalid authorization token" });

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

        if (!isAuthorized) {
            log(`UNAUTHORIZED ACCESS ATTEMPT: ${userEmail}`);
            return res.status(403).json({ error: "Forbidden: Owner access only." });
        }
        next();
    });
}

/**
 * =========================================
 * BUSINESS LOGIC HELPERS
 * =========================================
 */
function generateReferralCode() {
    return crypto.randomBytes(4).toString("hex");
}

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
        log(`Referral bonus KES ${bonus} sent to ${referrer.username}`);
    } catch (err) {
        log("Referral Bonus Error: " + err.message);
    }
}

function cleanServiceName(name = "") {
    return String(name || "").replace(/\\/g, "").replace(/\[.*?\]/g, "").trim() || "SMM Service";
}

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

function formatKenyaPhone(phone) {
    let formatted = String(phone || "").replace(/\D/g, "");
    if (formatted.startsWith("0")) formatted = "254" + formatted.substring(1);
    else if (formatted.startsWith("7")) formatted = "254" + formatted;
    else if (formatted.startsWith("254") && formatted.length === 12) return formatted;
    return formatted;
}

/**
 * =========================================
 * PAYNECTA WEBHOOK (Optimized for SDK pattern)
 * =========================================
 */
app.post("/api/paynecta/webhook", async (req, res) => {
    // Paynecta expects a 200 response immediately to prevent retries
    res.status(200).json({ status: "success" });

    try {
        const { event_type, data } = req.body;
        
        // Handle successful payment
        if (event_type === "payment.completed") {
            const transaction = data.transaction;
            const rawPhone = transaction.mobile_number;
            
            // Normalize phone for searching
            let searchPhone = String(rawPhone || "");
            if (searchPhone.startsWith("254")) searchPhone = searchPhone.substring(3);
            if (searchPhone.startsWith("0")) searchPhone = searchPhone.substring(1);

            // Find user by partial phone match
            const user = await User.findOne({ phone: { $regex: searchPhone } });

            if (user) {
                const transCode = transaction.reference || data.MpesaReceiptNumber;
                const existingDeposit = await Deposit.findOne({ transactionCode: transCode });

                if (!existingDeposit) {
                    const depositAmount = Number(transaction.amount);
                    
                    await Deposit.create({
                        userId: user._id,
                        userEmail: user.email,
                        phone: user.phone,
                        amount: depositAmount,
                        transactionCode: transCode,
                        status: "completed"
                    });

                    user.balance += depositAmount;
                    await user.save();
                    log(`💰 Webhook: Credited KES ${depositAmount} to ${user.email} (Ref: ${transCode})`);
                }
            } else {
                log(`⚠️ Webhook: Received payment for untracked phone: ${rawPhone}`);
            }
        }
    } catch (err) {
        log(`❌ Webhook Processing Error: ${err.message}`);
    }
});

/**
 * =========================================
 * PAYNECTA ENDPOINTS (Synced with SDK/API v1)
 * =========================================
 */

// 1. Direct Payment Link for Fallback
app.get("/api/paynecta/links", auth, async (req, res) => {
    try {
        const response = await axios.get(`${PAYNECTA_BASE_URL}/links`, {
            headers: { 
                "X-API-Key": process.env.PAYNECTA_API_KEY, 
                "X-User-Email": ADMIN_EMAIL 
            }
        });
        res.json({ success: true, data: response.data.data });
    } catch (error) {
        // Return your manual fallback link if API link list fails
        res.json({ success: true, data: [{ link_url: PAYNECTA_PAYMENT_PAGE }] });
    }
});

// 2. Initialize STK Push
app.post("/api/paynecta/initialize", auth, async (req, res) => {
    try {
        const { amount, mobile_number } = req.body;
        
        if (!amount || !mobile_number) {
            return res.status(400).json({ success: false, error: "Amount and phone number are required" });
        }

        const payload = {
            amount: Number(amount),
            mobile_number: formatKenyaPhone(mobile_number),
            code: "STK", // "STK" triggers the push prompt
            reference: "UNAS_" + Date.now()
        };

        const response = await axios.post(`${PAYNECTA_BASE_URL}/payment/initialize`, payload, {
            headers: { 
                "Content-Type": "application/json", 
                "X-API-Key": process.env.PAYNECTA_API_KEY, 
                "X-User-Email": ADMIN_EMAIL 
            }
        });

        // The SDK/API returns success and transaction data
        res.json(response.data);
    } catch (error) {
        const errMsg = error.response?.data?.message || "Payment service temporarily unavailable";
        log(`❌ STK Init Error: ${errMsg}`);
        res.status(500).json({ success: false, error: errMsg });
    }
});

// 3. Check Transaction Status (Polling)
app.get("/api/paynecta/status", auth, async (req, res) => {
    try {
        const { transaction_reference } = req.query;
        if (!transaction_reference) return res.status(400).json({ success: false, error: "Reference required" });

        const response = await axios.get(`${PAYNECTA_BASE_URL}/payment/status`, {
            params: { transaction_reference },
            headers: { 
                "X-API-Key": process.env.PAYNECTA_API_KEY, 
                "X-User-Email": ADMIN_EMAIL 
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(400).json({ success: false, message: "Status check failed" });
    }
});

/**
 * =========================================
 * USER ACCOUNT ENDPOINTS
 * =========================================
 */
app.post("/api/register", async (req, res) => {
    try {
        const { username, email, password, phone, referralCode } = req.body;
        const exists = await User.findOne({ $or: [{ email: email?.toLowerCase() }, { phone }, { username: username?.toLowerCase() }] });
        if (exists) return res.status(400).json({ error: "Account already exists" });

        await User.create({
            username: username?.toLowerCase(),
            email: email?.toLowerCase(),
            password,
            phone,
            referralCode: generateReferralCode(),
            referredBy: referralCode || null,
            balance: 0
        });
        res.json({ success: true, message: "Registration successful" });
    } catch (err) {
        res.status(500).json({ error: "Registration failed" });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const user = await User.findOne({
            $or: [{ email: identifier?.toLowerCase() }, { username: identifier?.toLowerCase() }],
            password
        });
        if (!user) return res.status(400).json({ error: "Invalid credentials" });

        const token = jwt.sign({ id: user._id, email: user.email, username: user.username, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.json({ token, balance: user.balance });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});

app.get("/api/me", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Error fetching profile" });
    }
});

/**
 * =========================================
 * SERVICES & ORDERS
 * =========================================
 */
app.get("/api/services", async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === "true";
        let services = await Service.find();

        if (!services.length || forceRefresh) {
            const response = await axios.get(`https://delixgainske.com/api/v2?action=services&key=${process.env.SMM_API_KEY}`);
            const list = Array.isArray(response.data) ? response.data : [];

            if (list.length > 0) {
                await Service.deleteMany({});
                const mapped = list.map(s => ({
                    serviceId: String(s.service),
                    name: cleanServiceName(s.name),
                    rate: Number(s.rate || 0),
                    min: Number(s.min || 1),
                    max: Number(s.max || 10000),
                    category: s.category || "General",
                    platform: detectPlatform(s),
                    provider: "DELIXGAINS"
                }));
                await Service.insertMany(mapped);
                services = await Service.find();
            }
        }

        const grouped = {};
        services.forEach(s => {
            const p = s.platform;
            const c = s.category;
            if (!grouped[p]) grouped[p] = {};
            if (!grouped[p][c]) grouped[p][c] = [];
            grouped[p][c].push({ ...s.toObject(), rate: applyFinalPrice(s.rate, s.name) });
        });
        res.json({ success: true, data: grouped });
    } catch (err) {
        res.status(500).json({ error: "Failed to load services" });
    }
});

app.post("/api/order", auth, async (req, res) => {
    try {
        const { serviceId, link, quantity } = req.body;
        const service = await Service.findOne({ serviceId });
        if (!service) return res.status(404).json({ error: "Service unavailable" });

        const user = await User.findById(req.user.id);
        const totalCost = (applyFinalPrice(service.rate, service.name) / 1000) * Number(quantity);

        if (user.balance < totalCost) return res.status(400).json({ error: "Insufficient balance" });

        const providerRes = await axios.get(`https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${quantity}`);

        if (providerRes.data && providerRes.data.order) {
            const order = await Order.create({
                userId: user._id, userEmail: user.email, serviceId, serviceName: service.name,
                orderId: String(providerRes.data.order), link, quantity, cost: totalCost, status: "pending"
            });
            user.balance -= totalCost;
            await user.save();
            await giveReferralBonus(user._id, totalCost);
            res.json({ success: true, orderId: order.orderId, newBalance: user.balance.toFixed(2) });
        } else {
            res.status(400).json({ error: "Provider error." });
        }
    } catch (err) {
        res.status(500).json({ error: "Order failed." });
    }
});

/**
 * =========================================
 * ADMIN & STATIC ROUTES
 * =========================================
 */
const pages = ["home", "platform", "packages", "new-order", "my-orders", "services", "add-funds", "referrals", "dashboard"];
pages.forEach(p => app.get(`/${p}`, (req, res) => res.sendFile(path.join(__dirname, "public", `${p}.html`))));

app.get("/admin", adminAuth, (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "home.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 UNASEMEJE ø DIA - Online on port ${PORT}`));
