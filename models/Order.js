const mongoose = require("mongoose");

/**
 * =========================================
 * ORDER MODEL (UNASEMEJE ø DIA)
 * =========================================
 * This model stores all details for social media orders.
 * Specifically updated to ALLOW multiple orders on the same link.
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
      // unique: false ensures a user can order for the same link multiple times
      unique: false 
    },

    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"]
    },

    /* ================= PRICING (CUSTOMER) ================= */
    cost: {
      type: Number, // Amount charged in KES
      required: [true, "Cost calculation is required"],
      default: 0
    },

    userCurrency: {
      type: String,
      default: "KES",
      uppercase: true,
      trim: true
    },

    /* ================= PROVIDER DATA (PROFIT TRACKING) ================= */
    /**
     * providerCharge stores the actual cost from the API (e.g., Delixgains).
     * This allows you to calculate total profit (cost - providerCharge).
     */
    providerCharge: {
      type: Number, 
      default: 0
    },

    providerCurrency: {
      type: String,
      default: "USD",
      uppercase: true
    },

    provider: {
      type: String,
      default: "DELIXGAINS", // Synced with your current provider
      uppercase: true,
      index: true
    },

    // The unique ID returned by the external API (Critical for syncing)
    orderId: {
      type: String,
      required: [true, "Provider Order ID is required"],
      index: true,
      trim: true
    },

    /* ================= STATUS & TRACKING ================= */
    status: {
      type: String,
      default: "pending",
      lowercase: true,
      index: true,
      trim: true
      /**
       * Common statuses: pending, inprogress, completed, partial, canceled
       */
    },

    // Starting count of likes/followers when order was placed
    startCount: {
      type: Number,
      default: 0
    },

    // Number of units remaining to be delivered
    remains: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true 
  }
);

/* ================= INDEXING ================= */
/**
 * Optimized for the "My Orders" page to show the latest history instantly.
 */
OrderSchema.index({ userId: 1, createdAt: -1 });

/**
 * Optimized for the background sync engine to quickly find active orders.
 */
OrderSchema.index({ status: 1 });

/* ================= MIDDLEWARE ================= */
/**
 * Pre-save logic to ensure data integrity and proper rounding.
 */
OrderSchema.pre("save", function (next) {
  // Round customer KES cost to 2 decimal places for billing clarity
  if (typeof this.cost === 'number' && !isNaN(this.cost)) {
    this.cost = Math.round(this.cost * 100) / 100; 
  }

  // Round provider charge for precision in profit analysis
  if (typeof this.providerCharge === 'number' && !isNaN(this.providerCharge)) {
    this.providerCharge = Math.round(this.providerCharge * 100000) / 100000; 
  }

  // Safety checks for numerical values
  if (this.remains < 0 || isNaN(this.remains)) this.remains = 0;
  if (this.startCount < 0 || isNaN(this.startCount)) this.startCount = 0;

  next();
});

module.exports = mongoose.model("Order", OrderSchema);
