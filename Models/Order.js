const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    service: {
      type: String,
      required: true
    },

    link: {
      type: String,
      required: true
    },

    quantity: {
      type: Number,
      required: true,
      min: 1
    },

    smmOrderId: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["pending", "processing", "completed", "partial", "canceled"],
      default: "processing"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);
