// =========================================
// PAYNECTA INITIALIZATION ROUTE
// =========================================
const express = require("express");
const router = express.Router();
const axios = require("axios");
const Deposit = require("../../../models/Deposit"); // Adjust path if necessary
const auth = require("../../../middleware/auth"); // Adjust path if necessary

// Constants (Should match your server.js config)
const ADMIN_EMAIL = "diasamratb@gmail.com".toLowerCase();
const PAYNECTA_BASE_URL = "https://paynecta.co.ke/api/v1";

router.post("/api/paynecta/initialize", auth, async (req, res) => {
    try {
        const { code, amount, mobile_number } = req.body;

        // 1. VALIDATE AMOUNT
        if (!amount || Number(amount) < 1) {
            return res.status(400).json({
                success: false,
                message: "Invalid amount. Minimum is KES 1"
            });
        }

        // 2. VALIDATE PHONE
        if (!mobile_number) {
            return res.status(400).json({
                success: false,
                message: "Phone number required"
            });
        }

        // 3. FORMAT PHONE NUMBER (STRICT SAFARICOM FORMAT)
        let formattedPhone = String(mobile_number)
            .replace(/\D/g, "") // Removes any non-digit characters (like + or spaces)
            .trim();

        // Convert 07... to 2547...
        if (formattedPhone.startsWith("0")) {
            formattedPhone = "254" + formattedPhone.substring(1);
        }
        // Convert 7... or 1... to 2547... or 2541...
        else if (formattedPhone.startsWith("7") || formattedPhone.startsWith("1")) {
            formattedPhone = "254" + formattedPhone;
        }
        // Note: If it already starts with 254, it remains unchanged.

        // Final Safaricom/Airtel Validation (Must be exactly 12 digits starting with 2547 or 2541)
        if (!/^254(7|1)\d{8}$/.test(formattedPhone)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Safaricom/Airtel number. Use 07... or 01..."
            });
        }

        // 4. SEND TO PAYNECTA FOR STK PUSH
        const response = await axios.post(
            `${PAYNECTA_BASE_URL}/payment/initialize`,
            {
                code: code || "600",
                amount: Number(amount),
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

        // 5. STORE PENDING DEPOSIT
        // This allows you to see the attempt in your admin panel
        await Deposit.create({
            userId: req.user.id,
            userEmail: req.user.email,
            phone: formattedPhone,
            amount: Number(amount),
            // Fallback added for 'reference' based on your webhook payload structure
            transactionCode:
                response.data?.transaction_reference ||
                response.data?.reference ||
                `PENDING-${Date.now()}`,
            status: "pending"
        });

        // 6. RETURN SUCCESS TO FRONTEND
        res.status(response.status).json({
            success: true,
            message: "STK Push sent to your phone",
            data: response.data
        });

    } catch (error) {
        console.error(
            "PAYMENT INITIALIZATION ERROR:",
            error.response?.data || error.message
        );

        const status = error.response?.status || 500;
        const errorData = error.response?.data;

        res.status(status).json({
            success: false,
            message: errorData?.message || "Payment initiation failed",
            error: errorData || error.message
        });
    }
});

module.exports = router;
