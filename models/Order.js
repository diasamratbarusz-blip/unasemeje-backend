const mongoose = require("mongoose");

/**
 * =========================================
 * ORDER MODEL (UNASEMEJE ø DIA)
 * =========================================
 * This model stores all details for social media orders.
 * Integrated with Delixgains API response structure.
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

    /* ================= PRICING (CUSTOMER) ================= */
    cost: {
      type: Number, // Amount charged to the Kenyan user in KES
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
    // "charge" from Delixgains API (usually what you paid in USD)
    providerCharge: {
      type: Number, 
      default: 0
    },

    // "currency" from Delixgains API (usually USD)
    providerCurrency: {
      type: String,
      default: "USD",
      uppercase: true
    },

    // Identifies provider (Delixgains = PROVIDER1)
    provider: {
      type: String,
      default: "PROVIDER1",
      uppercase: true,
      index: true
    },

    // The "order" ID returned by Delixgains
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
    },

    // "start_count" from Provider
    startCount: {
      type: Number,
      default: 0
    },

    // "remains" from Provider
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
// Optimized for Dashboard: Shows newest orders first for a specific user
OrderSchema.index({ userId: 1, createdAt: -1 });

/* ================= MIDDLEWARE ================= */
/**
 * Pre-save logic to ensure data integrity and rounding.
 */
OrderSchema.pre("save", function (next) {
  // Round customer KES cost to 2 decimals
  if (typeof this.cost === 'number' && !isNaN(this.cost)) {
    this.cost = Math.round(this.cost * 100) / 100; 
  }

  // Round provider USD charge to 5 decimals (e.g., 0.27819)
  if (typeof this.providerCharge === 'number' && !isNaN(this.providerCharge)) {
    this.providerCharge = Math.round(this.providerCharge * 100000) / 100000; 
  }

  // Prevent negative tracking values
  if (this.remains < 0 || isNaN(this.remains)) this.remains = 0;
  if (this.startCount < 0 || isNaN(this.startCount)) this.startCount = 0;

  next();
});

module.exports = mongoose.model("Order", OrderSchema);
