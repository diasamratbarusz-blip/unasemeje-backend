const mongoose = require("mongoose");

/**
 * =========================
 * ORDER MODEL (SMM PANEL)
 * =========================
 * Tracks user orders sent to provider
 * Includes cost, status, and full traceability
 */

const OrderSchema = new mongoose.Schema(
  {
    /* ================= USER ================= */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    /* ================= SERVICE ================= */
    serviceId: {
      type: String,
      required: true,
      index: true
    },

    serviceName: {
      type: String,
      default: "Unknown Service"
    },

    /* ================= ORDER DETAILS ================= */
    link: {
      type: String,
      required: true,
      trim: true
    },

    quantity: {
      type: Number,
      required: true,
      min: 1
    },

    /* ================= PRICING ================= */
    rate: {
      type: Number,
      default: 0
    },

    cost: {
      type: Number,
      default: 0
    },

    currency: {
      type: String,
      default: "KES"
    },

    /* ================= PROVIDER INFO ================= */
    providerOrderId: {
      type: String,
      default: null,
      index: true
    },

    provider: {
      type: String,
      default: "default"
    },

    /* ================= STATUS ================= */
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "in_progress",
        "completed",
        "partial",
        "canceled",
        "failed"
      ],
      default: "pending",
      index: true
    },

    /* ================= META ================= */
    note: {
      type: String,
      default: null
    }

  },
  {
    timestamps: true
  }
);

/* ================= INDEXING ================= */
OrderSchema.index({ userId: 1, status: 1 });
OrderSchema.index({ providerOrderId: 1 });

module.exports = mongoose.model("Order", OrderSchema);
