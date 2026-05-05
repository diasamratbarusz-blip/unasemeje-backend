const mongoose = require("mongoose");

/**
 * =========================
 * ORDER MODEL (UNASEMEJE ø DIA)
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
      type: Number, // What the provider charged you in USD/Base
      default: 0
    },

    /* ================= PROVIDER SYNC ================= */
    // Identifies which API credentials to use (Delixgains or SMM Africa)
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
      // Note: Enum is removed here to prevent "Validation Error" when 
      // providers send non-standard status strings like "queued" or "processing"
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

/* ================= MIDDLEWARE ================= */
/**
 * Pre-save hook to ensure currency values are rounded correctly.
 * Rounds KES to 2 decimals and Provider charges to 5 decimals.
 */
OrderSchema.pre("save", function (next) {
  if (this.cost !== undefined && this.cost !== null) {
    this.cost = Math.round(this.cost * 100) / 100; 
  } else {
    this.cost = 0;
  }
  
  if (this.providerCharge !== undefined && this.providerCharge !== null) {
    this.providerCharge = Math.round(this.providerCharge * 100000) / 100000; 
  } else {
    this.providerCharge = 0;
  }
  next();
});

module.exports = mongoose.model("Order", OrderSchema);
