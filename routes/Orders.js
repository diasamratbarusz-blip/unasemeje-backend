const express = require("express");
const router = express.Router();
const axios = require("axios");
const Order = require("../../models/Order");

/**
 * =========================================
 * PLACE ORDER
 * =========================================
 * POST /api/orders
 */
router.post("/", async (req, res) => {
  try {
    const { serviceId, link, quantity, userId } = req.body;

    if (!serviceId || !link || !quantity) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // ================= SEND TO PROVIDER =================
    const params = new URLSearchParams();
    params.append("key", process.env.SMM_API_KEY);
    params.append("action", "add");
    params.append("service", serviceId);
    params.append("link", link);
    params.append("quantity", quantity);

    const response = await axios.post(process.env.SMM_API_URL, params, {
      timeout: 15000
    });

    console.log("PROVIDER ORDER RESPONSE:", response.data);

    // Provider returns:
    // { order: 12345 }
    if (!response.data || !response.data.order) {
      return res.status(500).json({
        success: false,
        message: "Failed to place order with provider"
      });
    }

    // ================= SAVE TO DB =================
    const newOrder = new Order({
      userId: userId || "guest",
      serviceId,
      link,
      quantity,
      providerOrderId: response.data.order,
      status: "pending",
      createdAt: new Date()
    });

    await newOrder.save();

    // ================= RESPONSE =================
    res.json({
      success: true,
      message: "Order placed successfully",
      orderId: response.data.order
    });

  } catch (err) {
    console.error("❌ ORDER ERROR:", err.message);

    res.status(500).json({
      success: false,
      message: "Order failed",
      error: err.message
    });
  }
});

/**
 * =========================================
 * GET USER ORDERS
 * =========================================
 * GET /api/orders/:userId
 */
router.get("/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: orders
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
      error: err.message
    });
  }
});

/**
 * =========================================
 * CHECK ORDER STATUS (FROM PROVIDER)
 * =========================================
 */
router.get("/status/:orderId", async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.append("key", process.env.SMM_API_KEY);
    params.append("action", "status");
    params.append("order", req.params.orderId);

    const response = await axios.post(process.env.SMM_API_URL, params);

    res.json({
      success: true,
      data: response.data
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to check status",
      error: err.message
    });
  }
});

module.exports = router;
