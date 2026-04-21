const express = require("express");
const router = express.Router();
const axios = require("axios");
const Order = require("../models/Order"); 

/**
 * =========================================
 * PLACE ORDER (POST /api/orders)
 * =========================================
 */
router.post("/", async (req, res) => {
  try {
    const { serviceId, link, quantity, userId, rate, serviceName } = req.body;

    if (!serviceId || !link || !quantity || !userId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (serviceId, link, quantity, or userId)"
      });
    }

    // Prepare API Request to Provider
    const params = new URLSearchParams();
    params.append("key", process.env.SMM_API_KEY);
    params.append("action", "add");
    params.append("service", serviceId);
    params.append("link", link);
    params.append("quantity", quantity);

    const response = await axios.post(process.env.SMM_API_URL, params, {
      timeout: 15000 
    });

    if (response.data.error) {
      return res.status(400).json({
        success: false,
        message: `Provider Error: ${response.data.error}`,
      });
    }

    if (!response.data || !response.data.order) {
      return res.status(500).json({
        success: false,
        message: "Provider did not return an Order ID"
      });
    }

    const newOrder = new Order({
      userId,
      serviceId,
      serviceName: serviceName || "SMM Service",
      link,
      quantity,
      rate: rate || 0,
      providerOrderId: response.data.order, // This maps to o.orderId in your frontend
      providerResponse: response.data,
      status: "pending"
    });

    await newOrder.save();

    res.json({
      success: true,
      message: "Order placed successfully",
      orderId: response.data.order,
      internalId: newOrder._id
    });

  } catch (err) {
    console.error("❌ ORDER ERROR:", err.message);
    res.status(500).json({
      success: false,
      message: "Internal error occurred",
      error: err.message
    });
  }
});

/**
 * =========================================
 * GET USER ORDERS (GET /api/orders/user/:userId)
 * =========================================
 */
router.get("/user/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * =========================================
 * SYNC ALL PENDING ORDERS (GET /api/orders/sync-all/:userId)
 * =========================================
 */
router.get("/sync-all/:userId", async (req, res) => {
    try {
        // Only sync orders that aren't finished yet
        const pendingOrders = await Order.find({ 
            userId: req.params.userId, 
            status: { $in: ["pending", "processing", "inprogress", "pending_refill"] } 
        });

        for (let order of pendingOrders) {
            if (order.providerOrderId) {
                const params = new URLSearchParams();
                params.append("key", process.env.SMM_API_KEY);
                params.append("action", "status");
                params.append("order", order.providerOrderId);

                const response = await axios.post(process.env.SMM_API_URL, params);

                if (response.data && response.data.status) {
                    order.status = response.data.status.toLowerCase().replace(/\s+/g, '');
                    order.remains = response.data.remains;
                    order.startCount = response.data.start_count;
                    await order.save();
                }
            }
        }

        const allOrders = await Order.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json({ success: true, data: allOrders });
    } catch (err) {
        res.status(500).json({ success: false, message: "Sync failed", error: err.message });
    }
});

/**
 * =========================================
 * REQUEST REFILL (POST /api/orders/refill)
 * =========================================
 */
router.post("/refill", async (req, res) => {
    try {
        const { orderId } = req.body; // providerOrderId from dashboard
        
        const params = new URLSearchParams();
        params.append("key", process.env.SMM_API_KEY);
        params.append("action", "refill");
        params.append("order", orderId);

        const response = await axios.post(process.env.SMM_API_URL, params);

        if (response.data && (response.data.refill || response.data.status === "success")) {
            // Optional: Update status in DB to show refill is active
            await Order.findOneAndUpdate(
                { providerOrderId: orderId },
                { status: "pending_refill" }
            );
            
            res.json({ success: true, message: "Refill request sent to provider!" });
        } else {
            res.status(400).json({ 
                success: false, 
                message: response.data.error || "Refill not available for this service." 
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
