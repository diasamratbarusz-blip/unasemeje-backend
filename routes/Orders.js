const express = require("express");
const auth = require("../middleware/auth");
const axios = require("axios");
const Order = require("../models/Order");
const User = require("../models/User");

const router = express.Router();

// CREATE ORDER
router.post("/", auth, async (req, res) => {
  try {
    const { service, link, quantity } = req.body;

    if (!service || !link || !quantity) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // Call external SMM API
    const response = await axios.post(process.env.SMM_API_URL, {
      key: process.env.SMM_API_KEY,
      action: "add",
      service,
      link,
      quantity
    });

    if (!response.data || !response.data.order) {
      return res.status(400).json({ error: "SMM API error" });
    }

    // Save order in DB
    const order = await Order.create({
      userId: req.user.id,
      service,
      link,
      quantity,
      status: "processing",
      externalOrderId: response.data.order
    });

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET USER ORDERS
router.get("/", auth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
