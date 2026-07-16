// ================= IMPORTS =================
require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const connectDB = require("./config/db");
const log = require("./utils/logger");

// ================= ROUTES =================
const paynectaInitializeRoutes = require("./api/paynecta/initialize/routes");

// ================= MODELS =================
const User = require("./models/User");
const Order = require("./models/Order");
const Deposit = require("./models/Deposit");
const Service = require("./models/Service");

// ================= CHAT SECURITY MODELS =================
const chatLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userEmail: String,
    username: String,
    userMessage: String,
    aiReply: String,
    createdAt: { type: Date, default: Date.now }
});
const ChatLog = mongoose.models.ChatLog || mongoose.model('ChatLog', chatLogSchema);

const chatBanSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },
    reason: String,
    expiresAt: { type: Date, required: true }
});
const ChatBan = mongoose.models.ChatBan || mongoose.model('ChatBan', chatBanSchema);

// ================= SEO CONFIGURATION MODELS =================
const seoSchema = new mongoose.Schema({
    title: { type: String, default: "UNASEMEJE SMM GAINS" },
    metaDescription: { type: String, default: "Get instant SMM services, followers, and engagement metrics." },
    metaKeywords: { type: String, default: "smm, panel, marketing, followers, views" },
    ogTitle: { type: String, default: "UNASEMEJE SMM GAINS" },
    ogDescription: { type: String, default: "Get instant SMM services, followers, and engagement metrics." },
    ogImage: { type: String, default: "" }, // Base64 formatted or absolute URL path (Saved permanently to MongoDB)
    favicon: { type: String, default: "" }, // Base64 formatted or absolute URL path (Saved permanently to MongoDB)
    updatedAt: { type: Date, default: Date.now }
});
const SeoSettings = mongoose.models.SeoSettings || mongoose.model('SeoSettings', seoSchema);

// Fixed ID to guarantee exactly ONE permanent SEO document in MongoDB
const FIXED_SEO_ID = new mongoose.Types.ObjectId("60c72b2f9b1d8b2d88a12345");

// ================= CONFIGURATION & CONSTANTS =================
const SITE_NAME = "UNASEMEJE SMM GAINS"; // 🎯 Official Website Name
const ADMIN_EMAIL = (process.env.PAYNECTA_USER_EMAIL || "diasamratbarusz@gmail.com").toLowerCase();
const ADMIN_PHONE = "0715509440";

const PAYNECTA_BASE_URL = "https://paynecta.co.ke/api/v1";

const PAYNECTA_PAYMENT_PAGE =
    process.env.PAYNECTA_PAYMENT_PAGE ||
    "https://paynecta.co.ke/pay/unasemeje";

const PAYNECTA_PAYMENT_CODE = process.env.PAYNECTA_PAYMENT_CODE || "PNT_488024";

const app = express();

/**
 * =========================================
 * MIDDLEWARE & CONFIG
 * =========================================
 */
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        if (/\.vercel\.app$/.test(origin)) {
            return callback(null, true);
        }

        if (/unasemeje\.co\.ke$/.test(origin)) {
            return callback(null, true);
        }
        
        const allowedOrigins = [
            "http://localhost:3000",
            "http://localhost:5000",
            "http://localhost:3001",
            "http://127.0.0.1:5500"
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-API-Key",
        "X-User-Email"
    ],
    credentials: true
}));

app.use(express.json({ limit: '15mb' })); // Increased to 15MB for Base64 audio uploads and SEO images
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, "public")));

app.use(paynectaInitializeRoutes);

/**
 * =========================================
 * VERCEL COMPATIBLE DATABASE MIDDLEWARE
 * =========================================
 */
let dbConnectPromise = null;

app.use(async (req, res, next) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            if (!dbConnectPromise) {
                dbConnectPromise = connectDB();
            }
            await dbConnectPromise;
        }
        next();
    } catch (err) {
        console.error("❌ Middleware Database Connection Failure:", err.message);
        res.status(500).json({ error: "Database connectivity error." });
    }
});

/**
 * =========================================
 * DATABASE CONNECTION (TRADITIONAL INSTANCE RUNTIME)
 * =========================================
 */
if (!process.env.VERCEL) {
    connectDB()
        .then(() => {
            console.log("\n=======================================");
            console.log(`🚀 ${SITE_NAME} SERVER STARTED`);
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
            
            console.log(
                "Paynecta Email:",
                ADMIN_EMAIL,
                process.env.PAYNECTA_USER_EMAIL ? "✅ FROM ENV" : "⚠️ USING DEFAULT"
            );
            
            console.log(
                "Paynecta Payment Code:",
                PAYNECTA_PAYMENT_CODE
            );

            verifyPaynecta();
        })
        .catch(err => {
            console.log("❌ MongoDB Connection Error:", err.message);
        });
}

/**
 * =========================================
 * PAYNECTA VERIFY
 * =========================================
 */
async function verifyPaynecta() {
    try {
        console.log(`\n[PAYNECTA VERIFY] Testing connection with email: ${ADMIN_EMAIL}`);
        
        const response = await axios.get(
            `${PAYNECTA_BASE_URL}/auth/verify`,
            {
                headers: {
                    "X-API-Key": process.env.PAYNECTA_API_KEY,
                    "X-User-Email": ADMIN_EMAIL
                },
                timeout: 10000
            }
        );
        
        if (response.data && response.data.success) {
            console.log("✅ Paynecta Verified:", response.data.data?.email || ADMIN_EMAIL);
            console.log("✅ PayNecta connection is working correctly!\n");
        } else {
            console.log("❌ Paynecta Verification Failed");
            console.log("❌ Response:", response.data, "\n");
        }
    } catch (error) {
        console.log("❌ Paynecta Verify Error:", error.response?.data || error.message);
        
        if (error.response?.data?.error === 'USER_NOT_FOUND') {
            console.log("\n⚠️  IMPORTANT: The email '" + ADMIN_EMAIL + "' is NOT registered in PayNecta!");
            console.log("⚠️  Please check your PayNecta dashboard for the correct email.");
            console.log("⚠️  Then set it in your environment variables as PAYNECTA_USER_EMAIL\n");
        }
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
        if (!header) return res.status(401).json({ error: "Access denied. No token provided." });
        const token = header.split(" ")[1];
        if (!token) return res.status(401).json({ error: "Invalid authorization token" });
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

/**
 * =========================================
 * ADMIN AUTH
 * =========================================
 */
function adminAuth(req, res, next) {
    auth(req, res, () => {
        const userEmail = req.user.email ? req.user.email.toLowerCase() : "";
        const isAuthorized = userEmail === ADMIN_EMAIL || req.user.phone === ADMIN_PHONE;
        if (!isAuthorized) {
            log(`UNAUTHORIZED ACCESS ATTEMPT: ${userEmail}`);
            return res.status(403).json({ error: "Forbidden: Owner access only." });
        }
        next();
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
    return String(name || "").replace(/\\/g, "").trim() || "SMM Service";
}

/**
 * 🔧 FIXED PLATFORM DETECTION LOGIC
 * Explicitly structures matches for exact platform tokens first, 
 * preventing generic features from polluting specific category filters.
 */
function detectPlatform(service = {}) {
    const text = `${service.name || ""} ${service.category || ""}`.toLowerCase();
    
    if (/(instagram|insta|ig)/.test(text)) return "Instagram";
    if (/(tiktok|tik tok|tt)/.test(text)) return "TikTok";
    if (/(youtube|yt)/.test(text)) return "YouTube";
    if (/(twitter|x\.com|x post|retweet)/.test(text)) return "Twitter/X";
    if (/(telegram|tg)/.test(text)) return "Telegram";
    
    // Check Facebook last so general keywords like "reel" or "views" don't hijack other platforms
    if (/(facebook|fb|post likes|post views|post comments|page likes|page followers|video views|reel|story)/.test(text)) return "Facebook";
    
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
 * 🔧 FIXED: SECURE PAYNECTA WEBHOOK HANDLER
 * =========================================
 */
const handlePaynectaWebhook = async (req, res) => {
    try {
        const event = req.body;
        const { event_type, data } = event;
        const transaction = data?.transaction || {};

        console.log(`\n[WEBHOOK] ====== PAYNECTA WEBHOOK RECEIVED ======`);
        console.log(`[WEBHOOK] Event Type: ${event_type}`);
        console.log(`[WEBHOOK] Data:`, data);

        if (event_type === "payment.completed") {
            const transactionRef = data?.transaction_reference || 
                                 transaction?.reference || 
                                 data?.CheckoutRequestID;
            
            const amount = Number(transaction.amount || data?.amount || 0);
            const phone = transaction.mobile_number || data?.PhoneNumber || data?.phone;
            
            console.log(`[WEBHOOK] Transaction Ref: ${transactionRef}`);
            console.log(`[WEBHOOK] Amount: KES ${amount}, Phone: ${phone}`);

            const pendingDeposit = await Deposit.findOne({
                $or: [
                    { transactionCode: transactionRef },
                    { code: transactionRef }
                ],
                status: "pending"
            });

            if (!pendingDeposit) {
                console.log(`[WEBHOOK] ⚠️ No pending deposit found for transaction: ${transactionRef}`);
                return res.status(200).send("Webhook received but no pending deposit found");
            }

            console.log(`[WEBHOOK] ✅ Found pending deposit:`, pendingDeposit);

            if (Math.abs(pendingDeposit.amount - amount) > 0.01) {
                console.log(`[WEBHOOK] ❌ Amount mismatch!`);
                return res.status(400).send("Amount mismatch");
            }

            const user = await User.findById(pendingDeposit.userId);
            
            if (!user) {
                console.log(`[WEBHOOK] ❌ User not found`);
                return res.status(404).send("User not found");
            }

            user.balance += amount;
            await user.save();

            pendingDeposit.status = "completed";
            pendingDeposit.message = `Payment completed via PayNecta webhook. Transaction: ${transactionRef}`;
            await pendingDeposit.save();

            console.log(`[WEBHOOK] ✅ SUCCESS! Credited KES ${amount} to ${user.email} (${user.username})`);
            console.log(`[WEBHOOK] New balance: KES ${user.balance}`);

            log(`WEBHOOK FUNDING: ${user.username} | +KES ${amount} | TRX: ${transactionRef}`);
        }
        
        res.status(200).send("Webhook received and processed successfully");
        
    } catch (err) {
        console.error(`[WEBHOOK] ❌ Error:`, err);
        log(`Webhook Processing Error: ${err.message}`);
        res.status(500).send("Error processing webhook");
    }
};

app.get("/api/webhook", (req, res) => {
    res.status(200).json({
        status: "active",
        message: "Paynecta webhook endpoint is healthy and ready to receive POST requests."
    });
});

app.get("/api/paynecta/webhook", (req, res) => {
    res.status(200).json({
        status: "active",
        message: "Paynecta webhook endpoint is healthy and ready to receive POST requests."
    });
});

app.post("/api/webhook", handlePaynectaWebhook);
app.post("/api/paynecta/webhook", handlePaynectaWebhook);

/**
 * =========================================
 * PAYMENT PROFILE ENDPOINTS
 * =========================================
 */
const handleProfileUpdate = async (req, res) => {
    try {
        const { name, username, firstName, lastName, email, phones, paymentPhone1, paymentPhone2, paymentPhone3 } = req.body;
        
        let p1 = paymentPhone1 || (phones && phones[0]);
        let p2 = paymentPhone2 || (phones && phones[1]);
        let p3 = paymentPhone3 || (phones && phones[2]);

        const updatePayload = {};
        
        if (username) updatePayload.username = String(username).toLowerCase().trim();
        if (firstName) updatePayload.firstName = firstName.trim();
        if (lastName) updatePayload.lastName = lastName.trim();
        if (name) updatePayload.paymentProfileName = name.trim();
        if (email) updatePayload.paymentProfileEmail = email.trim();
        
        if (p1 !== undefined) updatePayload.paymentPhone1 = p1 ? String(p1).replace(/[\s+-]/g, '') : null;
        if (p2 !== undefined) updatePayload.paymentPhone2 = p2 ? String(p2).replace(/[\s+-]/g, '') : null;
        if (p3 !== undefined) updatePayload.paymentPhone3 = p3 ? String(p3).replace(/[\s+-]/g, '') : null;

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id, 
            { $set: updatePayload },
            { new: true, runValidators: true }
        );

        if (!updatedUser) return res.status(404).json({ error: "User not found." });

        res.json({ 
            success: true, 
            message: "Profile and payment channels synchronized securely.",
            profile: {
                username: updatedUser.username,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                name: updatedUser.paymentProfileName,
                email: updatedUser.paymentProfileEmail,
                phones: [updatedUser.paymentPhone1, updatedUser.paymentPhone2, updatedUser.paymentPhone3].filter(Boolean)
            }
        });
    } catch (err) {
        console.error("Update Profile Error:", err.message);
        res.status(500).json({ error: "Failed to update your permanent profile identity data." });
    }
};

app.post("/api/user/update-payment-profile", auth, handleProfileUpdate);
app.post("/api/update-payment-profile", auth, handleProfileUpdate); 

app.put("/api/user/update-profile", auth, handleProfileUpdate);
app.post("/api/user/update-profile", auth, handleProfileUpdate);

/**
 * =========================================
 * PAYNECTA ENDPOINTS
 * =========================================
 */
app.get("/api/paynecta/link", auth, (req, res) => {
    res.json({ success: true, payment_url: PAYNECTA_PAYMENT_PAGE });
});

app.get("/api/paynecta/verify", auth, async (req, res) => {
    try {
        const response = await axios.get(`${PAYNECTA_BASE_URL}/auth/verify`, {
            headers: { "X-API-Key": process.env.PAYNECTA_API_KEY, "X-User-Email": ADMIN_EMAIL }
        });
        res.json(response.data);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * =========================================
 * 🔧 FIXED: PAYMENT INITIATION ENDPOINT (STK PUSH)
 * =========================================
 */
app.post("/api/payment/initiate", auth, async (req, res) => {
    try {
        let { amount, phone } = req.body;
        
        console.log(`\n[PAYMENT INITIATE] ====== NEW REQUEST ======`);
        console.log(`[PAYMENT INITIATE] User ID: ${req.user.id}`);
        console.log(`[PAYMENT INITIATE] Using PayNecta Email: ${ADMIN_EMAIL}`);
        console.log(`[PAYMENT INITIATE] Using Payment Code: ${PAYNECTA_PAYMENT_CODE}`);
        console.log(`[PAYMENT INITIATE] Raw input:`, { amount, phone });
        
        if (!amount || !phone) {
            return res.status(400).json({ success: false, error: "Amount and phone number are required" });
        }

        if (Number(amount) < 2) {
            return res.status(400).json({ success: false, error: "Minimum amount is KES 2" });
        }
        
        if (!process.env.PAYNECTA_API_KEY) {
            return res.status(500).json({ success: false, error: "Payment service not configured. Please contact support." });
        }
        
        let formatted = String(phone).replace(/\D/g, "");
        
        if (formatted.startsWith("0")) {
            formatted = "254" + formatted.substring(1);
        }
        if (formatted.startsWith("7") || formatted.startsWith("1")) {
            formatted = "254" + formatted;
        }
        
        if (!formatted.startsWith("254") || formatted.length !== 12) {
            return res.status(400).json({ success: false, error: "Invalid phone number format. Please use 2547XXXXXXXX" });
        }

        console.log(`[PAYMENT INITIATE] ✅ Final formatted: Amount=KES ${amount}, Phone=${formatted}`);

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        const payload = { 
            code: PAYNECTA_PAYMENT_CODE,
            mobile_number: formatted,
            amount: Number(amount)
        };
        
        console.log(`[PAYMENT INITIATE] Payload being sent:`, payload);

        const response = await axios.post(
            `${PAYNECTA_BASE_URL}/payment/initialize`,
            payload,
            { 
                headers: { 
                    "X-API-Key": process.env.PAYNECTA_API_KEY, 
                    "X-User-Email": ADMIN_EMAIL,
                    "Content-Type": "application/json"
                },
                timeout: 30000
            }
        );
        
        console.log(`[PAYMENT INITIATE] ✅ Success!`);
        console.log(`[PAYMENT INITIATE] Response:`, response.data);

        const transactionRef = response.data?.data?.transaction_reference || 
                              response.data?.data?.CheckoutRequestID || 
                              `TRX-${Date.now()}`;

        await Deposit.create({
            userId: req.user.id,
            userEmail: user.email,
            phone: formatted,
            amount: Number(amount),
            transactionCode: transactionRef,
            code: transactionRef,
            source: "stk",
            status: "pending",
            message: `STK Push initiated for KES ${amount} from ${formatted}`
        });

        console.log(`[PAYMENT INITIATE] ✅ Created pending deposit record for user ${user.email}`);

        res.json({ 
            success: true, 
            message: "STK push sent successfully. Check your phone for the M-Pesa prompt.",
            data: response.data,
            transactionReference: transactionRef
        });
        
    } catch (error) {
        console.error(`[PAYMENT INITIATE] ❌ PayNecta Error:`, error.response?.data || error.message);
        
        const paynectaError = error.response?.data;
        
        if (paynectaError?.error === 'USER_NOT_FOUND') {
            return res.status(500).json({ 
                success: false, 
                error: `Payment system misconfigured. Email '${ADMIN_EMAIL}' not registered with PayNecta.`,
                details: "Please contact support to fix this issue."
            });
        }
        
        if (paynectaError?.error === 'INVALID_API_KEY' || paynectaError?.error === 'UNAUTHORIZED') {
            return res.status(500).json({ 
                success: false, 
                error: "Payment service authentication failed.",
                details: "Please contact support."
            });
        }
        
        if (paynectaError?.error === 'FORBIDDEN') {
            return res.status(500).json({ 
                success: false, 
                error: "Insufficient service tokens. Please contact support.",
                details: paynectaError.message
            });
        }
        
        if (paynectaError?.error === 'NOT_FOUND') {
            return res.status(500).json({ 
                success: false, 
                error: "Payment link not found. Check your PAYNECTA_PAYMENT_CODE.",
                details: `Code used: ${PAYNECTA_PAYMENT_CODE}`
            });
        }
        
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ success: false, error: "Payment request timed out. Please try again." });
        }
        
        return res.status(500).json({ 
            success: false, 
            error: paynectaError?.message || "Failed to initiate payment",
            details: paynectaError?.errors || paynectaError?.error || error.message
        });
    }
});

/**
 * =========================================
 * TEST ENDPOINT: Verify PayNecta Connection
 * =========================================
 */
app.get("/api/payment/test", auth, async (req, res) => {
    try {
        console.log(`[PAYMENT TEST] Testing PayNecta connection...`);
        console.log(`[PAYMENT TEST] Using email: ${ADMIN_EMAIL}`);
        console.log(`[PAYMENT TEST] Payment code: ${PAYNECTA_PAYMENT_CODE}`);
        console.log(`[PAYMENT TEST] API Key exists: ${!!process.env.PAYNECTA_API_KEY}`);
        
        if (!process.env.PAYNECTA_API_KEY) {
            return res.json({
                success: false,
                error: "PAYNECTA_API_KEY not configured",
                checks: {
                    apiKey: false,
                    connection: false,
                    email: ADMIN_EMAIL,
                    paymentCode: PAYNECTA_PAYMENT_CODE
                }
            });
        }
        
        const response = await axios.get(`${PAYNECTA_BASE_URL}/auth/verify`, {
            headers: { 
                "X-API-Key": process.env.PAYNECTA_API_KEY, 
                "X-User-Email": ADMIN_EMAIL 
            },
            timeout: 10000
        });
        
        console.log(`[PAYMENT TEST] ✅ PayNecta verified:`, response.data);
        
        res.json({
            success: true,
            message: "PayNecta connection is working",
            checks: {
                apiKey: true,
                connection: true,
                email: ADMIN_EMAIL,
                paymentCode: PAYNECTA_PAYMENT_CODE,
                paynectaEmail: response.data?.data?.email || "Unknown"
            }
        });
        
    } catch (error) {
        console.error(`[PAYMENT TEST] ❌ Error:`, error.response?.data || error.message);
        
        res.json({
            success: false,
            error: error.response?.data?.message || error.message,
            paynectaError: error.response?.data,
            checks: {
                apiKey: !!process.env.PAYNECTA_API_KEY,
                connection: false,
                email: ADMIN_EMAIL,
                paymentCode: PAYNECTA_PAYMENT_CODE
            }
        });
    }
});

app.post("/api/paynecta/stkpush", auth, async (req, res) => {
    try {
        let { amount, phone } = req.body;
        if (!amount || !phone) return res.status(400).json({ error: "Data missing" });
        
        let formatted = String(phone).replace(/\D/g, "");
        if (formatted.startsWith("0")) formatted = "254" + formatted.substring(1);
        if (formatted.startsWith("7") || formatted.startsWith("1")) formatted = "254" + formatted;

        const response = await axios.post(`${PAYNECTA_BASE_URL}/payment/initialize`, 
            { 
                code: PAYNECTA_PAYMENT_CODE,
                amount: Number(amount), 
                mobile_number: formatted 
            },
            { headers: { "X-API-Key": process.env.PAYNECTA_API_KEY, "X-User-Email": ADMIN_EMAIL }}
        );
        res.json({ success: true, data: response.data });
    } catch (error) {
        res.status(500).json({ error: "STK push failed", details: error.response?.data });
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
    } catch (error) {
        res.status(400).json({ error: "Status check failed" });
    }
});

/**
 * =========================================
 * USER AUTH
 * =========================================
 */
app.post("/api/register", async (req, res) => {
    try {
        const { username, email, password, phone, firstName, lastName, paymentPhone1, paymentPhone2, referralCode } = req.body;
        
        if (!email || !password || !phone) {
            return res.status(400).json({ error: "Email address, primary phone number, and secure password are compulsory." });
        }

        const exists = await User.findOne({ $or: [{ email: email?.toLowerCase() }, { phone }] });
        if (exists) return res.status(400).json({ error: "User exists" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const formattedP1 = paymentPhone1 ? String(paymentPhone1).replace(/[\s+-]/g, '') : null;
        const formattedP2 = paymentPhone2 ? String(paymentPhone2).replace(/[\s+-]/g, '') : null;

        await User.create({
            username: username?.toLowerCase() || null,
            email: email?.toLowerCase(),
            password: hashedPassword,
            phone,
            firstName: firstName?.trim() || null,
            lastName: lastName?.trim() || null,
            paymentPhone1: formattedP1,
            paymentPhone2: formattedP2,
            referralCode: generateReferralCode(),
            referredBy: referralCode || null,
            balance: 0
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Registration error details:", err.message);
        res.status(500).json({ error: "Register failed" });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { identifier, password } = req.body;
        
        const user = await User.findOne({
            $or: [{ email: identifier?.toLowerCase() }, { username: identifier?.toLowerCase() }]
        });
        
        if (!user) return res.status(400).json({ error: "Invalid login" });

        let isMatch = false;
        
        if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            isMatch = (user.password === password);
            
            if (isMatch) {
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(password, salt);
                await user.save();
                console.log(`🔐 Security Upgrade: Plain text password hashed for ${user.username}`);
            }
        }

        if (!isMatch) return res.status(400).json({ error: "Invalid login" });

        const token = jwt.sign(
            { id: user._id, email: user.email, phone: user.phone }, 
            process.env.JWT_SECRET, 
            { expiresIn: "7d" }
        );
        
        res.json({ token, balance: user.balance });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Login failed" });
    }
});

app.get("/api/me", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch profile." });
    }
});

app.post("/api/user/change-password", auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);
        
        if (!user) return res.status(400).json({ error: "User not found." });

        let isMatch = false;
        
        if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
            isMatch = await bcrypt.compare(currentPassword, user.password);
        } else {
            isMatch = (user.password === currentPassword);
        }

        if (!isMatch) {
            return res.status(400).json({ error: "Current password is incorrect." });
        }
        
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        
        res.json({ success: true, message: "Password updated successfully." });
    } catch (err) {
        console.error("Change password error:", err);
        res.status(500).json({ error: "Failed to process security modification." });
    }
});

/**
 * =========================================
 * SMM SERVICES & ORDERS
 * =========================================
 */
app.get("/api/services", async (req, res) => {
    try {
        let services = await Service.find();
        
        if (!services.length || req.query.refresh === "true") {
            console.log("🔄 Fetching fresh services from Delixgains provider...");
            
            const response = await axios.get(
                `https://delixgainske.com/api/v2?action=services&key=${process.env.SMM_API_KEY}`
            );
            
            const list = Array.isArray(response.data) ? response.data : [];
            
            if (list.length > 0) {
                console.log(`📦 Received ${list.length} services from provider`);
                
                await Service.deleteMany({});
                
                const mapped = list.map(s => {
                    const categoryName = String(s.category || "General").trim();
                    const serviceName = cleanServiceName(s.name);
                    const platform = detectPlatform(s);
                    
                    console.log(`... Service: "${serviceName}" | Category: "${categoryName}" | Platform: ${platform}`);
                    
                    return {
                        serviceId: String(s.service),
                        name: serviceName,
                        rate: Number(s.rate || 0),
                        min: Number(s.min || 1),
                        max: Number(s.max || 10000),
                        category: categoryName,
                        platform: platform,
                        type: s.type || "",
                        description: s.description || ""
                    };
                });
                
                await Service.insertMany(mapped);
                console.log(`✅ Saved ${mapped.length} services to database`);
                services = await Service.find();
            }
        }
        
        const grouped = {};
        services.forEach(s => {
            if (!grouped[s.platform]) {
                grouped[s.platform] = {};
            }
            if (!grouped[s.platform][s.category]) {
                grouped[s.platform][s.category] = [];
            }
            grouped[s.platform][s.category].push({ 
                ...s.toObject(), 
                rate: applyFinalPrice(s.rate, s.name) 
            });
        });
        
        Object.keys(grouped).forEach(platform => {
            const categories = Object.keys(grouped[platform]);
            const totalServices = categories.reduce((sum, cat) => sum + grouped[platform][cat].length, 0);
            console.log(`📊 ${platform}: ${categories.length} categories, ${totalServices} services`);
            console.log(`   Categories: ${categories.join(", ")}`);
        });
        
        res.json({ success: true, data: grouped });
    } catch (err) {
        console.error("❌ Service fetch error:", err.message);
        res.status(500).json({ error: "Service error: " + err.message });
    }
});

app.post("/api/order", auth, async (req, res) => {
    try {
        const { serviceId, link, quantity } = req.body;
        const service = await Service.findOne({ serviceId });
        const user = await User.findById(req.user.id);
        const cost = (applyFinalPrice(service.rate, service.name) / 1000) * Number(quantity);

        if (user.balance < cost) return res.status(400).json({ error: "Low balance" });

        const pRes = await axios.get(`https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${quantity}`);

        if (pRes.data?.order) {
            await Order.create({
                userId: user._id, userEmail: user.email, serviceId, serviceName: service.name,
                orderId: String(pRes.data.order), link, quantity, cost, status: "pending"
            });
            user.balance -= cost;
            await user.save();
            await giveReferralBonus(user._id, cost);
            res.json({ success: true, newBalance: user.balance });
        } else {
            res.status(400).json({ error: "SMM Provider error" });
        }
    } catch (err) {
        res.status(500).json({ error: "Order failed" });
    }
});

app.get("/api/sync-orders", auth, async (req, res) => {
    const active = await Order.find({ userId: req.user.id, status: "pending" });
    if (active.length) {
        const ids = active.map(o => o.orderId).join(",");
        const resObj = await axios.get(`https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=status&orders=${ids}`);
        for (let id in resObj.data) {
            await Order.findOneAndUpdate({ orderId: id }, { status: resObj.data[id].status.toLowerCase() });
        }
    }
    const updated = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(updated);
});

/**
 * =========================================
 * DEPOSITS & SUPREME ADMIN CONTROL CENTER
 * =========================================
 */
app.get("/api/deposits", auth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const deposits = await Deposit.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(limit);
        res.json(deposits);
    } catch (err) {
        console.error("Deposits fetch error:", err);
        res.status(500).json({ error: "Failed to fetch deposits" });
    }
});

app.post("/api/deposit", auth, async (req, res) => {
    try {
        const { amount, transactionCode } = req.body;
        const code = transactionCode.toUpperCase();
        const exists = await Deposit.findOne({ transactionCode: code });
        if (exists) return res.status(400).json({ error: "Transaction already registered." });
        
        await Deposit.create({ 
            userId: req.user.id, 
            userEmail: req.user.email, 
            amount: Number(amount), 
            transactionCode: code, 
            status: "pending",
            source: "manual_verification"
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Deposit request failed." });
    }
});

// ==========================================
// SUPREME ADMIN ROUTES
// ==========================================

app.get("/api/admin/users", async (req, res) => {
    try {
        res.json(await User.find().select("-password").sort({ createdAt: -1 }));
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users." });
    }
});

app.get("/api/admin/deposits", async (req, res) => {
    try {
        res.json(await Deposit.find().sort({ createdAt: -1 }));
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch deposits." });
    }
});

app.get("/api/admin/orders", async (req, res) => {
    try {
        res.json(await Order.find().sort({ createdAt: -1 }));
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch orders." });
    }
});

app.post("/api/admin/approve-deposit", async (req, res) => {
    try {
        const dep = await Deposit.findById(req.body.depositId);
        if (dep && (dep.status === "pending" || dep.status === "failed")) {
            const user = await User.findById(dep.userId);
            user.balance += dep.amount;
            dep.status = "completed";
            await user.save();
            await dep.save();
            res.json({ success: true });
        } else {
            res.status(400).json({ error: "Deposit not found or already processed." });
        }
    } catch (err) {
        res.status(500).json({ error: "Failed to approve deposit." });
    }
});

app.post("/api/admin/cancel-deposit", async (req, res) => {
    try {
        const dep = await Deposit.findById(req.body.depositId);
        if (dep && (dep.status === "pending" || dep.status === "failed")) {
            dep.status = "cancelled";
            await dep.save();
            res.json({ success: true });
        } else {
            res.status(400).json({ error: "Deposit not found or already processed." });
        }
    } catch (err) {
        res.status(500).json({ error: "Failed to cancel deposit." });
    }
});

app.post("/api/admin/update-balance", async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found." });
        user.balance = Number(amount);
        await user.save();
        log(`ADMIN OVERRIDE: Balance for ${user.email} set to KES ${amount}`);
        res.json({ success: true, newBalance: user.balance });
    } catch (err) {
        res.status(500).json({ error: "Failed to update balance." });
    }
});

// --- GLOBAL SITE CONTROL ---
const settingSchema = new mongoose.Schema({
    key: { type: String, unique: true },
    value: mongoose.Schema.Types.Mixed
});
const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);

app.post("/api/admin/announce", async (req, res) => {
    try {
        const { message } = req.body;
        await Setting.findOneAndUpdate(
            { key: "announcement" },
            { value: message },
            { upsert: true, new: true }
        );
        log(`ADMIN BROADCAST: ${message}`);
        res.json({ success: true, message: "Announcement saved." });
    } catch (err) {
        res.status(500).json({ error: "Failed to broadcast." });
    }
});

app.post("/api/admin/maintenance", async (req, res) => {
    try {
        const { action } = req.body;
        let newState;
        
        if (action === "on") {
            newState = true;
        } else if (action === "off") {
            newState = false;
        } else {
            const current = await Setting.findOne({ key: "maintenance" });
            newState = !(current && current.value === true);
        }
        
        await Setting.findOneAndUpdate(
            { key: "maintenance" },
            { value: newState },
            { upsert: true, new: true }
        );
        log(`ADMIN TOGGLED MAINTENANCE: ${newState}`);
        res.json({ success: true, maintenance: newState });
    } catch (err) {
        res.status(500).json({ error: "Failed to toggle maintenance." });
    }
});

app.post("/api/admin/clear-cache", async (req, res) => {
    try {
        log("ADMIN CLEARED SYSTEM CACHE");
        res.json({ success: true, message: "Cache cleared." });
    } catch (err) {
        res.status(500).json({ error: "Failed to clear cache." });
    }
});

app.post("/api/admin/reset-failed", async (req, res) => {
    try {
        const result = await Order.updateMany(
            { status: { $in: ["failed", "error", "canceled"] } },
            { $set: { status: "cancelled" } }
        );
        log(`ADMIN RESET ${result.modifiedCount} FAILED TRANSACTIONS`);
        res.json({ success: true, resetCount: result.modifiedCount });
    } catch (err) {
        res.status(500).json({ error: "Failed to reset transactions." });
    }
});

app.get("/api/settings", async (req, res) => {
    try {
        const settings = await Setting.find({});
        const obj = {};
        settings.forEach(s => obj[s.key] = s.value);
        res.json(obj);
    } catch (err) {
        res.json({});
    }
});

/**
 * =========================================
 * 🎵 AUDIO/SOUND MANAGEMENT ENDPOINTS
 * Admin can control all sounds from admin panel
 * =========================================
 */

// Get public audio settings (for frontend)
app.get("/api/audio/settings", async (req, res) => {
    try {
        const settings = await Setting.find({ 
            key: { $in: [
                'bg_music_enabled', 
                'bg_music_url', 
                'bg_music_volume',
                'welcome_voice_enabled',
                'welcome_voice_url',
                'success_sound_enabled',
                'success_sound_url',
                'notification_sound_enabled',
                'notification_sound_url',
                'login_sound_enabled',
                'login_sound_url'
            ]}
        });
        
        const audioConfig = {
            bgMusic: {
                enabled: settings.find(s => s.key === 'bg_music_enabled')?.value ?? true,
                url: settings.find(s => s.key === 'bg_music_url')?.value ?? '/sounds/background.mp3',
                volume: settings.find(s => s.key === 'bg_music_volume')?.value ?? 0.3
            },
            welcomeVoice: {
                enabled: settings.find(s => s.key === 'welcome_voice_enabled')?.value ?? false,
                url: settings.find(s => s.key === 'welcome_voice_url')?.value ?? '/sounds/welcome-broadcast.mp3'
            },
            successSound: {
                enabled: settings.find(s => s.key === 'success_sound_enabled')?.value ?? true,
                url: settings.find(s => s.key === 'success_sound_url')?.value ?? '/sounds/success.mp3'
            },
            notificationSound: {
                enabled: settings.find(s => s.key === 'notification_sound_enabled')?.value ?? true,
                url: settings.find(s => s.key === 'notification_sound_url')?.value ?? '/sounds/notification.mp3'
            },
            loginSound: {
                enabled: settings.find(s => s.key === 'login_sound_enabled')?.value ?? true,
                url: settings.find(s => s.key === 'login_sound_url')?.value ?? '/sounds/login.mp3'
            }
        };
        
        res.json({ success: true, data: audioConfig });
    } catch (err) {
        console.error('Audio settings fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch audio settings' });
    }
});

// Admin: Update audio settings
app.post("/api/admin/audio/settings", async (req, res) => {
    try {
        const { 
            bgMusicEnabled, bgMusicUrl, bgMusicVolume,
            welcomeVoiceEnabled, welcomeVoiceUrl,
            successSoundEnabled, successSoundUrl,
            notificationSoundEnabled, notificationSoundUrl,
            loginSoundEnabled, loginSoundUrl
        } = req.body;

        const updates = [];

        if (bgMusicEnabled !== undefined) {
            updates.push(Setting.findOneAndUpdate({ key: 'bg_music_enabled' }, { value: bgMusicEnabled }, { upsert: true, new: true }));
        }
        if (bgMusicUrl !== undefined) {
            updates.push(Setting.findOneAndUpdate({ key: 'bg_music_url' }, { value: bgMusicUrl }, { upsert: true, new: true }));
        }
        if (bgMusicVolume !== undefined) {
            updates.push(Setting.findOneAndUpdate({ key: 'bg_music_volume' }, { value: bgMusicVolume }, { upsert: true, new: true }));
        }
        if (welcomeVoiceEnabled !== undefined) {
            updates.push(Setting.findOneAndUpdate({ key: 'welcome_voice_enabled' }, { value: welcomeVoiceEnabled }, { upsert: true, new: true }));
        }
        if (welcomeVoiceUrl !== undefined) {
            updates.push(Setting.findOneAndUpdate({ key: 'welcome_voice_url' }, { value: welcomeVoiceUrl }, { upsert: true, new: true }));
        }
        if (successSoundEnabled !== undefined) {
            updates.push(Setting.findOneAndUpdate({ key: 'success_sound_enabled' }, { value: successSoundEnabled }, { upsert: true, new: true }));
        }
        if (successSoundUrl !== undefined) {
            updates.push(Setting.findOneAndUpdate({ key: 'success_sound_url' }, { value: successSoundUrl }, { upsert: true, new: true }));
        }
        if (notificationSoundEnabled !== undefined) {
            updates.push(Setting.findOneAndUpdate({ key: 'notification_sound_enabled' }, { value: notificationSoundEnabled }, { upsert: true, new: true }));
        }
        if (notificationSoundUrl !== undefined) {
            updates.push(Setting.findOneAndUpdate({ key: 'notification_sound_url' }, { value: notificationSoundUrl }, { upsert: true, new: true }));
        }
        if (loginSoundEnabled !== undefined) {
            updates.push(Setting.findOneAndUpdate({ key: 'login_sound_enabled' }, { value: loginSoundEnabled }, { upsert: true, new: true }));
        }
        if (loginSoundUrl !== undefined) {
            updates.push(Setting.findOneAndUpdate({ key: 'login_sound_url' }, { value: loginSoundUrl }, { upsert: true, new: true }));
        }

        await Promise.all(updates);
        
        log(`ADMIN UPDATED AUDIO SETTINGS`);
        res.json({ success: true, message: 'Audio settings updated successfully' });
    } catch (err) {
        console.error('Audio settings update error:', err);
        res.status(500).json({ error: 'Failed to update audio settings' });
    }
});

// Admin: Get all audio settings
app.get("/api/admin/audio/settings", async (req, res) => {
    try {
        const settings = await Setting.find({ 
            key: { $in: [
                'bg_music_enabled', 
                'bg_music_url', 
                'bg_music_volume',
                'welcome_voice_enabled',
                'welcome_voice_url',
                'success_sound_enabled',
                'success_sound_url',
                'notification_sound_enabled',
                'notification_sound_url',
                'login_sound_enabled',
                'login_sound_url'
            ]}
        });
        
        const audioConfig = {
            bgMusic: {
                enabled: settings.find(s => s.key === 'bg_music_enabled')?.value ?? true,
                url: settings.find(s => s.key === 'bg_music_url')?.value ?? '/sounds/background.mp3',
                volume: settings.find(s => s.key === 'bg_music_volume')?.value ?? 0.3
            },
            welcomeVoice: {
                enabled: settings.find(s => s.key === 'welcome_voice_enabled')?.value ?? false,
                url: settings.find(s => s.key === 'welcome_voice_url')?.value ?? '/sounds/welcome-broadcast.mp3'
            },
            successSound: {
                enabled: settings.find(s => s.key === 'success_sound_enabled')?.value ?? true,
                url: settings.find(s => s.key === 'success_sound_url')?.value ?? '/sounds/success.mp3'
            },
            notificationSound: {
                enabled: settings.find(s => s.key === 'notification_sound_enabled')?.value ?? true,
                url: settings.find(s => s.key === 'notification_sound_url')?.value ?? '/sounds/notification.mp3'
            },
            loginSound: {
                enabled: settings.find(s => s.key === 'login_sound_enabled')?.value ?? true,
                url: settings.find(s => s.key === 'login_sound_url')?.value ?? '/sounds/login.mp3'
            }
        };
        
        res.json({ success: true, data: audioConfig });
    } catch (err) {
        console.error('Admin audio settings fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch audio settings' });
    }
});

/**
 * =========================================
 * 🎵 NEW: AUDIO FILE UPLOAD ENDPOINT (BASE64 STORAGE)
 * Converts audio files to Base64 and stores in MongoDB
 * Works perfectly on Vercel (no file system needed)
 * =========================================
 */
app.post("/api/admin/audio/upload", async (req, res) => {
    try {
        const { audioType, audioData, fileName, fileSize } = req.body;
        
        console.log(`\n[AUDIO UPLOAD] ====== NEW UPLOAD ======`);
        console.log(`[AUDIO UPLOAD] Type: ${audioType}`);
        console.log(`[AUDIO UPLOAD] File: ${fileName}`);
        console.log(`[AUDIO UPLOAD] Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
        
        // Validation
        if (!audioType || !audioData) {
            return res.status(400).json({ 
                success: false, 
                error: "Missing audio type or data" 
            });
        }
        
        // Check file size (max 10MB for Base64 storage)
        if (fileSize > 10 * 1024 * 1024) {
            return res.status(400).json({ 
                success: false, 
                error: "File too large. Maximum size is 10MB." 
            });
        }
        
        // Validate Base64 data URL format
        if (!audioData.startsWith('data:audio/')) {
            return res.status(400).json({ 
                success: false, 
                error: "Invalid audio file format. Please upload MP3, WAV, or OGG files." 
            });
        }
        
        // Determine the correct setting key
        const settingKeyMap = {
            'bgMusic': 'bg_music_url',
            'welcomeVoice': 'welcome_voice_url',
            'successSound': 'success_sound_url',
            'notificationSound': 'notification_sound_url',
            'loginSound': 'login_sound_url'
        };
        
        const settingKey = settingKeyMap[audioType];
        if (!settingKey) {
            return res.status(400).json({ 
                success: false, 
                error: "Invalid audio type" 
            });
        }
        
        // Store the Base64 data URL in the Setting collection
        await Setting.findOneAndUpdate(
            { key: settingKey },
            { 
                value: audioData,
                fileName: fileName,
                fileSize: fileSize,
                uploadedAt: new Date()
            },
            { upsert: true, new: true }
        );
        
        console.log(`[AUDIO UPLOAD]  Saved ${audioType} to database`);
        log(`ADMIN UPLOADED AUDIO: ${audioType} (${fileName})`);
        
        res.json({ 
            success: true, 
            message: "Audio file uploaded successfully",
            url: audioData,
            fileName: fileName,
            fileSize: fileSize
        });
        
    } catch (error) {
        console.error(`[AUDIO UPLOAD] ❌ Error:`, error);
        res.status(500).json({ 
            success: false, 
            error: error.message || "Failed to upload audio file" 
        });
    }
});

/**
 * =========================================
 * 🎵 NEW: GET UPLOADED AUDIO FILES INFO
 * Returns metadata about uploaded files
 * =========================================
 */
app.get("/api/admin/audio/files", async (req, res) => {
    try {
        const settings = await Setting.find({ 
            key: { $in: [
                'bg_music_url', 
                'welcome_voice_url', 
                'success_sound_url', 
                'notification_sound_url', 
                'login_sound_url'
            ]}
        });
        
        const files = {};
        
        settings.forEach(s => {
            const isBase64 = s.value && s.value.startsWith('data:audio/');
            
            files[s.key] = {
                url: s.value,
                isUploaded: isBase64,
                fileName: s.fileName || null,
                fileSize: s.fileSize || null,
                uploadedAt: s.uploadedAt || null
            };
        });
        
        res.json({ success: true, data: files });
        
    } catch (error) {
        console.error('Audio files fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch audio files' });
    }
});

/**
 * =========================================
 * 🎵 NEW: DELETE UPLOADED AUDIO FILE
 * Removes the Base64 data from database
 * =========================================
 */
app.delete("/api/admin/audio/file/:type", async (req, res) => {
    try {
        const { type } = req.params;
        
        const settingKeyMap = {
            'bgMusic': 'bg_music_url',
            'welcomeVoice': 'welcome_voice_url',
            'successSound': 'success_sound_url',
            'notificationSound': 'notification_sound_url',
            'loginSound': 'login_sound_url'
        };
        
        const settingKey = settingKeyMap[type];
        if (!settingKey) {
            return res.status(400).json({ success: false, error: "Invalid audio type" });
        }
        
        await Setting.findOneAndUpdate(
            { key: settingKey },
            { 
                value: '',
                fileName: null,
                fileSize: null,
                uploadedAt: null
            }
        );
        
        console.log(`[AUDIO DELETE] ✅ Deleted ${type}`);
        log(`ADMIN DELETED AUDIO FILE: ${type}`);
        
        res.json({ success: true, message: "Audio file deleted successfully" });
        
    } catch (error) {
        console.error(`[AUDIO DELETE] ❌ Error:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * =========================================
 * SEO SETTINGS ENDPOINTS
 * Admin controls site SEO configurations (Title, Description, Favicon, OG tags)
 * =========================================
 */

// Get current SEO settings (Public access)
app.get("/api/admin/seo/settings", async (req, res) => {
    try {
        let settings = await SeoSettings.findById(FIXED_SEO_ID);
        if (!settings) {
            // Create single default settings document if it doesn't exist
            settings = await SeoSettings.create({ _id: FIXED_SEO_ID });
        }
        res.json({ success: true, data: settings });
    } catch (err) {
        console.error("SEO settings fetch error:", err);
        res.status(500).json({ error: "Failed to fetch SEO settings." });
    }
});

// Update/Save SEO Settings (Admin secure route)
app.post("/api/admin/seo/settings", async (req, res) => {
    try {
        const { title, metaDescription, metaKeywords, ogTitle, ogDescription, ogImage, favicon } = req.body;
        
        let settings = await SeoSettings.findById(FIXED_SEO_ID);
        if (!settings) {
            settings = new SeoSettings({ _id: FIXED_SEO_ID });
        }

        if (title !== undefined) settings.title = title;
        if (metaDescription !== undefined) settings.metaDescription = metaDescription;
        if (metaKeywords !== undefined) settings.metaKeywords = metaKeywords;
        if (ogTitle !== undefined) settings.ogTitle = ogTitle;
        if (ogDescription !== undefined) settings.ogDescription = ogDescription;
        if (ogImage !== undefined) settings.ogImage = ogImage;
        if (favicon !== undefined) settings.favicon = favicon;
        
        settings.updatedAt = new Date();
        await settings.save();

        log(`ADMIN UPDATED SEO CONFIGURATIONS`);
        res.json({ success: true, message: "SEO Settings updated successfully.", data: settings });
    } catch (err) {
        console.error("SEO settings update error:", err);
        res.status(500).json({ error: "Failed to update SEO configurations." });
    }
});

// Upload SEO preview asset (base64 image storage, Vercel compatible - SAVED PERMANENTLY IN MONGODB)
app.post("/api/admin/seo/upload", async (req, res) => {
    try {
        let { imageType, imageData, fileName, fileSize } = req.body;

        // 🔧 ROBUST PRE-VALIDATION CHECK:
        // Automatically search alternative request payload keys if frontend sends image or file directly
        if (!imageData) {
            imageData = req.body.image || req.body.file || req.body.data;
        }
        if (!imageType) {
            imageType = req.body.type || "ogImage"; // Defaults gracefully to prevent crashing
        }
        if (!fileName) {
            fileName = req.body.name || "seo-visual-asset";
        }
        if (!fileSize) {
            fileSize = req.body.size || (imageData ? Buffer.byteLength(imageData, 'utf8') : 0);
        }

        if (!imageType || !imageData) {
            return res.status(400).json({ success: false, error: "Missing metadata properties." });
        }

        if (fileSize > 5 * 1024 * 1024) {
            return res.status(400).json({ success: false, error: "Upload size limit surpassed. Max limit is 5MB." });
        }

        // Find existing SEO settings document via FIXED ID to guarantee exactly ONE permanent document
        let settings = await SeoSettings.findById(FIXED_SEO_ID);
        if (!settings) {
            settings = new SeoSettings({ _id: FIXED_SEO_ID });
        }

        if (imageType === "ogImage") {
            settings.ogImage = imageData;
        } else if (imageType === "favicon") {
            settings.favicon = imageData;
        } else {
            return res.status(400).json({ success: false, error: "Invalid visual element key. Use 'ogImage' or 'favicon'." });
        }

        settings.updatedAt = new Date();
        await settings.save(); // Image is permanently saved here to your MongoDB instance!

        log(`ADMIN UPLOADED SEO COMPONENT: ${imageType} (${fileName})`);

        res.json({ success: true, message: "SEO media saved successfully.", url: imageData });
    } catch (err) {
        console.error("SEO asset upload error:", err);
        res.status(500).json({ error: "Failed to complete asset upload." });
    }
});

/**
 * =========================================
 * HUMAN SUPPORT TICKET SYSTEM
 * =========================================
 */
const ticketSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userEmail: String,
    username: String,
    message: { type: String, required: true },
    status: { type: String, default: 'Open' },
    createdAt: { type: Date, default: Date.now }
});
const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);

app.post("/api/support-ticket", auth, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: "Message cannot be empty." });

        await Ticket.create({
            userId: req.user.id,
            userEmail: req.user.email,
            username: req.user.username || "Unknown User",
            message: message
        });

        log(`SUPPORT TICKET: New message from ${req.user.email}`);
        res.json({ success: true, message: "Your message has been sent to the Admin." });
    } catch (err) {
        console.error("Ticket Error:", err);
        res.status(500).json({ error: "Failed to send message." });
    }
});

app.get("/api/admin/tickets", async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch tickets." });
    }
});

app.post("/api/admin/resolve-ticket", async (req, res) => {
    try {
        const { ticketId } = req.body;
        await Ticket.findByIdAndUpdate(ticketId, { status: 'Closed' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to resolve ticket." });
    }
});

/**
 * =========================================
 * TOP TICKER MANAGEMENT
 * =========================================
 */
app.get("/api/ticker", async (req, res) => {
    try {
        const itemsDoc = await Setting.findOne({ key: "ticker_items" });
        const speedDoc = await Setting.findOne({ key: "ticker_speed" });
        
        const items = itemsDoc && Array.isArray(itemsDoc.value) ? itemsDoc.value : [];
        const speed = speedDoc && typeof speedDoc.value === 'number' ? speedDoc.value : 80; 
        
        res.json({ success: true, items, speed });
    } catch (err) {
        console.error("Ticker fetch error:", err);
        res.json({ success: true, items: [], speed: 80 });
    }
});

app.get("/api/admin/ticker", async (req, res) => {
    try {
        const itemsDoc = await Setting.findOne({ key: "ticker_items" });
        const speedDoc = await Setting.findOne({ key: "ticker_speed" });
        
        const items = itemsDoc && Array.isArray(itemsDoc.value) ? itemsDoc.value : [];
        const speed = speedDoc && typeof speedDoc.value === 'number' ? speedDoc.value : 80;
        
        res.json({ success: true, items, speed });
    } catch (err) {
        console.error("Admin ticker fetch error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch ticker data", items: [], speed: 80 });
    }
});

app.post("/api/admin/ticker/add", async (req, res) => {
    try {
        const { text } = req.body;
        
        console.log('[TICKER ADD] Received request:', { text });
        
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ success: false, error: "Text is required and cannot be empty" });
        }
        
        const cleanText = text.trim();
        
        const result = await Setting.findOneAndUpdate(
            { key: "ticker_items" },
            { $push: { value: cleanText } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        
        console.log('[TICKER ADD] Success. New items count:', result.value.length);
        
        res.json({ 
            success: true, 
            message: "Ticker item added successfully",
            itemCount: result.value.length
        });
    } catch (err) {
        console.error('[TICKER ADD] Error:', err);
        res.status(500).json({ success: false, error: "Failed to add ticker item: " + err.message });
    }
});

app.put("/api/admin/ticker/edit", async (req, res) => {
    try {
        const { index, text } = req.body;
        
        console.log('[TICKER EDIT] Received request:', { index, text });
        
        if (typeof index !== 'number' || index < 0) {
            return res.status(400).json({ success: false, error: "Valid index is required" });
        }
        
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ success: false, error: "Text is required and cannot be empty" });
        }
        
        const cleanText = text.trim();
        const doc = await Setting.findOne({ key: "ticker_items" });
        
        if (!doc || !Array.isArray(doc.value) || !doc.value[index]) {
            return res.status(404).json({ success: false, error: "Item not found at specified index" });
        }
        
        doc.value[index] = cleanText;
        await doc.save();
        
        console.log('[TICKER EDIT] Success');
        
        res.json({ success: true, message: "Ticker item updated successfully" });
    } catch (err) {
        console.error('[TICKER EDIT] Error:', err);
        res.status(500).json({ success: false, error: "Failed to edit ticker item: " + err.message });
    }
});

app.delete("/api/admin/ticker/delete", async (req, res) => {
    try {
        const { index } = req.body;
        
        console.log('[TICKER DELETE] Received request:', { index });
        
        if (typeof index !== 'number' || index < 0) {
            return res.status(400).json({ success: false, error: "Valid index is required" });
        }
        
        const doc = await Setting.findOne({ key: "ticker_items" });
        
        if (!doc || !Array.isArray(doc.value)) {
            return res.status(404).json({ success: false, error: "No ticker items found" });
        }
        
        if (index >= doc.value.length) {
            return res.status(404).json({ success: false, error: "Index out of range" });
        }
        
        doc.value.splice(index, 1);
        await doc.save();
        
        console.log('[TICKER DELETE] Success. Remaining items:', doc.value.length);
        
        res.json({ success: true, message: "Ticker item deleted successfully" });
    } catch (err) {
        console.error('[TICKER DELETE] Error:', err);
        res.status(500).json({ success: false, error: "Failed to delete ticker item: " + err.message });
    }
});

app.put("/api/admin/ticker/speed", async (req, res) => {
    try {
        const { speed } = req.body;
        
        console.log('[TICKER SPEED] Received request:', { speed });
        
        if (typeof speed !== 'number' || speed < 5 || speed > 300) {
            return res.status(400).json({ success: false, error: "Speed must be a number between 5 and 300" });
        }
        
        await Setting.findOneAndUpdate(
            { key: "ticker_speed" },
            { value: speed },
            { upsert: true, new: true }
        );
        
        console.log('[TICKER SPEED] Success');
        
        res.json({ success: true, message: "Ticker speed updated successfully" });
    } catch (err) {
        console.error('[TICKER SPEED] Error:', err);
        res.status(500).json({ success: false, error: "Failed to update speed: " + err.message });
    }
});

/**
 * =========================================
 * INTERNAL AI SUPPORT BOT (CONTEXT-AWARE & ASYNC)
 * =========================================
 */
let knowledgeBase = { knowledge_base: [] };
try {
    knowledgeBase = require("./knowledge_base.json");
    console.log("🧠 Internal AI Knowledge Base loaded successfully.");
} catch (err) {
    console.warn("⚠️ knowledge_base.json not found in root directory. Internal AI will use fallback responses.");
}

async function processInternalAI(message, context = {}) {
    const cleanMessage = message.toLowerCase().replace(/[^\w\s]/gi, '').trim();
    const rawMessage = message.trim();
    const recentLogs = context.recentLogs || [];

    if (context.userId && recentLogs.length > 0) {
        const lastLog = recentLogs[0];
        const lastAiReply = lastLog.aiReply.toLowerCase();
        
        const phoneRegex = /^(07|01|\+254|2547|2541)\d{8,9}$/;
        const isPhoneNumber = phoneRegex.test(rawMessage.replace(/\s/g, ''));

        if (isPhoneNumber && (lastAiReply.includes("payment") || lastAiReply.includes("wallet") || lastAiReply.includes("credited") || lastAiReply.includes("check our system") || lastAiReply.includes("money") || lastAiReply.includes("send me the exact phone"))) {
            try {
                const cleanPhone = rawMessage.replace(/\s/g, '');
                
                const pendingDeposit = await Deposit.findOne({ 
                    phone: cleanPhone, 
                    status: 'pending' 
                }).sort({ createdAt: -1 });
                
                if (pendingDeposit) {
                    if (pendingDeposit.userId.toString() === context.userId.toString()) {
                        const user = await User.findById(context.userId);
                        user.balance += pendingDeposit.amount;
                        pendingDeposit.status = 'completed';
                        pendingDeposit.message = `Auto-approved by AI Support. Phone: ${cleanPhone}`;
                        await user.save();
                        await pendingDeposit.save();
                        return `✅ Great news! I found your pending payment of KES ${pendingDeposit.amount} and have added the money to your wallet immediately. Your new balance is KES ${user.balance.toLocaleString()}.`;
                    } else {
                        return `⚠️ I found a pending payment from ${cleanPhone}, but it belongs to a different account. Please login to the account that initiated this payment to check it.`;
                    }
                } else {
                    const anyPayment = await Deposit.findOne({ 
                        phone: cleanPhone,
                        userId: context.userId
                    }).sort({ createdAt: -1 });
                    
                    if (anyPayment && anyPayment.status === 'completed') {
                         return `ℹ️ I see a completed payment from ${cleanPhone} of KES ${anyPayment.amount}. It has already been credited to your wallet.`;
                    }
                    return `❌ Sorry, we cannot find any pending payment from ${cleanPhone} in your account. Please contact WhatsApp Support with your M-Pesa message.`;
                }
            } catch (err) {
                console.error("Payment check error:", err);
                return "❌ An error occurred while checking your payment. Please contact WhatsApp Support.";
            }
        } 
        
        else if (isPhoneNumber && (lastAiReply.includes("profile") || lastAiReply.includes("update") || lastAiReply.includes("register") || lastAiReply.includes("funding number") || lastAiReply.includes("save it to your profile") || lastAiReply.includes("what you want to change"))) {
            try {
                const cleanPhone = rawMessage.replace(/\s/g, '');
                
                const currentUser = await User.findById(context.userId);
                const existingPhones = [
                    currentUser.phone,
                    currentUser.paymentPhone1,
                    currentUser.paymentPhone2,
                    currentUser.paymentPhone3
                ].filter(Boolean);
                
                if (existingPhones.includes(cleanPhone)) {
                    return `ℹ️ The number ${cleanPhone} is already saved in your profile! No need to update it.`;
                }
                
                let updatePayload = {};
                if (!currentUser.paymentPhone1) {
                    updatePayload.paymentPhone1 = cleanPhone;
                } else if (!currentUser.paymentPhone2) {
                    updatePayload.paymentPhone2 = cleanPhone;
                } else if (!currentUser.paymentPhone3) {
                    updatePayload.paymentPhone3 = cleanPhone;
                } else {
                    return `⚠️ You have reached the maximum limit of 3 payment phone numbers. You cannot add more. Please contact support if you need to change them.`;
                }
                
                await User.findByIdAndUpdate(context.userId, { $set: updatePayload });
                return `✅ Success! Your profile has been updated. The new funding number ${cleanPhone} has been saved to your account for future deposits.`;
            } catch (err) {
                console.error("Profile update error:", err);
                return "❌ An error occurred while updating your profile. Please try again or contact support.";
            }
        }

        else if (!isPhoneNumber && (lastAiReply.includes("what you want to change") || lastAiReply.includes("update some of your account details"))) {
            try {
                const newName = rawMessage;
                await User.findByIdAndUpdate(context.userId, { $set: { firstName: newName, paymentProfileName: newName } }); 
                return `✅ Success! Your display name has been updated to "${newName}".`;
            } catch (err) {
                console.error("Name update error:", err);
                return "❌ An error occurred while updating your name. Please try again.";
            }
        }
    }

    let bestMatch = null;
    let highestScore = 0;

    for (const item of knowledgeBase.knowledge_base) {
        let score = 0;
        for (const keyword of item.keywords) {
            const cleanKeyword = keyword.toLowerCase();
            
            if (cleanMessage.includes(cleanKeyword)) {
                score += cleanKeyword.split(' ').length * 15; 
            } else {
                const msgWords = cleanMessage.split(' ');
                const keyWords = cleanKeyword.split(' ');
                let overlap = 0;
                for (const mw of msgWords) {
                    for (const kw of keyWords) {
                        if (mw.length > 2 && kw.length > 2) {
                            if (mw.startsWith(kw.substring(0, 3)) || kw.startsWith(mw.substring(0, 3)) || mw.includes(kw) || kw.includes(mw)) {
                                overlap++;
                            }
                        }
                    }
                }
                if (overlap > 0) score += overlap * 8;
            }
        }
        
        if (score > highestScore) {
            highestScore = score;
            bestMatch = item;
        }
    }

    if (bestMatch && highestScore >= 5) {
        let finalAnswer = bestMatch.answer;
        
        if (cleanMessage.includes("deposit") || cleanMessage.includes("add money") || cleanMessage.includes("fund") || cleanMessage.includes("payment")) {
            finalAnswer = `💰 **How to Add Funds to Your Wallet at ${SITE_NAME}:**

Our new payment system is super flexible:

✅ **Use ANY M-Pesa Phone Number** - You don't need to register your payment phone in advance. Just enter any M-Pesa registered number when making a deposit.

✅ **Secure & Private** - The phone number you use is only stored for that specific transaction. It's NOT saved permanently to your account.

✅ **Instant Credit** - Once you complete the M-Pesa PIN prompt, your wallet is credited automatically within seconds.

✅ **Minimum Deposit:** KES 2

**How it works:**
1. Go to "Add Funds" page
2. Enter amount (minimum KES 2)
3. Enter any M-Pesa phone number
4. Click "Send Payment Request"
5. Check your phone for the M-Pesa prompt
6. Enter your M-Pesa PIN
7. Done! Your wallet is credited instantly

**Important:** The money is credited to YOUR account (the one you're logged into), regardless of which phone number you use for the payment.

Need help? Just ask me or click "Human Support"!`;
        }
        
        if (bestMatch.action === 'fetch_balance') {
            finalAnswer = finalAnswer.replace('{balance}', Number(context.balance).toLocaleString('en-KE', { minimumFractionDigits: 2 }));
        } else if (bestMatch.action === 'fetch_orders') {
            finalAnswer = finalAnswer.replace('{active_orders}', context.activeOrders);
        }
        
        return finalAnswer;
    }
    
    return `🤔 I might need a bit more detail to give you the perfect answer! As your ${SITE_NAME} AI expert, I can help you with:

• 💰 **Deposits** - Use any M-Pesa phone number, instant credit to your account
• 🚀 **Placing orders** - API access, service pricing, and how to order
• 📦 **Tracking orders** - Refills, delivery speeds, and order status
• 👤 **Account management** - Profile updates and security

**Quick Tip:** You can now add funds using ANY M-Pesa registered phone number. The money will be credited to YOUR account, not the phone number's owner!

Could you rephrase your question, or click 'Human Support' to message the Admin directly?`;
}

app.post("/api/support-bot", auth, async (req, res) => {
    const userMessage = req.body.message;
    const userId = req.user.id; 

    if (!userMessage || typeof userMessage !== 'string') {
        return res.status(400).json({ success: false, error: "A valid message string is required." });
    }

    const activeBan = await ChatBan.findOne({ userId, expiresAt: { $gt: Date.now() } });
    if (activeBan) {
        const daysLeft = Math.ceil((activeBan.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        return res.json({ 
            success: true, 
            reply: `🚫 **Chat Restricted:** You have been restricted from using the AI Support chat for violating our terms of service. You can chat again in ${daysLeft} day(s). If you need further assistance, please use the 'Human Support' form.`,
            isBanned: true 
        });
    }

    let userBalance = 0;
    let activeOrders = 0;
    try {
        const user = await User.findById(userId);
        if (user) {
            userBalance = user.balance || 0;
            activeOrders = await Order.countDocuments({ userId: userId, status: { $in: ['pending', 'processing'] } });
        }
    } catch (err) { console.warn("AI Context Error."); }

    let recentLogs = [];
    try {
        recentLogs = await ChatLog.find({ userId }).sort({ createdAt: -1 }).limit(5);
    } catch (err) { console.warn("Could not fetch recent chat logs."); }

    let aiReply = await processInternalAI(userMessage, { 
        balance: userBalance, 
        activeOrders, 
        userId, 
        recentLogs 
    });
    
    const cleanMsg = userMessage.toLowerCase();
    const serviceKeywords = ["service", "services", "menu", "tiktok", "instagram", "youtube", "facebook", "twitter", "telegram", "followers", "views", "likes", "subscribers", "price", "prices", "cost", "catalog", "sell"];
    const isAskingForServices = serviceKeywords.some(k => cleanMsg.includes(k));

    if (isAskingForServices) {
        try {
            let query = {};
            if (cleanMsg.includes('tiktok') || cleanMsg.includes('tt')) query.platform = "TikTok";
            else if (cleanMsg.includes('instagram') || cleanMsg.includes('ig') || cleanMsg.includes('insta')) query.platform = "Instagram";
            else if (cleanMsg.includes('youtube') || cleanMsg.includes('yt')) query.platform = "YouTube";
            else if (cleanMsg.includes('facebook') || cleanMsg.includes('fb')) query.platform = "Facebook";
            else if (cleanMsg.includes('twitter') || cleanMsg.includes('x')) query.platform = "Twitter/X";
            else if (cleanMsg.includes('telegram') || cleanMsg.includes('tg')) query.platform = "Telegram";

            let services = [];
            if (Object.keys(query).length > 0) {
                services = await Service.find(query).limit(5);
            } else {
                services = await Service.aggregate([{ $sample: { size: 5 } }]);
            }

            if (services.length > 0) {
                aiReply += "\n\n📋 **Here is a quick preview of our live services & prices:**\n";
                services.forEach(s => {
                    const finalRate = applyFinalPrice(s.rate, s.name);
                    aiReply += `• **${s.name}** (${s.platform}) - KES ${finalRate}/1k\n`;
                });
                aiReply += "\n💡 *Visit the **New Order** page to see the full menu and place your order!*";
            } else {
                aiReply += "\n\n📋 *Our database is updating right now! Please visit the **New Order** page to see the full live catalog.*";
            }
        } catch (err) {
            console.error("AI Service Fetch Error:", err);
        }
    }

    try {
        await ChatLog.create({
            userId,
            userEmail: req.user.email,
            username: req.user.username || "Unknown",
            userMessage,
            aiReply
        });
    } catch (err) { console.error("Failed to save chat log:", err); }

    res.json({ success: true, reply: aiReply, timestamp: new Date().toISOString() });
});

/**
 * =========================================
 * ADMIN CHAT SECURITY & MODERATION
 * =========================================
 */
app.get("/api/admin/chat-logs", async (req, res) => {
    try {
        const logs = await ChatLog.find().sort({ createdAt: -1 }).limit(100);
        const bans = await ChatBan.find({ expiresAt: { $gt: Date.now() } });
        const bannedUserIds = bans.map(b => b.userId.toString());
        res.json({ logs, bannedUserIds });
    } catch (err) { res.status(500).json({ error: "Failed to fetch logs" }); }
});

app.post("/api/admin/ban-chat", async (req, res) => {
    try {
        const { userId, reason } = req.body;
        const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        
        await ChatBan.findOneAndUpdate(
            { userId }, { userId, reason, expiresAt }, { upsert: true, new: true }
        );
        log(`🛡️ ADMIN CHAT BAN: User ${userId} banned for 3 days. Reason: ${reason}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to ban user" }); }
});

app.post("/api/admin/unban-chat", async (req, res) => {
    try {
        const { userId } = req.body;
        await ChatBan.deleteOne({ userId });
        log(`🛡️ ADMIN CHAT UNBAN: User ${userId} unbanned.`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to unban user" }); }
});

/**
 * =========================================
 * STATIC ROUTES & SERVER
 * =========================================
 */
app.get("/", (req, res) => {
    res.json({ 
        status: "online", 
        message: `${SITE_NAME} API is running successfully.`,
        version: "1.0.0",
        siteName: SITE_NAME
    });
});

app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/favicon.png", (req, res) => res.status(204).end());

// ================= VERCEL EXPORT CONFIGURATION =================
if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 ${SITE_NAME} ONLINE ON PORT ${PORT}`));
}

module.exports = app;
