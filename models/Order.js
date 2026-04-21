const mongoose = require("mongoose");

/**
 * =========================
 * ORDER MODEL (SMM PANEL)
 * =========================
 * Tracks user orders, manages pricing calculations,
 * and maintains status history for full traceability.
 */

const OrderSchema = new mongoose.Schema(
  {
    /* ================= USER ================= */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Order must belong to a user"],
      index: true
    },

    /* ================= SERVICE ================= */
    serviceId: {
      type: String, // String to match provider-side IDs
      required: [true, "Service ID is required"],
      index: true
    },

    serviceName: {
      type: String,
      default: "Unknown Service",
      trim: true
    },

    /* ================= ORDER DETAILS ================= */
    link: {
      type: String,
      required: [true, "Target link (URL) is required"],
      trim: true,
      lowercase: true
    },

    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"]
    },

    /* ================= PRICING ================= */
    rate: {
      type: Number,
      required: [true, "Rate per 1000 is required"],
      default: 0
    },

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

    /* ================= PROVIDER INFO ================= */
    providerOrderId: {
      type: String,
      default: null,
      index: true
    },

    providerResponse: {
      type: mongoose.Schema.Types.Mixed, // Stores raw response for debugging
      default: null
    },

    /* ================= STATUS ================= */
    status: {
      type: String,
      enum: {
        values: [
          "pending",
          "processing",
          "in_progress",
          "completed",
          "partial",
          "canceled",
          "failed"
        ],
        message: "{VALUE} is not a valid status"
      },
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
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

/* ================= MIDDLEWARE ================= */

// Automatically calculate cost before saving
// Formula: (Rate / 1000) * Quantity
OrderSchema.pre("save", function (next) {
  if (this.isModified("rate") || this.isModified("quantity")) {
    this.cost = (this.rate / 1000) * this.quantity;
  }
  next();
});

/* ================= INDEXING ================= */
OrderSchema.index({ userId: 1, createdAt: -1 }); // Faster history lookup
OrderSchema.index({ status: 1 });

module.exports = mongoose.model("Order", OrderSchema);
