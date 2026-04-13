const express = require("express");
const router = express.Router();
const { createOrder, getStatus } = require("../utils/smmApi");
const Order = require("../models/Order");

// PLACE ORDER
router.post("/", async (req, res) => {
  const { service, link, quantity } = req.body;

  if (!service || !link || !quantity) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const apiRes = await createOrder(service, link, quantity);

    if (!apiRes || !apiRes.order) {
      return res.status(500).json({ error: "Provider order failed" });
    }

    const order = await Order.create({
      service,
      link,
      quantity,
      providerOrderId: apiRes.order,
      status: "pending"
    });

    res.json({
      success: true,
      order
    });

  } catch (err) {
    console.error("ORDER ERROR:", err.message);
    res.status(500).json({ error: "Order failed" });
  }
});

// CHECK STATUS
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (!order.providerOrderId) {
      return res.status(400).json({ error: "Missing provider order ID" });
    }

    const status = await getStatus(order.providerOrderId);

    order.status = status?.status || order.status;
    await order.save();

    res.json(order);

  } catch (err) {
    console.error("STATUS ERROR:", err.message);
    res.status(500).json({ error: "Status check failed" });
  }
});

module.exports = router;
