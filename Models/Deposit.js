const mongoose = require("mongoose");

const DepositSchema = new mongoose.Schema({
  userId: String,
  phone: String,
  amount: Number,
  status: { type: String, default: "pending" }
});

module.exports = mongoose.model("Deposit", DepositSchema);
