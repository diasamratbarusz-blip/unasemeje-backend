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
      index: true,
      trim: true
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
      // unique: false is explicit here to allow multiple orders for the same URL
      unique: false 
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
      uppercase: true,
      trim: true
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
      index: true,
      uppercase: true
    },

    // This stores the external ID returned by the provider (SMM Africa order ID)
    orderId: {
      type: String,
      default: null,
      index: true,
      trim: true
    },

    /* ================= STATUS ================= */
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "processing", "inprogress", "completed", "partial", "canceled", "refunded"],
      lowercase: true,
      index: true,
      trim: true
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
    // Automatically adds 'createdAt' (Order Date) and 'updatedAt' fields
    timestamps: true 
  }
);

/* ================= INDEXING ================= */
// Optimized for the 'Orders' page which sorts by newest first for specific users
OrderSchema.index({ userId: 1, createdAt: -1 });

// Ensure the link field is explicitly non-unique at the index level
OrderSchema.path('link').index({ unique: false });

/* ================= MIDDLEWARE ================= */
/**
 * Pre-save hook to ensure currency values are rounded to 2 or 4 decimal places
 * to avoid floating point math issues in the database.
 */
OrderSchema.pre("save", function (next) {
  if (this.cost) {
    this.cost = Math.round(this.cost * 100) / 100; // Round to 2 decimals for KES
  }
  if (this.providerCharge) {
    this.providerCharge = Math.round(this.providerCharge * 10000) / 10000; // Round to 4 decimals for USD provider rates
  }
  next();
});

module.exports = mongoose.model("Order", OrderSchema);
