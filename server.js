// ================= IMPORTS =================
require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // Added for secure password hashing

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
    "https://paynecta.co.ke/pay/unasemeje-";

const app = express();

/**
 * =========================================
 * MIDDLEWARE & CONFIG
 * =========================================
 */
app.use(cors({
    origin: function (origin, callback) {
        // Updated to include your live Vercel domain and potential local testing ports
        const allowedOrigins = [
            "https://unasemeje-frontend.vercel.app",
            "http://localhost:3000",
            "http://localhost:5000",
            "http://localhost:3001",
            "http://127.0.0.1:5500"
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
 * VERCEL COMPATIBLE DATABASE MIDDLEWARE
 * Ensures database connectivity during serverless execution loops
 * =========================================
 */
// Cache the connection promise to prevent multiple concurrent connections on cold start
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
 * Only runs when NOT in Vercel to prevent cold-start latency and unnecessary API calls
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
 * PAYNECTA WEBHOOK (SMART PHONE MATCHING)
 * =========================================
 */
app.post("/api/paynecta/webhook", async (req, res) => {
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
        
        // Send response ONLY after all database processing is complete
        res.status(200).send("Webhook received and processed");
    } catch (err) {
        log(`Webhook Processing Error: ${err.message}`);
        res.status(500).send("Error processing webhook");
    }
});

/**
 * =========================================
 * PAYMENT PROFILE ENDPOINTS (UPDATED FOR COMPATIBILITY)
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

app.post("/api/paynecta/stkpush", auth, async (req, res) => {
    try {
        let { amount, phone } = req.body;
        if (!amount || !phone) return res.status(400).json({ error: "Data missing" });
        
        let formatted = String(phone).replace(/\D/g, "");
        if (formatted.startsWith("0")) formatted = "254" + formatted.substring(1);
        if (formatted.startsWith("7") || formatted.startsWith("1")) formatted = "254" + formatted;

        const response = await axios.post(`${PAYNECTA_BASE_URL}/payment/initialize`, 
            { amount: Number(amount), mobile_number: formatted, code: "600" },
            { headers: { "X-API-Key": process.env.PAYNECTA_API_KEY, "X-User-Email": ADMIN_EMAIL }}
        );
        res.json({ success: true, data: response.data });
    } catch (error) {
        res.status(500).json({ error: "STK push failed" });
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
        // Updated to receive the M-Pesa Verification metadata fields from your auth.js registration call
        const { username, email, password, phone, firstName, lastName, paymentPhone1, paymentPhone2, referralCode } = req.body;
        
        const exists = await User.findOne({ $or: [{ email: email?.toLowerCase() }, { phone }] });
        if (exists) return res.status(400).json({ error: "User exists" });

        // HASH THE PASSWORD BEFORE SAVING
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Sanitize incoming phone numbers identically to the update payload logic
        const formattedP1 = paymentPhone1 ? String(paymentPhone1).replace(/[\s+-]/g, '') : null;
        const formattedP2 = paymentPhone2 ? String(paymentPhone2).replace(/[\s+-]/g, '') : null;

        await User.create({
            username: username?.toLowerCase(),
            email: email?.toLowerCase(),
            password: hashedPassword, // Save the secure hash
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

// ================= LOGIN LOGIC (SMART MIGRATION) =================
app.post("/api/login", async (req, res) => {
    try {
        const { identifier, password } = req.body;
        
        // Find user by email or username
        const user = await User.findOne({
            $or: [{ email: identifier?.toLowerCase() }, { username: identifier?.toLowerCase() }]
        });
        
        if (!user) return res.status(400).json({ error: "Invalid login" });

        let isMatch = false;
        
        // SMART PASSWORD CHECK: Detects if the DB password is plain text or a bcrypt hash
        if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
            // It's a bcrypt hash, verify normally
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            // It's plain text (legacy), compare directly
            isMatch = (user.password === password);
            
            // LAZY MIGRATION: If it matches, instantly upgrade it to a bcrypt hash!
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

// ================= CHANGE PASSWORD (SMART MIGRATION) =================
app.post("/api/user/change-password", auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);
        
        if (!user) return res.status(400).json({ error: "User not found." });

        let isMatch = false;
        
        // SMART PASSWORD CHECK
        if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
            isMatch = await bcrypt.compare(currentPassword, user.password);
        } else {
            isMatch = (user.password === currentPassword);
        }

        if (!isMatch) {
            return res.status(400).json({ error: "Current password is incorrect." });
        }
        
        // Hash and save new password
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
                    platform: detectPlatform(s)
                }));
                await Service.insertMany(mapped);
                services = await Service.find();
            }
        }
        const grouped = {};
        services.forEach(s => {
            if (!grouped[s.platform]) grouped[s.platform] = {};
            if (!grouped[s.platform][s.category]) grouped[s.platform][s.category] = [];
            grouped[s.platform][s.category].push({ ...s.toObject(), rate: applyFinalPrice(s.rate, s.name) });
        });
        res.json({ success: true, data: grouped });
    } catch (err) {
        res.status(500).json({ error: "Service error" });
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
 * DEPOSITS & ADMIN
 * =========================================
 */
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

app.get("/api/admin/users", adminAuth, async (req, res) => res.json(await User.find().select("-password")));
app.get("/api/admin/deposits", adminAuth, async (req, res) => res.json(await Deposit.find().sort({ createdAt: -1 })));

app.post("/api/admin/approve-deposit", adminAuth, async (req, res) => {
    const dep = await Deposit.findById(req.body.depositId);
    if (dep && (dep.status === "pending" || dep.status === "failed")) {
        const user = await User.findById(dep.userId);
        user.balance += dep.amount;
        dep.status = "completed";
        await user.save();
        await dep.save();
        res.json({ success: true });
    }
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

module.exports = app;
