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
      required: [true, "Cost calculation is required"],
      default: 0
    },

    currency: {
      type: String,
      default: "KES",
      uppercase: true,
      trim: true
    },

    providerCharge: {
      type: Number, // What the provider charged you (useful for tracking)
      default: 0
    },

    /* ================= PROVIDER SYNC ================= */
    // Identifies which API credentials to use
    provider: {
      type: String,
      default: "PROVIDER1",
      enum: ["PROVIDER1", "PROVIDER2"],
      index: true,
      uppercase: true
    },

    // This stores the external ID returned by the provider API
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
    // Automatically adds 'createdAt' and 'updatedAt' fields
    timestamps: true 
  }
);

/* ================= INDEXING ================= */
// Optimized for the 'Orders' page which sorts by newest first
OrderSchema.index({ userId: 1, createdAt: -1 });

// Ensure the link field is explicitly non-unique at the index level
OrderSchema.path('link').index({ unique: false });

/* ================= MIDDLEWARE ================= */
/**
 * Pre-save hook to ensure currency values are rounded correctly.
 * Added check for 'this.cost' and 'this.providerCharge' to prevent 
 * internal errors if values are missing during initial save.
 */
OrderSchema.pre("save", function (next) {
  if (this.cost !== undefined && this.cost !== null) {
    this.cost = Math.round(this.cost * 100) / 100; // Round to 2 decimals for KES
  } else {
    this.cost = 0;
  }
  
  if (this.providerCharge !== undefined && this.providerCharge !== null) {
    this.providerCharge = Math.round(this.providerCharge * 10000) / 10000; // Round to 4 decimals
  } else {
    this.providerCharge = 0;
  }
  next();
});

module.exports = mongoose.model("Order", OrderSchema);
