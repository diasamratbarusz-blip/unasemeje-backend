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
      trim: true,
      unique: false // CRITICAL: Ensures users can order for the same link multiple times
    },

    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"]
    },

    /* ================= PRICING ================= */
    cost: {
      type: Number, // What the customer paid you in KES
      required: true,
      default: 0
    },

    currency: {
      type: String,
      default: "KES",
      uppercase: true
    },

    providerCharge: {
      type: Number, // What the provider charged you (useful for SMM Africa USD tracking)
      default: 0
    },

    /* ================= PROVIDER SYNC ================= */
    // Identifies which API credentials to use (PROVIDER1 or PROVIDER2)
    provider: {
      type: String,
      default: "PROVIDER1",
      enum: ["PROVIDER1", "PROVIDER2"],
      index: true
    },

    // This stores the external ID returned by the provider (SMM Africa order ID)
    orderId: {
      type: String,
      default: null,
      index: true
    },

    /* ================= STATUS ================= */
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "processing", "inprogress", "completed", "partial", "canceled", "refunded"],
      lowercase: true,
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

// We remove any unique index requirements for link at the database level
OrderSchema.path('link').index({ unique: false });

module.exports = mongoose.model("Order", OrderSchema);
