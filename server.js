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

// ================= CONFIGURATION & CONSTANTS =================
const ADMIN_EMAIL = (process.env.PAYNECTA_USER_EMAIL || "diasamratbarusz@gmail.com").toLowerCase();
const ADMIN_PHONE = "0715509440";

const PAYNECTA_BASE_URL = "https://paynecta.co.ke/api/v1";

const PAYNECTA_PAYMENT_PAGE =
    process.env.PAYNECTA_PAYMENT_PAGE ||
    "https://paynecta.co.ke/pay/unasemeje-";

// 🔧 NEW: Payment code from your PayNecta link
const PAYNECTA_PAYMENT_CODE = process.env.PAYNECTA_PAYMENT_CODE || "unasemeje-";

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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

function detectPlatform(service = {}) {
    const text = `${service.name || ""} ${service.category || ""}`.toLowerCase();
    
    if (/(instagram|insta|ig)/.test(text)) return "Instagram";
    if (/(tiktok|tik tok|tt)/.test(text)) return "TikTok";
    if (/(youtube|yt)/.test(text)) return "YouTube";
    if (/(facebook|fb|post likes|post views|post comments|page likes|page followers|video views|reel|story)/.test(text)) return "Facebook";
    if (/(twitter|x\.com|x post|retweet)/.test(text)) return "Twitter/X";
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
 * PAYNECTA WEBHOOK
 * =========================================
 */
const handlePaynectaWebhook = async (req, res) => {
    try {
        const event = req.body;
        const { event_type, data } = event;
        const transaction = data?.transaction || {};

        let phone = transaction.mobile_number || data?.PhoneNumber || data?.phone;

        if (event_type === "payment.completed" && phone) {
            let cleanPhone = String(phone).replace(/[\s+]/g, '');
            let corePhone = cleanPhone;
            if (corePhone.startsWith("254")) corePhone = corePhone.substring(3);
            if (corePhone.startsWith("0")) corePhone = corePhone.substring(1);

            console.log(`[Webhook] Payment Detected for Core Phone: ${corePhone}`);

            const user = await User.findOne({
                $or: [
                    { phone: { $regex: corePhone } },
                    { paymentPhone1: { $regex: corePhone } },
                    { paymentPhone2: { $regex: corePhone } },
                    { paymentPhone3: { $regex: corePhone } }
                ]
            });

            if (user) {
                const transCode = data?.MpesaReceiptNumber || transaction.reference || `TRX-${Date.now()}`;
                
                const existingDeposit = await Deposit.findOne({ 
                    $or: [
                        { transactionCode: transCode },
                        { code: transCode }
                    ]
                });

                if (!existingDeposit) {
                    const amount = Number(transaction.amount || data?.amount || 0);
                    
                    await Deposit.create({
                        userId: user._id,
                        userEmail: user.email,
                        phone: cleanPhone,
                        amount: amount,
                        transactionCode: transCode,
                        code: transCode,
                        source: "stk",
                        status: "completed",
                        message: `Automatic Funding via Paynecta Hook (${cleanPhone})`
                    });

                    user.balance += amount;
                    await user.save();
                    
                    log(`INSTANT FUNDING: ${user.username} | +KES ${amount} | TRX: ${transCode}`);
                }
            }
        }
        
        res.status(200).send("Webhook received and processed");
    } catch (err) {
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
        console.log(`[PAYMENT INITIATE] Using PayNecta Email: ${ADMIN_EMAIL}`);
        console.log(`[PAYMENT INITIATE] Using Payment Code: ${PAYNECTA_PAYMENT_CODE}`);
        console.log(`[PAYMENT INITIATE] Raw input:`, { amount, phone });
        
        // Validation
        if (!amount || !phone) {
            return res.status(400).json({ 
                success: false, 
                error: "Amount and phone number are required" 
            });
        }

        if (Number(amount) < 2) {
            return res.status(400).json({ 
                success: false, 
                error: "Minimum amount is KES 2" 
            });
        }
        
        if (!process.env.PAYNECTA_API_KEY) {
            return res.status(500).json({ 
                success: false, 
                error: "Payment service not configured. Please contact support." 
            });
        }
        
        // Format phone number
        let formatted = String(phone).replace(/\D/g, "");
        
        if (formatted.startsWith("0")) {
            formatted = "254" + formatted.substring(1);
        }
        if (formatted.startsWith("7") || formatted.startsWith("1")) {
            formatted = "254" + formatted;
        }
        
        if (!formatted.startsWith("254") || formatted.length !== 12) {
            return res.status(400).json({ 
                success: false, 
                error: "Invalid phone number format. Please use 2547XXXXXXXX" 
            });
        }

        console.log(`[PAYMENT INITIATE] ✅ Final formatted: Amount=KES ${amount}, Phone=${formatted}`);

        // 🔧 FIXED: Use the payment link slug as the code
        const payload = { 
            code: PAYNECTA_PAYMENT_CODE,
            mobile_number: formatted,
            amount: Number(amount)
        };
        
        console.log(`[PAYMENT INITIATE] Payload being sent:`, payload);

        try {
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

            res.json({ 
                success: true, 
                message: "STK push sent successfully. Check your phone for the M-Pesa prompt.",
                data: response.data 
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
                return res.status(504).json({ 
                    success: false, 
                    error: "Payment request timed out. Please try again."
                });
            }
            
            return res.status(500).json({ 
                success: false, 
                error: paynectaError?.message || "Failed to initiate payment",
                details: paynectaError?.errors || paynectaError?.error || error.message
            });
        }
        
    } catch (error) {
        console.error(`[PAYMENT INITIATE] ❌ Unexpected error:`, error);
        console.error(`[PAYMENT INITIATE] Stack:`, error.stack);
        
        res.status(500).json({ 
            success: false, 
            error: error.message || "Failed to initiate payment",
            details: "An unexpected error occurred. Please try again."
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
 * SMM SERVICES & ORDERS (FIXED FOR ALL CATEGORIES)
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
                    
                    console.log(`📝 Service: "${serviceName}" | Category: "${categoryName}" | Platform: ${platform}`);
                    
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
 * TOP TICKER MANAGEMENT (FIXED FOR VERCEL)
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
                
                const currentUser = await User.findById(context.userId);
                const registeredPhones = [
                    currentUser.phone,
                    currentUser.paymentPhone1,
                    currentUser.paymentPhone2,
                    currentUser.paymentPhone3
                ].filter(Boolean);
                
                const isRegistered = registeredPhones.includes(cleanPhone);
                
                const uncreditedPayment = await Deposit.findOne({ phone: cleanPhone, status: 'pending' }).sort({ createdAt: -1 });
                
                if (uncreditedPayment) {
                    if (isRegistered) {
                        const user = await User.findById(context.userId);
                        user.balance += uncreditedPayment.amount;
                        uncreditedPayment.status = 'completed';
                        await user.save();
                        await uncreditedPayment.save();
                        return `✅ Great news! I found your pending payment from ${cleanPhone} (which is registered in your funding numbers) and have added the money to your wallet immediately.`;
                    } else {
                        return `⚠️ I found a pending payment from ${cleanPhone}, but this number is NOT saved in your profile or payment nodes. Please add it to your payment nodes first, then ask me to check the payment again!`;
                    }
                } else {
                    const anyPayment = await Deposit.findOne({ phone: cleanPhone }).sort({ createdAt: -1 });
                    if (anyPayment && anyPayment.status === 'completed') {
                         return `ℹ️ I see a payment from ${cleanPhone}, but it has already been credited to your wallet.`;
                    }
                    return `❌ Sorry, we cannot find any pending or uncredited payment from ${cleanPhone} in our system. Please contact WhatsApp Support with your M-Pesa message.`;
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
        
        if (bestMatch.action === 'fetch_balance') {
            finalAnswer = finalAnswer.replace('{balance}', Number(context.balance).toLocaleString('en-KE', { minimumFractionDigits: 2 }));
        } else if (bestMatch.action === 'fetch_orders') {
            finalAnswer = finalAnswer.replace('{active_orders}', context.activeOrders);
        }
        
        return finalAnswer;
    }
    
    return "🤔 I might need a bit more detail to give you the perfect answer! As your Unasemeje AI expert, I can help you with:\n\n• 💰 Deposits, M-Pesa issues, and wallet balance\n• 🚀 Placing orders, API access, and service pricing\n• 📦 Tracking orders, refills, and delivery speeds\n• 👤 Updating your profile and funding numbers\n\nCould you rephrase your question, or click 'Human Support' to message the Admin directly?";
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
        message: "UNASEMEJE API is running successfully.",
        version: "1.0.0"
    });
});

app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/favicon.png", (req, res) => res.status(204).end());

// ================= VERCEL EXPORT CONFIGURATION =================
if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 UNASEMEJE ø DIA ONLINE ON PORT ${PORT}`));
}

// 🔧 FIXED: Correct export (was apAp before)
module.exports = app;
