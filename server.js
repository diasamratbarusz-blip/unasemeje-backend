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
 * PAYNECTA HELPERS
 * =========================================
 */

// FORMAT KENYAN PHONE
function formatKenyaPhone(phone) {

    let formatted = String(phone || "")
        .replace(/\D/g, "");

    if (formatted.startsWith("0")) {
        formatted = "254" + formatted.substring(1);
    }

    if (formatted.startsWith("7")) {
        formatted = "254" + formatted;
    }

    return formatted;
}

// VALIDATE PAYMENT
function validatePaynectaPayment(
    code,
    phone,
    amount
) {

    if (!code) {
        return {
            valid: false,
            error: "Payment link code is required"
        };
    }

    if (!phone) {
        return {
            valid: false,
            error: "Phone number is required"
        };
    }

    if (!amount || Number(amount) < 1) {
        return {
            valid: false,
            error: "Minimum amount is KES 1"
        };
    }

    if (Number(amount) > 250000) {
        return {
            valid: false,
            error: "Maximum amount is KES 250,000"
        };
    }

    return {
        valid: true
    };
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

/**
 * =========================================
 * GET SINGLE PAYNECTA LINK DETAILS
 * =========================================
 */
app.get("/api/paynecta/link/:code", auth, async (req, res) => {

    try {

        const { code } = req.params;

        const response = await axios.get(
            `${PAYNECTA_BASE_URL}/links/${code}`,
            {
                headers: {
                    "X-API-Key": process.env.PAYNECTA_API_KEY,
                    "X-User-Email": ADMIN_EMAIL
                }
            }
        );

        res.json({
            success: true,
            message: "Link retrieved successfully",
            data: response.data.data
        });

    } catch (error) {

        console.log(
            "PAYNECTA SINGLE LINK ERROR:",
            error.response?.data || error.message
        );

        res.status(500).json({
            success: false,
            error:
                error.response?.data?.message ||
                "Failed to retrieve payment link"
        });
    }
});

/**
 * =========================================
 * GET ALL PAYNECTA LINKS
 * =========================================
 */
app.get("/api/paynecta/links", auth, async (req, res) => {

    try {

        const response = await axios.get(
            `${PAYNECTA_BASE_URL}/links`,
            {
                headers: {
                    "X-API-Key": process.env.PAYNECTA_API_KEY,
                    "X-User-Email": ADMIN_EMAIL
                }
            }
        );

        res.json({
            success: true,
            message: "Links retrieved successfully",
            data: response.data.data
        });

    } catch (error) {

        console.log(
            "PAYNECTA LINKS ERROR:",
            error.response?.data || error.message
        );

        res.status(500).json({
            success: false,
            error:
                error.response?.data?.message ||
                "Failed to retrieve links"
        });
    }
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

        phone = formatKenyaPhone(phone);

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

/**
 * =========================================
 * PAYNECTA SDK STYLE INITIALIZE
 * =========================================
 */
app.post(
    "/api/paynecta/sdk/initialize",
    auth,
    async (req, res) => {

        try {

            let {
                code,
                mobile_number,
                amount
            } = req.body;

            const validation =
                validatePaynectaPayment(
                    code,
                    mobile_number,
                    amount
                );

            if (!validation.valid) {

                return res.status(400).json({
                    success: false,
                    error: validation.error
                });
            }

            mobile_number =
                formatKenyaPhone(
                    mobile_number
                );

            const payload = {
                code,
                mobile_number,
                amount: Number(amount)
            };

            const response = await axios.post(
                `${PAYNECTA_BASE_URL}/payment/initialize`,
                payload,
                {
                    headers: {
                        "Content-Type":
                            "application/json",

                        "X-API-Key":
                            process.env.PAYNECTA_API_KEY,

                        "X-User-Email":
                            ADMIN_EMAIL
                    }
                }
            );

            const transactionReference =
                response.data?.data
                    ?.transaction_reference ||

                response.data?.transaction_reference ||

                response.data?.reference ||

                null;

            res.json({
                success: true,
                message:
                    "Payment initialized successfully",

                transaction_reference:
                    transactionReference,

                data: response.data
            });

        } catch (error) {

            console.log(
                "PAYNECTA SDK INITIALIZE ERROR:",
                error.response?.data ||
                error.message
            );

            res.status(
                error.response?.status || 500
            ).json({
                success: false,
                error:
                    error.response?.data?.message ||

                    "Failed to initialize payment"
            });
        }
    }
);

/**
 * =========================================
 * PAYNECTA SDK VALIDATED INITIALIZE
 * =========================================
 */
app.post(
    "/api/paynecta/sdk/initialize-with-validation",
    auth,
    async (req, res) => {

        try {

            let {
                code,
                mobile_number,
                amount
            } = req.body;

            const validation =
                validatePaynectaPayment(
                    code,
                    mobile_number,
                    amount
                );

            if (!validation.valid) {

                return res.status(400).json({
                    success: false,
                    error: validation.error
                });
            }

            mobile_number =
                formatKenyaPhone(
                    mobile_number
                );

            const payload = {
                code,
                mobile_number,
                amount: Number(amount)
            };

            const response = await axios.post(
                `${PAYNECTA_BASE_URL}/payment/initialize`,
                payload,
                {
                    headers: {
                        "Content-Type":
                            "application/json",

                        "X-API-Key":
                            process.env.PAYNECTA_API_KEY,

                        "X-User-Email":
                            ADMIN_EMAIL
                    }
                }
            );

            const transactionReference =
                response.data?.data
                    ?.transaction_reference ||

                response.data?.transaction_reference ||

                response.data?.reference ||

                null;

            res.json({
                success: true,
                message:
                    "Validated payment initialized successfully",

                transaction_reference:
                    transactionReference,

                data: response.data
            });

        } catch (error) {

            console.log(
                "PAYNECTA VALIDATION ERROR:",
                error.response?.data ||
                error.message
            );

            res.status(
                error.response?.status || 500
            ).json({
                success: false,
                error:
                    error.response?.data?.message ||

                    "Failed to initialize validated payment"
            });
        }
    }
);

/**
 * =========================================
 * GET TRANSACTION REFERENCE
 * =========================================
 */
app.get(
    "/api/paynecta/transaction-reference",
    auth,
    async (req, res) => {

        try {

            const {
                transaction_reference
            } = req.query;

            if (!transaction_reference) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Transaction reference is required"
                });
            }

            const response = await axios.get(
                `${PAYNECTA_BASE_URL}/payment/status`,
                {
                    params: {
                        transaction_reference
                    },

                    headers: {
                        "X-API-Key":
                            process.env.PAYNECTA_API_KEY,

                        "X-User-Email":
                            ADMIN_EMAIL
                    }
                }
            );

            res.json({
                success: true,
                transaction_reference,
                data: response.data
            });

        } catch (error) {

            console.log(
                "TRANSACTION REFERENCE ERROR:",
                error.response?.data ||
                error.message
            );

            res.status(
                error.response?.status || 500
            ).json({
                success: false,
                error:
                    error.response?.data?.message ||

                    "Failed to retrieve transaction reference"
            });
        }
    }
);

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
