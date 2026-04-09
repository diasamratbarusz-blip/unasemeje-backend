const express = require("express");
const router = express.Router();
const { placeOrder, getStatus } = require("../utils/smmApi");
const Order = require("../models/Order");

// PLACE ORDER
router.post("/", async (req, res) => {
  const { service, link, quantity } = req.body;

  try {
    const apiRes = await placeOrder(service, link, quantity);

    const order = await Order.create({
      service,
      link,
      quantity,
      providerOrderId: apiRes.order
    });

    res.json({
      success: true,
      order
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CHECK STATUS
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    const status = await getStatus(order.providerOrderId);

    order.status = status.status;
    await order.save();

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
