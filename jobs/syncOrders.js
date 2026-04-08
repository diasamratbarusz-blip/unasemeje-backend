const cron = require("node-cron");
const smmRequest = require("../utils/smmApi");
const Order = require("../models/Order");

cron.schedule("*/5 * * * *", async () => {
  console.log("Running auto order sync...");

  try {
    const orders = await Order.find({ status: "processing" });

    for (let order of orders) {
      if (!order.smmOrderId) continue;

      const data = await smmRequest({
        action: "status",
        order: order.smmOrderId
      });

      if (data.status) {
        order.status = data.status;
        await order.save();
      }
    }

    console.log("Order sync completed");
  } catch (err) {
    console.error("Sync error:", err.message);
  }
});
