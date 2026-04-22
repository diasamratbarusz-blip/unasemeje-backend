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
    // This is the primary field for the transaction code
    transactionCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },

    /**
     * FIX FOR E11000 ERROR:
     * Added 'code' field to match the existing database index 
     * causing the "dup key: { code: null }" error.
     */
    code: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },

    /* ================= FULL RAW MESSAGE ================= */
    message: {
      type: String,
      required: true
    },

    /* ================= STATUS ================= */
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "failed"],
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
depositSchema.index({ userId: 1, createdAt: -1 });
// Ensure both potential fields are indexed for fast searching
depositSchema.index({ transactionCode: 1 });
depositSchema.index({ code: 1 });

module.exports = mongoose.model("Deposit", depositSchema);
