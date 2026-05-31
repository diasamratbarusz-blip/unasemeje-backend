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
 * DATABASE CONNECTION
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

            console.log(
                "✅ Paynecta Verified:",
                response.data.data?.email || ADMIN_EMAIL
            );

        } else {

            console.log("❌ Paynecta Verification Failed");
        }

    } catch (error) {

        console.log(
            "❌ Paynecta Verify Error:",
            error.response?.data || error.message
        );
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

        if (!header) {
            return res.status(401).json({
                error: "Access denied. No token provided."
            });
        }

        const token = header.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                error: "Invalid authorization token"
            });
        }

        req.user = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        next();

    } catch (err) {

        return res.status(401).json({
            error: "Invalid or expired token"
        });
    }
}

/**
 * =========================================
 * ADMIN AUTH
 * =========================================
 */
function adminAuth(req, res, next) {

    auth(req, res, () => {

        const userEmail = req.user.email
            ? req.user.email.toLowerCase()
            : "";

        const isAuthorized =
            userEmail === ADMIN_EMAIL &&
            req.user.phone === ADMIN_PHONE;

        if (!isAuthorized) {

            log(`UNAUTHORIZED ACCESS ATTEMPT: ${userEmail}`);

            return res.status(403).json({
                error: "Forbidden: Owner access only."
            });
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

        const referrer = await User.findOne({
            referralCode: user.referredBy
        });

        if (!referrer) return;

        const bonus = orderCost * 0.10;

        referrer.balance += bonus;

        referrer.referralEarnings =
            (referrer.referralEarnings || 0) + bonus;

        await referrer.save();

        log(
            `Referral bonus KES ${bonus} sent to ${referrer.username}`
        );

    } catch (err) {

        log("Referral Bonus Error: " + err.message);
    }
}

function cleanServiceName(name = "") {

    return String(name || "")
        .replace(/\\/g, "")
        .replace(/\[.*?\]/g, "")
        .trim() || "SMM Service";
}

function detectPlatform(service = {}) {

    const text =
        `${service.name || ""} ${service.category || ""}`
            .toLowerCase();

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

    return Number(
        (Number(originalRate || 0) + markup).toFixed(2)
    );
}

/**
 * =========================================
 * PAYNECTA WEBHOOK
 * =========================================
 */
app.post("/api/paynecta/webhook", async (req, res) => {

    res.status(200).send("Webhook received");

    try {

        const event = req.body;

        const { event_type, data } = event;

        const transaction = data?.transaction || {};

        const phone =
            transaction.mobile_number ||
            data?.PhoneNumber ||
            data?.phone;

        if (event_type === "payment.completed") {

            let searchPhone = String(phone || "");

            if (searchPhone.startsWith("0")) {
                searchPhone = searchPhone.substring(1);
            }

            if (searchPhone.startsWith("254")) {
                searchPhone = searchPhone.substring(3);
            }

            const user = await User.findOne({
                phone: { $regex: searchPhone }
            });

            if (user) {

                const transCode =
                    data?.MpesaReceiptNumber ||
                    transaction.reference ||
                    crypto.randomBytes(4).toString("hex");

                const existingDeposit =
                    await Deposit.findOne({
                        transactionCode: transCode
                    });

                if (!existingDeposit) {

                    await Deposit.create({
                        userId: user._id,
                        userEmail: user.email,
                        phone: user.phone,
                        amount: Number(transaction.amount || 0),
                        transactionCode: transCode,
                        status: "completed"
                    });

                    user.balance += Number(transaction.amount || 0);

                    await user.save();

                    log(
                        `Deposit Successful: ${user.email} - ${transaction.amount}`
                    );
                }
            }
        }

    } catch (err) {

        log(`Webhook Error: ${err.message}`);
    }
});

/**
 * =========================================
 * PAYNECTA ENDPOINTS
 * =========================================
 */

// PAYMENT PAGE LINK
app.get("/api/paynecta/link", auth, (req, res) => {

    res.json({
        success: true,
        payment_url: PAYNECTA_PAYMENT_PAGE
    });
});

// VERIFY API
app.get("/api/paynecta/verify", auth, async (req, res) => {

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

        res.json(response.data);

    } catch (error) {

        res.status(400).json({
            success: false,
            message: "Verification failed",
            error:
                error.response?.data ||
                error.message
        });
    }
});

// STK PUSH
app.post("/api/paynecta/stkpush", auth, async (req, res) => {

    try {

        let { amount, phone } = req.body;

        if (!amount || !phone) {

            return res.status(400).json({
                success: false,
                error: "Amount and phone are required"
            });
        }

        phone = String(phone).replace(/\D/g, "");

        if (phone.startsWith("0")) {
            phone = "254" + phone.substring(1);
        }

        if (phone.startsWith("7")) {
            phone = "254" + phone;
        }

        const payload = {
            amount: Number(amount),
            mobile_number: phone,
            code: "600"
        };

        const response = await axios.post(
            `${PAYNECTA_BASE_URL}/payment/initialize`,
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": process.env.PAYNECTA_API_KEY,
                    "X-User-Email": ADMIN_EMAIL
                }
            }
        );

        res.json({
            success: true,
            message: "STK Push sent successfully",
            data: response.data
        });

    } catch (error) {

        console.log(
            "STK PUSH ERROR:",
            error.response?.data || error.message
        );

        res.status(500).json({
            success: false,
            error:
                error.response?.data?.message ||
                "Failed to send STK push"
        });
    }
});

// PAYMENT INITIALIZE
app.post("/api/paynecta/initialize", auth, async (req, res) => {

    try {

        const {
            code,
            amount,
            mobile_number
        } = req.body;

        let formattedPhone = String(mobile_number);

        if (formattedPhone.startsWith("0")) {
            formattedPhone =
                "254" + formattedPhone.substring(1);
        }

        if (!formattedPhone.startsWith("254")) {
            formattedPhone = "254" + formattedPhone;
        }

        const response = await axios.post(
            `${PAYNECTA_BASE_URL}/payment/initialize`,
            {
                code: code || "600",
                amount,
                mobile_number: formattedPhone
            },
            {
                headers: {
                    "X-API-Key": process.env.PAYNECTA_API_KEY,
                    "X-User-Email": ADMIN_EMAIL,
                    "Content-Type": "application/json"
                }
            }
        );

        res.status(response.status).json(response.data);

    } catch (error) {

        const status =
            error.response?.status || 500;

        res.status(status).json(
            error.response?.data || {
                error: "Payment initiation failed"
            }
        );
    }
});

// CHECK STATUS
app.get("/api/paynecta/status", auth, async (req, res) => {

    try {

        const { transaction_reference } = req.query;

        const response = await axios.get(
            `${PAYNECTA_BASE_URL}/payment/status`,
            {
                params: {
                    transaction_reference
                },
                headers: {
                    "X-API-Key": process.env.PAYNECTA_API_KEY,
                    "X-User-Email": ADMIN_EMAIL
                }
            }
        );

        res.json(response.data);

    } catch (error) {

        res.status(400).json({
            success: false,
            message: "Could not retrieve status"
        });
    }
});

/**
 * =========================================
 * USER AUTH
 * =========================================
 */

// REGISTER
app.post("/api/register", async (req, res) => {

    try {

        const {
            username,
            email,
            password,
            phone,
            referralCode
        } = req.body;

        const exists = await User.findOne({
            $or: [
                { email: email?.toLowerCase() },
                { phone },
                { username: username?.toLowerCase() }
            ]
        });

        if (exists) {

            return res.status(400).json({
                error: "Account already exists"
            });
        }

        await User.create({
            username: username?.toLowerCase(),
            email: email?.toLowerCase(),
            password,
            phone,
            referralCode: generateReferralCode(),
            referredBy: referralCode || null,
            balance: 0
        });

        res.json({
            success: true,
            message: "Registration successful"
        });

    } catch (err) {

        res.status(500).json({
            error: "Registration failed"
        });
    }
});

// LOGIN
app.post("/api/login", async (req, res) => {

    try {

        const { identifier, password } = req.body;

        const user = await User.findOne({
            $or: [
                { email: identifier?.toLowerCase() },
                { username: identifier?.toLowerCase() }
            ],
            password
        });

        if (!user) {

            return res.status(400).json({
                error: "Invalid credentials"
            });
        }

        const token = jwt.sign(
            {
                id: user._id,
                email: user.email,
                username: user.username,
                phone: user.phone
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        res.json({
            token,
            balance: user.balance
        });

    } catch (err) {

        res.status(500).json({
            error: "Login failed"
        });
    }
});

// GET USER
app.get("/api/me", auth, async (req, res) => {

    try {

        const user = await User.findById(
            req.user.id
        ).select("-password");

        res.json(user);

    } catch (err) {

        res.status(500).json({
            error: "Error fetching profile"
        });
    }
});

/**
 * =========================================
 * SERVICES
 * =========================================
 */
app.get("/api/services", async (req, res) => {

    try {

        const forceRefresh =
            req.query.refresh === "true";

        let services = await Service.find();

        if (!services.length || forceRefresh) {

            const url =
                `https://delixgainske.com/api/v2?action=services&key=${process.env.SMM_API_KEY}`;

            const response = await axios.get(url);

            const list = Array.isArray(response.data)
                ? response.data
                : [];

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

            grouped[p][c].push({
                ...s.toObject(),
                rate: applyFinalPrice(s.rate, s.name)
            });
        });

        res.json({
            success: true,
            data: grouped
        });

    } catch (err) {

        res.status(500).json({
            error: "Failed to load services"
        });
    }
});

/**
 * =========================================
 * PLACE ORDER
 * =========================================
 */
app.post("/api/order", auth, async (req, res) => {

    try {

        const {
            serviceId,
            link,
            quantity
        } = req.body;

        const service = await Service.findOne({
            serviceId
        });

        if (!service) {

            return res.status(404).json({
                error: "Service unavailable"
            });
        }

        const user = await User.findById(req.user.id);

        const totalCost =
            (applyFinalPrice(service.rate, service.name) / 1000)
            * Number(quantity);

        if (user.balance < totalCost) {

            return res.status(400).json({
                error: "Insufficient balance"
            });
        }

        const providerRes = await axios.get(
            `https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${quantity}`
        );

        if (
            providerRes.data &&
            providerRes.data.order
        ) {

            const order = await Order.create({
                userId: user._id,
                userEmail: user.email,
                serviceId,
                serviceName: service.name,
                orderId: String(providerRes.data.order),
                link,
                quantity,
                cost: totalCost,
                status: "pending"
            });

            user.balance -= totalCost;

            await user.save();

            await giveReferralBonus(
                user._id,
                totalCost
            );

            res.json({
                success: true,
                orderId: order.orderId,
                newBalance: user.balance.toFixed(2)
            });

        } else {

            res.status(400).json({
                error: "Provider error."
            });
        }

    } catch (err) {

        res.status(500).json({
            error: "Order failed."
        });
    }
});

/**
 * =========================================
 * SYNC ORDERS
 * =========================================
 */
app.get("/api/sync-orders", auth, async (req, res) => {

    try {

        const activeOrders = await Order.find({
            userId: req.user.id,
            status: {
                $nin: [
                    "completed",
                    "canceled",
                    "partial"
                ]
            }
        });

        if (activeOrders.length > 0) {

            const ids = activeOrders
                .map(o => o.orderId)
                .join(",");

            const url =
                `https://delixgainske.com/api/v2?key=${process.env.SMM_API_KEY}&action=status&orders=${ids}`;

            const response = await axios.get(url);

            for (let orderId in response.data) {

                const data = response.data[orderId];

                if (data?.status) {

                    await Order.findOneAndUpdate(
                        { orderId },
                        {
                            status:
                                data.status.toLowerCase()
                        }
                    );
                }
            }
        }

        const updated = await Order.find({
            userId: req.user.id
        }).sort({ createdAt: -1 });

        res.json(updated);

    } catch (err) {

        res.status(500).json({
            error: "Failed to sync orders"
        });
    }
});

/**
 * =========================================
 * MANUAL DEPOSIT
 * =========================================
 */
app.post("/api/deposit", auth, async (req, res) => {

    try {

        const {
            amount,
            transactionCode
        } = req.body;

        const exists = await Deposit.findOne({
            transactionCode:
                transactionCode.toUpperCase()
        });

        if (exists) {

            return res.status(400).json({
                error: "Code already submitted"
            });
        }

        await Deposit.create({
            userId: req.user.id,
            userEmail: req.user.email,
            phone: req.user.phone,
            amount: Number(amount),
            transactionCode:
                transactionCode.toUpperCase(),
            status: "pending"
        });

        res.json({
            success: true,
            message: "Verification pending"
        });

    } catch (error) {

        res.status(500).json({
            error: "Submission failed"
        });
    }
});

/**
 * =========================================
 * ADMIN ENDPOINTS
 * =========================================
 */

// USERS
app.get("/api/admin/users", adminAuth, async (req, res) => {

    const users = await User.find()
        .select("-password");

    res.json(users);
});

// DEPOSITS
app.get("/api/admin/deposits", adminAuth, async (req, res) => {

    const deposits = await Deposit.find()
        .sort({ createdAt: -1 });

    res.json(deposits);
});

// ORDERS
app.get("/api/admin/orders", adminAuth, async (req, res) => {

    const orders = await Order.find()
        .sort({ createdAt: -1 });

    res.json(orders);
});

// APPROVE DEPOSIT
app.post("/api/admin/approve-deposit", adminAuth, async (req, res) => {

    try {

        const { depositId } = req.body;

        const dep = await Deposit.findById(
            depositId
        );

        if (!dep || dep.status !== "pending") {

            return res.status(400).json({
                error: "Invalid deposit"
            });
        }

        const user = await User.findById(
            dep.userId
        );

        user.balance += dep.amount;

        dep.status = "completed";

        await user.save();

        await dep.save();

        res.json({
            success: true
        });

    } catch (err) {

        res.status(500).json({
            error: "Approval failed"
        });
    }
});

// UPDATE BALANCE
app.post("/api/admin/update-balance", adminAuth, async (req, res) => {

    try {

        const { userId, amount } = req.body;

        const user = await User.findById(userId);

        if (!user) {

            return res.status(404).json({
                error: "User not found"
            });
        }

        user.balance += Number(amount);

        await user.save();

        res.json({
            success: true,
            balance: user.balance
        });

    } catch (err) {

        res.status(500).json({
            error: "Update failed"
        });
    }
});

/**
 * =========================================
 * STATIC ROUTES
 * =========================================
 */
const pagesList = [
    "home",
    "platform",
    "packages",
    "new-order",
    "my-orders",
    "services",
    "add-funds",
    "referrals",
    "dashboard"
];

pagesList.forEach(page => {

    app.get(`/${page}`, (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                `${page}.html`
            )
        );
    });
});

// ADMIN PAGE
app.get("/admin", adminAuth, (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "admin.html"
        )
    );
});

// HOME PAGE
app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "home.html"
        )
    );
});

/**
 * =========================================
 * SERVER START
 * =========================================
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `🚀 UNASEMEJE ø DIA - Online on port ${PORT}`
    );
});
