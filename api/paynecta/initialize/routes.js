app.post("/api/paynecta/initialize", auth, async (req, res) => {

    try {

        const { code, amount, mobile_number } = req.body;

        // VALIDATE AMOUNT
        if (!amount || Number(amount) < 1) {
            return res.status(400).json({
                success: false,
                message: "Invalid amount"
            });
        }

        // VALIDATE PHONE
        if (!mobile_number) {
            return res.status(400).json({
                success: false,
                message: "Phone number required"
            });
        }

        // FORMAT PHONE NUMBER
        let formattedPhone = String(mobile_number)
            .replace(/\D/g, "")
            .trim();

        if (formattedPhone.startsWith("0")) {
            formattedPhone = "254" + formattedPhone.substring(1);
        }

        if (formattedPhone.startsWith("7")) {
            formattedPhone = "254" + formattedPhone;
        }

        // FINAL VALIDATION
        if (!/^2547\d{8}$/.test(formattedPhone)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Safaricom number"
            });
        }

        // SEND TO PAYNECTA
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

        // STORE PENDING DEPOSIT
        await Deposit.create({
            userId: req.user.id,
            userEmail: req.user.email,
            phone: formattedPhone,
            amount: Number(amount),
            transactionCode:
                response.data?.transaction_reference ||
                `PENDING-${Date.now()}`,
            status: "pending"
        });

        res.status(response.status).json(response.data);

    } catch (error) {

        console.log(
            "PAYMENT ERROR:",
            error.response?.data || error.message
        );

        const status = error.response?.status || 500;

        res.status(status).json(
            error.response?.data || {
                success: false,
                message: "Payment initiation failed"
            }
        );
    }
});
