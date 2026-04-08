const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const smmRequest = require("../utils/smmApi");
const Order = require("../models/Order");

/* PLACE ORDER */
router.post("/order", auth, async (req, res) => {
  try {
    const { service, link, quantity } = req.body;

    // ✅ Basic validation
    if (!service || !link || !quantity) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (quantity <= 0) {
      return res.status(400).json({ error: "Invalid quantity" });
    }

    // ✅ Call SMM API
    const response = await smmRequest({
      action: "add",
      service,
      link,
      quantity
    });

    if (!response || !response.order) {
      return res.status(500).json({
        error: "Failed to create order with SMM provider"
      });
    }

    // ✅ Save order in database
    const order = new Order({
      userId: req.user.id,
      service,
      link,
      quantity,
      smmOrderId: response.order,
      status: "processing"
    });

    await order.save();

    res.json({
      message: "Order placed successfully",
      order
    });

  } catch (err) {
    console.error("Order error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
