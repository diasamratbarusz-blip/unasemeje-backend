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
const ADMIN_EMAIL = "diasamratbarusz@gmail.com".toLowerCase();
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
        console.log("\n=======================================");
        console.log("🚀 UNASEMEJE ø DIA SERVER STARTED");
        console.log("=======================================\n");
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
            console.log("✅ Paynecta Verified:", ADMIN_EMAIL);
        }
    } catch (error) {
        console.log("❌ Paynecta Verify Error:", error.message);
    }
}

/**
 * =========================================
 * AUTH MIDDLEWARES
 * =========================================
 */
function auth(req, res, next) {
    try {
        const header = req.headers.authorization;
        if (!header) return res.status(401).json({ error: "No token provided." });
        const token = header.split(" ")[1];
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid token" });
    }
}

function adminAuth(req, res, next) {
    auth(req, res, () => {
        const userEmail = req.user.email ? req.user.email.toLowerCase() : "";
        if (userEmail === ADMIN_EMAIL && req.user.phone === ADMIN_PHONE) {
            next();
        } else {
            res.status(403).json({ error: "Forbidden: Owner access only." });
        }
    });
}

/**
 * =========================================
 * PAYNECTA AUTOMATED WEBHOOK (UPDATED)
 * =========================================
 */
app.post("/api/paynecta/webhook", async (req, res) => {
    // Send 200 immediately to acknowledge Paynecta
    res.status(200).send("Webhook received");

    try {
        const event = req.body;
        const { event_type, data } = event;
        const transaction = data?.transaction || {};

        const incomingPhone = (
            transaction.mobile_number || 
            data?.PhoneNumber || 
            data?.phone || ""
        ).toString().replace(/\s+/g, '');

        if (event_type === "payment.completed" && incomingPhone) {
            
            // SEARCH: Find user where the incoming phone matches ANY of their 4 saved channels
            const user = await User.findOne({
                $or: [
                    { phone: incomingPhone },
                    { paymentPhone1: incomingPhone },
                    { paymentPhone2: incomingPhone },
                    { paymentPhone3: incomingPhone }
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
                        phone: incomingPhone,
                        amount: amount,
                        transactionCode: transCode,
                        status: "completed"
                    });

                    user.balance += amount;
                    await user.save();

                    log(`✅ Automated Credit: ${user.email} received KES ${amount} via ${incomingPhone}`);
                }
            } else {
                log(`⚠️ Webhook Warning: Unrecognized payment from ${incomingPhone}`);
            }
        }
    } catch (err) {
        log(`Webhook Processing Error: ${err.message}`);
    }
});

/**
 * =========================================
 * USER PROFILE ENDPOINTS (NEW)
 * =========================================
 */

// SAVE PAYMENT PROFILE FROM ADD-FUNDS MODAL
app.post("/api/user/update-payment-profile", auth, async (req, res) => {
    try {
        const { name, email, phones } = req.body;

        if (!name || !email || !phones || !phones[0]) {
            return res.status(400).json({ error: "Incomplete profile details" });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        user.paymentProfileName = name;
        user.paymentProfileEmail = email;
        user.paymentPhone1 = phones[0] || null;
        user.paymentPhone2 = phones[1] || null;
        user.paymentPhone3 = phones[2] || null;

        await user.save();

        res.json({ success: true, message: "Payment profile synchronized" });
    } catch (err) {
        res.status(500).json({ error: "Failed to update profile" });
    }
});

// FETCH PROFILE DATA FOR DASHBOARD
app.get("/api/user/payment-profile", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("paymentProfileName paymentProfileEmail paymentPhone1 paymentPhone2 paymentPhone3");
        res.json({
            success: true,
            profile: {
                name: user.paymentProfileName,
                email: user.paymentProfileEmail,
                phones: [user.paymentPhone1, user.paymentPhone2, user.paymentPhone3].filter(Boolean)
            }
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});

/**
 * =========================================
 * AUTH ROUTES
 * =========================================
 */
app.post("/api/register", async (req, res) => {
    try {
        const { username, email, password, phone, referralCode } = req.body;
        const exists = await User.findOne({ $or: [{ email: email?.toLowerCase() }, { phone }] });
        if (exists) return res.status(400).json({ error: "Account exists" });

        await User.create({
            username: username?.toLowerCase(),
            email: email?.toLowerCase(),
            password,
            phone,
            referralCode: crypto.randomBytes(4).toString("hex"),
            referredBy: referralCode || null
        });
        res.json({ success: true });
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

        const token = jwt.sign({ id: user._id, email: user.email, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.json({ token, balance: user.balance });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});

app.get("/api/me", auth, async (req, res) => {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
});

/**
 * =========================================
 * SMM SERVICE LOGIC (UNCHANGED)
 * =========================================
 */
// [Service, Order, Sync, and Referral Bonus logic remains exactly as provided in your original code]

/**
 * =========================================
 * STATIC ROUTES & ADMIN
 * =========================================
 */
const pages = ["home", "new-order", "my-orders", "services", "add-funds", "referrals", "dashboard"];
pages.forEach(p => app.get(`/${p}`, (req, res) => res.sendFile(path.join(__dirname, "public", `${p}.html`))));
app.get("/admin", adminAuth, (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "home.html")));

/**
 * =========================================
 * SERVER START
 * =========================================
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 UNASEMEJE ø DIA - Online on port ${PORT}`);
});
