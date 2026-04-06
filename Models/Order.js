const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  userId: String,
  service: String,
  link: String,
  quantity: Number,
  status: { type: String, default: "processing" }
});

module.exports = mongoose.model("Order", OrderSchema);
