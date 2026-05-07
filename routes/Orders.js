const express = require("express");
const router = express.Router();
const axios = require("axios");
const Order = require("../models/Order"); 
const User = require("../models/User"); // Added to handle balance deduction

/**
 * =========================================
 * PLACE ORDER (POST /api/orders)
 * =========================================
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

    // 2. Check User Balance & Calculate Cost
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const orderCost = (parseFloat(rate) / 1000) * parseInt(quantity);
    
    if (user.balance < orderCost) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Required: KES ${orderCost.toFixed(2)}`
      });
    }

    // 3. Prepare API Request to Provider
    const params = new URLSearchParams();
    params.append("key", process.env.SMM_API_KEY);
    params.append("action", "add");
    params.append("service", serviceId);
    params.append("link", link);
    params.append("quantity", quantity);

    const response = await axios.post(process.env.SMM_API_URL, params, {
      timeout: 15000 
    });

    // 4. Handle Provider Errors
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

    // 5. Deduct Balance from User
    user.balance -= orderCost;
    user.totalSpent += orderCost;
    user.totalOrders += 1;
    await user.save();

    // 6. Save to Database (Matching your Order.js Model)
    const newOrder = new Order({
      userId: user._id,
      serviceId,
      serviceName: serviceName || "SMM Service",
      link,
      quantity,
      cost: orderCost, // Mapped to 'cost' in Model
      orderId: response.data.order, // Mapped to 'orderId' in Model
      status: "pending"
    });

    await newOrder.save();

    res.json({
      success: true,
      message: "Order placed successfully",
      orderId: response.data.order,
      balance: user.balance,
      internalId: newOrder._id
    });

  } catch (err) {
    console.error("❌ ORDER ROUTE ERROR:", err.message);
    res.status(500).json({
      success: false,
      message: "Internal error occurred during order placement",
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
        const pendingOrders = await Order.find({ 
            userId: req.params.userId, 
            status: { $in: ["pending", "processing", "inprogress", "pending_refill"] } 
        });

        for (let order of pendingOrders) {
            if (order.orderId) { // Using 'orderId' as per your Model
                const params = new URLSearchParams();
                params.append("key", process.env.SMM_API_KEY);
                params.append("action", "status");
                params.append("order", order.orderId);

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
        const { orderId } = req.body; 
        
        const params = new URLSearchParams();
        params.append("key", process.env.SMM_API_KEY);
        params.append("action", "refill");
        params.append("order", orderId);

        const response = await axios.post(process.env.SMM_API_URL, params);

        if (response.data && (response.data.refill || response.data.status === "success")) {
            await Order.findOneAndUpdate(
                { orderId: orderId },
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
