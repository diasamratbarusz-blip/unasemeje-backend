const mongoose = require("mongoose");

const ServiceSchema = new mongoose.Schema(
  {
    // Provider service ID
    serviceId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // Service name (e.g. Instagram Followers)
    name: {
      type: String,
      required: true,
      trim: true
    },

    // Raw category from provider
    category: {
      type: String,
      required: true,
      index: true
    },

    // Base price from provider
    rate: {
      type: Number,
      required: true,
      min: 0
    },

    // Minimum order
    min: {
      type: Number,
      default: 1
    },

    // Maximum order
    max: {
      type: Number,
      default: 1000000
    },

    // 🧠 PLATFORM (auto-classified later)
    platform: {
      type: String,
      default: "Other",
      index: true
    },

    // 💰 SELLING PRICE (your profit added)
    sellingRate: {
      type: Number,
      default: 0
    },

    // 🟢 ACTIVE / DISABLED SERVICE
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active"
    },

    // ⚡ SERVICE QUALITY FLAG (optional use)
    quality: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Service", ServiceSchema);
