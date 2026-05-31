const mongoose = require("mongoose");

/**
 * =========================
 * DEPOSIT SCHEMA (SMM PANEL)
 * =========================
 * Tracks M-Pesa / manual deposits
 * Supports admin approval + fraud prevention
 */

const depositSchema = new mongoose.Schema(
  {
    /* ================= USER ================= */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    userEmail: {
      type: String,
      default: "Unknown"
    },

    /* ================= PAYMENT INFO ================= */
    phone: {
      type: String,
      required: true,
      trim: true
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    /* ================= M-PESA TRANSACTION ================= */
    // Primary field for the transaction code (e.g., QRL71ABCDE)
    transactionCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
      uppercase: true
    },

    /**
     * FIX FOR E11000 ERROR:
     * This 'code' field is maintained to match existing database indexes.
     * The pre-save hook below ensures it mirrors transactionCode.
     */
    code: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
      uppercase: true
    },

    /* ================= FULL RAW MESSAGE ================= */
    message: {
      type: String,
      default: "No raw message provided"
    },

    /* ================= STATUS ================= */
    status: {
      type: String,
      // UPDATED: Added "completed" to match the Webhook logic in server.js
      enum: ["pending", "approved", "rejected", "failed", "completed"],
      default: "pending",
      index: true
    },

    /* ================= ADMIN CONTROL ================= */
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    approvedAt: {
      type: Date,
      default: null
    },

    /* ================= FRAUD / DUPLICATE FLAGS ================= */
    flagged: {
      type: Boolean,
      default: false
    },

    flagReason: {
      type: String,
      default: null
    },

    /* ================= SOURCE ================= */
    source: {
      type: String,
      enum: ["mpesa", "manual", "stk"],
      default: "manual"
    }

  },
  {
    timestamps: true
  }
);

/* ================= INDEXING ================= */
// Composite index for fast user-specific history lookups
depositSchema.index({ userId: 1, createdAt: -1 });

/* ================= MIDDLEWARE ================= */
/**
 * Pre-save hook to ensure 'code' and 'transactionCode' are always identical.
 * This prevents null conflicts on unique indexes and ensures instant funding logic works.
 */
depositSchema.pre("save", function (next) {
  // Synchronize the two transaction code fields
  if (this.transactionCode && !this.code) {
    this.code = this.transactionCode;
  } else if (this.code && !this.transactionCode) {
    this.transactionCode = this.code;
  }
  
  // Set default message for STK/Webhook payments if not present
  if (!this.message && this.source === "stk") {
    this.message = `STK Deposit of ${this.amount} via ${this.phone}`;
  }
  
  next();
});

module.exports = mongoose.model("Deposit", depositSchema);
