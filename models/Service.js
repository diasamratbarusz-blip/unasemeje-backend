const mongoose = require("mongoose");

/**
 * =========================
 * SERVICE MODEL (SMM PANEL)
 * =========================
 * Stores services from provider + markup pricing
 * Supports filtering, grouping, and fast dashboard loading
 */

const ServiceSchema = new mongoose.Schema(
  {
    /* ================= PROVIDER SERVICE ID ================= */
    serviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },

    /* ================= BASIC INFO ================= */
    name: {
      type: String,
      required: true,
      trim: true,
      default: "Unnamed Service",
      index: true
    },

    category: {
      type: String,
      default: "Other",
      index: true
    },

    /* ================= PRICING ================= */
    rate: {
      type: Number,
      required: true,
      default: 0
    },

    sellingRate: {
      type: Number,
      default: 0
    },

    currency: {
      type: String,
      enum: ["USD", "KES", "EUR", "OTHER"],
      default: "KES"
    },

    /* ================= LIMITS ================= */
    min: {
      type: Number,
      default: 1
    },

    max: {
      type: Number,
      default: 1000000
    },

    /* ================= PLATFORM DETECTION ================= */
    platform: {
      type: String,
      default: "Other",
      index: true
    },

    /* ================= STATUS CONTROL ================= */
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true
    },

    /* ================= PROVIDER META ================= */
    provider: {
      type: String,
      default: "default"
    },

    originalRate: {
      type: Number,
      default: 0
    }

  },
  {
    timestamps: true
  }
);

/* ================= INDEXING FOR SPEED ================= */
ServiceSchema.index({ platform: 1, status: 1 });
ServiceSchema.index({ category: 1 });

module.exports = mongoose.model("Service", ServiceSchema);
