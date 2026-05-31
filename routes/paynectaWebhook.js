app.post('/paynecta/webhook', async (req, res) => {
    const event = req.body;

    console.log('Webhook received:', event);

    if (event.event_type === 'payment.completed') {

        const phone = event.data.customer.mobile_number;
        const amount = parseFloat(event.data.transaction.amount);
        const receipt = event.data.MpesaReceiptNumber;
        const reference = event.data.transaction.reference;

        // Find user by phone number
        // Add balance
        // Save transaction

        console.log(
            `Payment completed: ${phone} KES ${amount} Receipt ${receipt}`
        );
    }

    res.status(200).json({
        success: true
    });
});
