const express = require("express");
const router = express.Router();
const smmRequest = require("../utils/smmApi");
const auth = require("../middleware/auth");

/* GET BALANCE */
router.get("/balance", auth, async (req, res) => {
  try {
    const data = await smmRequest({ action: "balance" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

/* GET SERVICES */
router.get("/services", async (req, res) => {
  try {
    const data = await smmRequest({ action: "services" });

    if (!Array.isArray(data)) {
      return res.status(500).json({ error: "Invalid services response" });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

/* PLACE ORDER */
router.post("/order", auth, async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    if (!serviceId || !link || !quantity) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const data = await smmRequest({
      action: "add",
      service: serviceId,
      link,
      quantity
    });

    if (!data || !data.order) {
      return res.status(500).json({ error: "Order failed at provider" });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Order failed" });
  }
});

/* CHECK ORDER STATUS */
router.post("/status", auth, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId" });
    }

    const data = await smmRequest({
      action: "status",
      order: orderId
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Status check failed" });
  }
});

module.exports = router;
