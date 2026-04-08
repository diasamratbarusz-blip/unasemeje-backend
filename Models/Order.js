const smmRequest = require("../utils/smmApi");
const Order = require("../models/Order");

router.post("/order", auth, async (req, res) => {
  try {
    const { service, link, quantity } = req.body;

    const response = await smmRequest({
      action: "add",
      service,
      link,
      quantity
    });

    const order = new Order({
      userId: req.user.id,
      service,
      link,
      quantity,
      smmOrderId: response.order, // save API order ID
      status: "processing"
    });

    await order.save();

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: "Order failed" });
  }
});
