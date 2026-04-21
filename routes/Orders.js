const express = require("express");
const router = express.Router();
const axios = require("axios");
const Order = require("../models/Order"); // Ensure path is correct

/**
 * =========================================
 * PLACE ORDER (POST /api/orders)
 * =========================================
 * Handles validation, provider API call, and DB logging
 */
router.post("/", async (req, res) => {
  try {
    const { serviceId, link, quantity, userId, rate, serviceName } = req.body;

    // 1. Basic Validation
    if (!serviceId || !link || !quantity || !userId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (serviceId, link, quantity, or userId)"
      });
    }

    // 2. Prepare API Request to Provider
    const params = new URLSearchParams();
    params.append("key", process.env.SMM_API_KEY);
    params.append("action", "add");
    params.append("service", serviceId);
    params.append("link", link);
    params.append("quantity", quantity);

    // 3. Contact Provider
    const response = await axios.post(process.env.SMM_API_URL, params, {
      timeout: 15000 // 15 seconds timeout
    });

    console.log("PROVIDER RESPONSE:", response.data);

    /**
     * PRO TIP: SMM Providers often return errors in response.data.error
     * Even if the HTTP status is 200 (Success).
     */
    if (response.data.error) {
      return res.status(400).json({
        success: false,
        message: `Provider Error: ${response.data.error}`,
      });
    }

    if (!response.data || !response.data.order) {
      return res.status(500).json({
        success: false,
        message: "Provider did not return an Order ID",
        debug: response.data
      });
    }

    // 4. Save to Database
    // Using the pre-save hook in the model to calculate 'cost' automatically
    const newOrder = new Order({
      userId,
      serviceId,
      serviceName: serviceName || "SMM Service",
      link,
      quantity,
      rate: rate || 0, // Passed from frontend or fetched from service list
      providerOrderId: response.data.order,
      providerResponse: response.data, // Storing full response for debugging
      status: "pending"
    });

    await newOrder.save();

    // 5. Success Response
    res.json({
      success: true,
      message: "Order placed successfully",
      orderId: response.data.order,
      internalId: newOrder._id
    });

  } catch (err) {
    console.error("❌ CRITICAL ORDER ERROR:", err.message);

    // Check if the error came from the Provider's server
    const errorMsg = err.response ? 
      `API Error: ${JSON.stringify(err.response.data)}` : 
      err.message;

    res.status(500).json({
      success: false,
      message: "An internal error occurred while placing the order",
      error: errorMsg
    });
  }
});

/**
 * =========================================
 * GET USER ORDERS (GET /api/orders/:userId)
 * =========================================
 */
router.get("/user/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(50); // Optimization: don't load thousands at once

    res.json({
      success: true,
      count: orders.length,
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
 * SYNC STATUS (GET /api/orders/status/:orderId)
 * =========================================
 */
router.get("/status/:orderId", async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.append("key", process.env.SMM_API_KEY);
    params.append("action", "status");
    params.append("order", req.params.orderId);

    const response = await axios.post(process.env.SMM_API_URL, params);

    // Update the local database with the latest status from provider
    if (response.data && response.data.status) {
      await Order.findOneAndUpdate(
        { providerOrderId: req.params.orderId },
        { 
          status: response.data.status.toLowerCase().replace(" ", "_"),
          remains: response.data.remains,
          startCount: response.data.start_count
        }
      );
    }

    res.json({
      success: true,
      data: response.data
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to sync status",
      error: err.message
    });
  }
});

module.exports = router;
