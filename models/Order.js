const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  userId: String,
  serviceId: String,
  link: String,
  quantity: Number,
  providerOrderId: String,
  status: {
    type: String,
    default: "pending"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Order", orderSchema);
