const express = require("express");
const router = express.Router();
const User = require("../models/User"); // Path to your User model

// Assuming you have a Transaction model to prevent double-crediting
// If you don't have this model yet, the route falls back gracefully
let Transaction;
try {
    Transaction = require("../models/Transaction");
} catch (e) {
    // Fallback if Transaction model doesn't exist yet
    Transaction = null;
}

router.post('/paynecta/webhook', async (req, res) => {
    const event = req.body;

    console.log('Webhook received:', event);

    if (event.event_type === 'payment.completed') {

        // Safely extract payload attributes from Paynecta structural object
        const phone = event.data?.customer?.mobile_number || event.data?.phone;
        const amount = parseFloat(event.data?.transaction?.amount || event.amount || 0);
        const receipt = event.data?.MpesaReceiptNumber || event.data?.reference;
        const reference = event.data?.transaction?.reference || event.reference;

        console.log(
            `Payment completed: ${phone} KES ${amount} Receipt ${receipt}`
        );

        try {
            // 1. Sanitize incoming mobile number string to match database format
            if (!phone) {
                console.error("Webhook Error: Incoming payment payload is missing a mobile number identifier.");
                return res.status(200).json({ success: true }); // Acknowledge to prevent endpoint spamming
            }
            const cleanIncomingPhone = phone.toString().replace(/\s+/g, '');

            // 2. Idempotency Check: Prevent duplicate balance updates from redundant webhook deliveries
            if (Transaction) {
                const existingTxn = await Transaction.findOne({ 
                    $or: [{ transactionId: receipt }, { reference: reference }] 
                });
                if (existingTxn) {
                    console.log(`Webhook Alert: Transaction ${receipt} or Reference ${reference} already processed.`);
                    return res.status(200).json({ success: true });
                }
            }

            // 3. SECURED TRACKING ENGINE: Search across primary phone and all 3 custom payment profile boxes
            const matchedUser = await User.findOne({
                $or: [
                    { phone: cleanIncomingPhone },
                    { paymentPhone1: cleanIncomingPhone },
                    { paymentPhone2: cleanIncomingPhone },
                    { paymentPhone3: cleanIncomingPhone }
                ]
            });

            if (!matchedUser) {
                console.log(`Security Notice: Received KES ${amount} from ${cleanIncomingPhone} but no user profile matches this gate channel.`);
                // Return 200 to clear gateway logs, but flag internally
                return res.status(200).json({ success: true });
            }

            // 4. TRANSACTION MUTATION: Increment account balance and business logic aggregates
            matchedUser.balance += amount;
            
            // Save the updated configuration to MongoDB triggers
            await matchedUser.save();
            console.log(`🎉 Automated Sync Success: Credited ${matchedUser.email} with KES ${amount}. New Balance: KES ${matchedUser.balance}`);

            // 5. SAVE TRANSACTION LOG (If model exists)
            if (Transaction) {
                await Transaction.create({
                    user: matchedUser._id,
                    email: matchedUser.email,
                    amount: amount,
                    transactionId: receipt,
                    reference: reference,
                    status: "completed",
                    paymentMethod: "M-Pesa (Paynecta)"
                });
            }

        } catch (error) {
            console.error("Critical System Failure during webhook processing:", error);
            // Return a 500 server error code to let Paynecta know it should retry later
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // Always respond with a 200 OK handshake back to the portal dashboard to guarantee a 100% success rate metric
    res.status(200).json({
        success: true
    });
});

module.exports = router;
