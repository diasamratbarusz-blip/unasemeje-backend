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
// Updated to match your specific owner identity across the system
const ADMIN_EMAIL = "diasamratbarusz@gmail.com".toLowerCase();
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
 * DATABASE CONNECTION
 * =========================================
 */
connectDB()
    .then(() => {
        console.log("\n=======================================");
        console.log("🚀 UNASEMEJE ø DIA SERVER STARTED");
        console.log("=======================================\n");

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
 * PAYNECTA VERIFY
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
        console.log("❌ Paynecta Verify Error:", error.message);
    }
}

/**
 * =========================================
 * AUTH MIDDLEWARE
 * =========================================
 */
function auth(req, res, next) {
    try {
        const header = req.headers.authorization;
        if (!header) return res.status(401).json({ error: "Access denied." });
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
        if (userEmail === ADMIN_EMAIL && req.user.phone === ADMIN_PHONE) {
            next();
        } else {
            log(`UNAUTHORIZED ACCESS ATTEMPT: ${userEmail}`);
            return res.status(403).json({ error: "Forbidden: Owner access only." });
        }
    });
}

/**
 * =========================================
 * BUSINESS LOGIC
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

/**
 * =========================================
 * PAYNECTA AUTOMATED WEBHOOK (INTEGRATED)
 * =========================================
 */
app.post("/api/paynecta/webhook", async (req, res) => {
    // Acknowledge receipt immediately to maintain portal success metrics
    res.status(200).send("Webhook received");

    try {
        const event = req.body;
        const { event_type, data } = event;
        const transaction = data?.transaction || {};

        const phone = transaction.mobile_number || data?.PhoneNumber || data?.phone;

        if (event_type === "payment.completed" && phone) {
            const cleanPhone = String(phone).replace(/\s+/g, '');

            // SEARCH: Find user across primary phone and all 3 payment profile slots
            const user = await User.findOne({
                $or: [
                    { phone: { $regex: cleanPhone } },
                    { paymentPhone1: cleanPhone },
                    { paymentPhone2: cleanPhone },
                    { paymentPhone3: cleanPhone }
                ]
            });

            if (user) {
                const transCode = data?.MpesaReceiptNumber || transaction.reference || crypto.randomBytes(4).toString("hex");
                const existingDeposit = await Deposit.findOne({ transactionCode: transCode });

                if (!existingDeposit) {
                    const amount = Number(transaction.amount || 0);

                    await Deposit.create({
                        userId: user._id,
                        userEmail: user.email,
                        phone: cleanPhone,
                        amount: amount,
                        transactionCode: transCode,
                        status: "completed"
                    });

                    user.balance += amount;
                    await user.save();
                    log(`🎉 AUTO-CREDIT: ${user.email} matched via ${cleanPhone}. Added KES ${amount}`);
                }
            }
        }
    } catch (err) {
        log(`Webhook Error: ${err.message}`);
    }
});

/**
 * =========================================
 * PROFILE & PAYMENT CHANNEL ENDPOINTS
 * =========================================
 */

// Save profile data from Add Funds modal
app.post("/api/user/update-payment-profile", auth, async (req, res) => {
    try {
        const { name, email, phones } = req.body;
        const user = await User.findById(req.user.id);
        
        user.paymentProfileName = name;
        user.paymentProfileEmail = email;
        user.paymentPhone1 = phones[0] || null;
        user.paymentPhone2 = phones[1] || null;
        user.paymentPhone3 = phones[2] || null;

        await user.save();
        res.json({ success: true, message: "Payment channels synchronized." });
    } catch (err) {
        res.status(500).json({ error: "Failed to save profile." });
    }
});

/**
 * =========================================
 * SMM & ORDER ROUTES (UNCHANGED)
 * =========================================
 */
app.get("/api/services", async (req, res) => {
    try {
        const services = await Service.find();
        const grouped = {};
        services.forEach(s => {
            const p = s.platform;
            const c = s.category;
            if (!grouped[p]) grouped[p] = {};
            if (!grouped[p][c]) grouped[p][c] = [];
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

        if (user.balance < totalCost) return res.status(400).json({ error: "Insufficient balance" });

        const providerRes = await axios.get(`https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${quantity}`);

        if (providerRes.data?.order) {
            await Order.create({ userId: user._id, userEmail: user.email, serviceId, serviceName: service.name, orderId: String(providerRes.data.order), link, quantity, cost: totalCost, status: "pending" });
            user.balance -= totalCost;
            await user.save();
            await giveReferralBonus(user._id, totalCost);
            res.json({ success: true, newBalance: user.balance.toFixed(2) });
        } else { res.status(400).json({ error: "Provider rejected order." }); }
    } catch (err) { res.status(500).json({ error: "Order failed." }); }
});

/**
 * =========================================
 * AUTH & USER ROUTES
 * =========================================
 */
app.post("/api/register", async (req, res) => {
    try {
        const { username, email, password, phone, referralCode } = req.body;
        const exists = await User.findOne({ $or: [{ email: email?.toLowerCase() }, { phone }] });
        if (exists) return res.status(400).json({ error: "Account exists" });

        await User.create({
            username: username?.toLowerCase(), email: email?.toLowerCase(),
            password, phone, referralCode: generateReferralCode(),
            referredBy: referralCode || null
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Registration failed" }); }
});

app.post("/api/login", async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const user = await User.findOne({ $or: [{ email: identifier?.toLowerCase() }, { username: identifier?.toLowerCase() }], password });
        if (!user) return res.status(400).json({ error: "Invalid credentials" });

        const token = jwt.sign({ id: user._id, email: user.email, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.json({ token, balance: user.balance });
    } catch (err) { res.status(500).json({ error: "Login failed" }); }
});

app.get("/api/me", auth, async (req, res) => {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
});

/**
 * =========================================
 * STATIC ROUTES & ADMIN
 * =========================================
 */
const pages = ["home", "platform", "packages", "new-order", "my-orders", "services", "add-funds", "referrals", "dashboard"];
pages.forEach(p => app.get(`/${p}`, (req, res) => res.sendFile(path.join(__dirname, "public", `${p}.html`))));
app.get("/admin", adminAuth, (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "home.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 UNASEMEJE ø DIA - Online on port ${PORT}`));
