const mongoose = require("mongoose");

/**
 * =========================
 * SERVICE MODEL (UNASEMEJE ø DIA)
 * =========================
 * Stores services from provider + markup pricing.
 * Supports filtering, grouping, and fast dashboard loading.
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

    // 🔴 ORIGINAL PROVIDER PRICE (AS FETCHED FROM API)
    originalRate: {
      type: Number,
      default: 0
    },

    // 🟡 BASE RATE (PROVIDER RATE USED INTERNALLY)
    rate: {
      type: Number,
      required: true,
      default: 0
    },

    // 🟢 FINAL SELLING PRICE (AFTER UNASEMEJE ø DIA MARKUP)
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
      default: "PROVIDER1"
    }

  },
  {
    timestamps: true
  }
);

/* ================= INDEXING FOR SPEED ================= */
ServiceSchema.index({ platform: 1, status: 1 });
ServiceSchema.index({ category: 1 });

/* ================= AUTO PRICE CALCULATION ================= */
/**
 * logic:
 * - sellingRate is ALWAYS updated
 * - markup is applied based on service type
 */

function applyMarkup(service) {
  const name = (service.name || "").toLowerCase();

  let markup = 40; // Default flat markup in KES

  if (name.includes("like")) markup = 30; //
  else if (name.includes("follower")) markup = 25; // Updated to match business logic
  else if (name.includes("view")) markup = 35; // Updated to match business logic
  else if (name.includes("save")) markup = 40;

  return Number(service.rate || 0) + markup;
}

/* ================= BEFORE SAVE HOOK ================= */
ServiceSchema.pre("save", function (next) {
  try {
    // Keep original rate safe
    if (!this.originalRate) {
      this.originalRate = this.rate;
    }

    // Apply markup
    this.sellingRate = applyMarkup(this);

    next();
  } catch (err) {
    next(err);
  }
});

/* ================= BEFORE UPDATE HOOK ================= */
ServiceSchema.pre("findOneAndUpdate", function (next) {
  try {
    const update = this.getUpdate();

    if (update.rate || update.name) {
      const name = update.name || "";
      const rate = update.rate || 0;

      let markup = 40;
      const n = name.toLowerCase();

      if (n.includes("like")) markup = 30; //
      else if (n.includes("follower")) markup = 25; //
      else if (n.includes("view")) markup = 35; //
      else if (n.includes("save")) markup = 40;

      update.sellingRate = rate + markup;
      update.originalRate = rate;
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("Service", ServiceSchema);
