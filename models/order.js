const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  service: String,
  link: String,
  quantity: Number,
  providerOrderId: String,
  status: { type: String, default: "pending" }
});

module.exports = mongoose.model("Order", orderSchema);
