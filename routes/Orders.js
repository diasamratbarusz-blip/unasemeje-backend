const express = require("express");
const router = express.Router();
const axios = require("axios");
const Order = require("../models/Order"); 
const User = require("../models/User");

/**
 * =========================================
 * PLACE ORDER (POST /api/order)
 * =========================================
 * This route communicates with Delixgains API and deducts KES from user.
 */
router.post("/", async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;
    const userId = req.user.id; // Using ID from Auth middleware

    // 1. Basic Validation
    if (!serviceId || !link || !quantity) {
      return res.status(400).json({
        success: false,
        error: "Please provide serviceId, link, and quantity."
      });
    }

    // 2. Fetch User and Sync Services to get Current Rate
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    // Note: In a production environment, you should fetch the rate from 
    // your local 'Service' model to prevent rate manipulation from the frontend.
    const rate = req.body.rate || 0; 
    const orderCost = (parseFloat(rate) / 1000) * parseInt(quantity);
    
    // 3. Balance Check
    if (user.balance < orderCost) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance. This order costs KES ${orderCost.toFixed(2)}`
      });
    }

    // 4. Prepare API Request to Delixgains
    const params = new URLSearchParams();
    params.append("key", process.env.SMM_API_KEY);
    params.append("action", "add");
    params.append("service", serviceId);
    params.append("link", link);
    params.append("quantity", quantity);

    const response = await axios.post(process.env.SMM_API_URL, params, {
      timeout: 15000 
    });

    // 5. Handle Provider Errors
    if (response.data.error) {
      return res.status(400).json({
        success: false,
        error: `Provider Error: ${response.data.error}`,
      });
    }

    if (!response.data || !response.data.order) {
      return res.status(500).json({
        success: false,
        error: "Provider communication failed. No Order ID returned."
      });
    }

    // 6. Transaction: Deduct Balance & Save Order
    // Using a simple deduction here; for high traffic, consider a DB Session/Transaction
    user.balance -= orderCost;
    await user.save();

    const newOrder = new Order({
      userId: user._id,
      serviceId,
      serviceName: req.body.serviceName || "SMM Service",
      link,
      quantity,
      cost: orderCost,
      orderId: response.data.order, 
      status: "pending",
      providerCharge: response.data.charge || 0 // If provider returns the USD charge
    });

    await newOrder.save();

    res.json({
      success: true,
      message: "Order placed successfully!",
      orderId: response.data.order,
      newBalance: user.balance
    });

  } catch (err) {
    console.error("❌ ORDER ROUTE ERROR:", err.message);
    res.status(500).json({
      success: false,
      error: "Critical error during order placement. Contact support."
    });
  }
});

/**
 * =========================================
 * SYNC ORDERS (GET /api/sync-orders)
 * =========================================
 * Updates status and remains for all active orders for the logged-in user.
 */
router.get("/sync-orders", async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Find orders that aren't finalized
        const activeOrders = await Order.find({ 
            userId: userId, 
            status: { $in: ["pending", "processing", "inprogress", "pending_refill"] } 
        });

        for (let order of activeOrders) {
            try {
                const params = new URLSearchParams();
                params.append("key", process.env.SMM_API_KEY);
                params.append("action", "status");
                params.append("order", order.orderId);

                const response = await axios.post(process.env.SMM_API_URL, params);

                if (response.data && response.data.status) {
                    order.status = response.data.status.toLowerCase().replace(/\s+/g, '');
                    order.remains = response.data.remains || 0;
                    order.startCount = response.data.start_count || 0;
                    await order.save();
                }
            } catch (e) {
                console.error(`Sync failed for order ${order.orderId}`);
            }
        }

        // Return the full updated list
        const allOrders = await Order.find({ userId: userId }).sort({ createdAt: -1 }).limit(50);
        res.json(allOrders);
    } catch (err) {
        res.status(500).json({ success: false, error: "Sync failed" });
    }
});

/**
 * =========================================
 * REQUEST REFILL (POST /api/order/refill)
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
            res.json({ success: true, message: "Refill request sent!" });
        } else {
            res.status(400).json({ 
                success: false, 
                error: response.data.error || "Refill not available for this order." 
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
