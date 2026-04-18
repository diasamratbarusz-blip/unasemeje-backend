const mongoose = require("mongoose");

const depositSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  phone: String,
  amount: Number,

  transactionCode: {
    type: String,
    unique: true,
    required: true
  },

  message: String, // FULL M-PESA MESSAGE pasted by user

  status: {
    type: String,
    default: "pending"
  }

}, { timestamps: true });

module.exports = mongoose.model("Deposit", depositSchema);
