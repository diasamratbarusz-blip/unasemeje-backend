const express = require("express");
const auth = require("../middleware/auth");
const axios = require("axios");
const Order = require("../models/Order");

const router = express.Router();

// CREATE ORDER
router.post("/", auth, async (req, res) => {
  const { service, link, quantity } = req.body;

  const response = await axios.post(process.env.SMM_API_URL, {
    key: process.env.SMM_API_KEY,
    action: "add",
    service,
    link,
    quantity
  });

  await Order.create({
    userId: req.user.id,
    service,
    link,
    quantity
  });

  res.json({ orderId: response.data.order });
});

// GET ORDERS
router.get("/", auth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.id });
  res.json(orders);
});

module.exports = router;
