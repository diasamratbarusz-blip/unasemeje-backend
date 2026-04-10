app.post("/api/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    // ================= VALIDATION =================
    if (!serviceId || !link || !quantity) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const service = await Service.findOne({ serviceId });
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // ================= COST CALCULATION =================
    const cost = (service.rate / 1000) * quantity;

    // ================= BALANCE CHECK =================
    if (user.balance < cost) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // ================= ENV SAFETY CHECK =================
    if (!process.env.API_URL || !process.env.API_KEY) {
      console.error("❌ Missing API_URL or API_KEY in environment variables");

      return res.status(500).json({
        error: "Server misconfiguration: API credentials missing"
      });
    }

    // ================= CREATE ORDER (SMM API) =================
    let response;
    try {
      response = await smmRequest.createOrder(
        serviceId,
        link,
        quantity
      );
    } catch (apiErr) {
      console.error("❌ SMM API ERROR:", apiErr.message);

      return res.status(500).json({
        error: "Failed to connect to provider API",
        details: apiErr.message
      });
    }

    // ================= VALIDATE RESPONSE =================
    if (!response || !response.order) {
      console.error("❌ Invalid SMM response:", response);

      return res.status(500).json({
        error: "SMM API failed",
        details: response
      });
    }

    // ================= DEDUCT BALANCE =================
    user.balance -= cost;
    await user.save();

    // ================= SAVE ORDER =================
    const order = await Order.create({
      userId: user._id,
      service: service.name,
      link,
      quantity,
      smmOrderId: response.order,
      cost,
      status: "Pending"
    });

    // ================= RESPONSE =================
    return res.json({
      message: "Order placed successfully",
      order,
      balance: user.balance
    });

  } catch (err) {
    console.error("❌ ORDER ROUTE ERROR:", err);

    return res.status(500).json({
      error: "Order failed",
      details: err.message
    });
  }
});
