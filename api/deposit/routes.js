app.post("/api/paynecta/stkpush", auth, async (req, res) => {

  try {

    const { amount, phone } = req.body;

    const response = await axios.post(
      "https://paynecta.co.ke/api/v1/payments/stkpush",
      {
        amount,
        phone
      },
      {
        headers: {
          "X-API-Key": process.env.PAYNECTA_API_KEY,
          "X-User-Email": process.env.PAYNECTA_EMAIL,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);

  } catch (error) {

    if (error.response) {
      return res.status(400).json(error.response.data);
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
