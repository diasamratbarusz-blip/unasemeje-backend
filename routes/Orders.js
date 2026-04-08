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

    /* ================= VALIDATION ================= */
    if (!serviceId || !link || !quantity) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (isNaN(quantity) || Number(quantity) <= 0) {
      return res.status(400).json({ error: "Invalid quantity" });
    }

    /* ================= FIND SERVICE ================= */
    const service = await Service.findOne({ serviceId });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    /* ================= COST CALCULATION ================= */
    const cost = calculateCost(service.rate, Number(quantity));

    /* ================= GET USER ================= */
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    /* ================= BALANCE CHECK ================= */
    if (user.balance < cost) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    /* ================= SEND TO SMM API ================= */
    let response;
    try {
      response = await smmRequest({
        action: "add",
        service: serviceId,
        link,
        quantity
      });
    } catch (apiErr) {
      console.error("SMM API error:", apiErr.message);
      return res.status(502).json({ error: "SMM provider error" });
    }

    if (!response || !response.order) {
      return res.status(500).json({
        error: "Invalid response from SMM provider"
      });
    }

    /* ================= DEDUCT BALANCE ================= */
    user.balance = Number(user.balance) - cost;
    await user.save();

    /* ================= SAVE ORDER ================= */
    const order = await Order.create({
      userId: user._id,
      service: service.name,
      link,
      quantity,
      smmOrderId: response.order,
      status: "processing",
      cost
    });

    /* ================= RESPONSE ================= */
    res.json({
      message: "Order placed successfully",
      order,
      cost,
      remainingBalance: user.balance
    });

  } catch (err) {
    console.error("Order error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
