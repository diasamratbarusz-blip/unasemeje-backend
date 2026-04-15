const mongoose = require("mongoose");

const ServiceSchema = new mongoose.Schema(
  {
    // ================= PROVIDER INFO =================
    serviceId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    category: {
      type: String,
      required: true,
      index: true
    },

    // ================= PROVIDER PRICING =================
    rate: {
      type: Number,
      required: true,
      min: 0
    },

    // ================= YOUR PRICING SYSTEM =================
    profitMargin: {
      type: Number,
      default: 1.5
      // Example:
      // 1.5 = 50% profit
      // 2 = 100% profit
    },

    sellingRate: {
      type: Number,
      default: 0
      // AUTO CALCULATED: rate * profitMargin
    },

    // ================= LIMITS =================
    min: {
      type: Number,
      default: 1
    },

    max: {
      type: Number,
      default: 1000000
    },

    // ================= SERVICE CLASSIFICATION =================
    platform: {
      type: String,
      default: "Other",
      index: true
      // Instagram / TikTok / YouTube etc
    },

    quality: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium"
    },

    // ================= STATUS CONTROL =================
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active"
    }

  },
  { timestamps: true }
);

module.exports = mongoose.model("Service", ServiceSchema);
