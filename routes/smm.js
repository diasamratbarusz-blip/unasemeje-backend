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
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

/* PLACE ORDER */
router.post("/order", auth, async (req, res) => {
  try {
    const { service, link, quantity } = req.body;

    const data = await smmRequest({
      action: "add",
      service,
      link,
      quantity
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Order failed" });
  }
});

/* CHECK ORDER STATUS */
router.post("/status", auth, async (req, res) => {
  try {
    const { orderId } = req.body;

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
