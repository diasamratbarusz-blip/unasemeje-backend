const mongoose = require("mongoose");

/**
 * =========================
 * ORDER MODEL (SMM PANEL)
 * =========================
 * This model stores all details for social media orders.
 * It is designed to match the server.js order placement logic 
 * and the frontend dashboard table columns.
 */

const OrderSchema = new mongoose.Schema(
  {
    /* ================= USER RELATIONSHIP ================= */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Order must belong to a user"],
      index: true
    },

    /* ================= SERVICE INFO ================= */
    serviceId: {
      type: String, 
      required: [true, "Service ID is required"],
      index: true
    },

    serviceName: {
      type: String,
      default: "SMM Service",
      trim: true
    },

    /* ================= ORDER DETAILS ================= */
    link: {
      type: String,
      required: [true, "Target link (URL) is required"],
      trim: true
    },

    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"]
    },

    /* ================= PRICING ================= */
    cost: {
      type: Number,
      required: true,
      default: 0
    },

    currency: {
      type: String,
      default: "KES",
      uppercase: true
    },

    /* ================= PROVIDER SYNC ================= */
    // This MUST be 'orderId' to match server.js providerRes.data.order
    orderId: {
      type: String,
      default: null,
      index: true
    },

    /* ================= STATUS ================= */
    status: {
      type: String,
      default: "pending",
      index: true
    },

    /* ================= TRACKING ================= */
    startCount: {
      type: Number,
      default: 0
    },

    remains: {
      type: Number,
      default: 0
    }
  },
  {
    // Automatically adds 'createdAt' and 'updatedAt' fields
    timestamps: true 
  }
);

/* ================= INDEXING ================= */
// Optimized for the 'Orders' page which sorts by newest first
OrderSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Order", OrderSchema);
