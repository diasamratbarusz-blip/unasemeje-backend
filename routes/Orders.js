const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const smmRequest = require("../utils/smmApi");

const Order = require("../models/Order");
const User = require("../models/User");
const Service = require("../models/Service");

/* Helper: calculate cost */
function calculateCost(rate, quantity) {
  return (rate / 1000) * quantity;
}

/* PLACE ORDER */
router.post("/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    // ✅ Validation
    if (!serviceId || !link || !quantity) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (quantity <= 0) {
      return res.status(400).json({ error: "Invalid quantity" });
    }

    // ✅ Find service from DB (pricing control)
    const service = await Service.findOne({ serviceId });
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    // ✅ Calculate cost
    const cost = calculateCost(service.rate, quantity);

    // ✅ Get user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // ✅ Check balance
    if (user.balance < cost) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // ✅ Send order to SMM provider
    const response = await smmRequest({
      action: "add",
      service: serviceId,
      link,
      quantity
    });

    if (!response || !response.order) {
      return res.status(500).json({
        error: "Failed to create order with SMM provider"
      });
    }

    // ✅ Deduct balance
    user.balance -= cost;
    await user.save();

    // ✅ Save order in DB
    const order = new Order({
      userId: user._id,
      service: service.name,
      link,
      quantity,
      smmOrderId: response.order,
      status: "processing"
    });

    await order.save();

    res.json({
      message: "Order placed successfully",
      order,
      cost,
      remainingBalance: user.balance
    });

  } catch (err) {
    console.error("Order error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
