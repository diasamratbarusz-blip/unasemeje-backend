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
    /**
     * Primary field for the transaction code (e.g., QRL71ABCDE).
     * This is what the automated funding engine checks against.
     */
    transactionCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
      uppercase: true
    },

    /**
     * FIX FOR E11000 INDEX ERROR:
     * This field is maintained to mirror 'transactionCode'.
     * By keeping both, we prevent crashes from old legacy data indexes.
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
      /**
       * UPDATED: Fully accommodates status names across endpoints 
       * to allow direct funding from the Paynecta Webhook seamlessly.
       */
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
      /**
       * UPDATED: Includes manual_verification to ensure full compatibility 
       * with the strings submitted by your explicit server.js routes.
       */
      enum: ["mpesa", "manual", "stk", "manual_verification"],
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
 * This prevents null conflicts on unique indexes and ensures instant funding 
 * logic works regardless of which field the gateway sends.
 */
depositSchema.pre("save", function (next) {
  // Synchronize the two transaction code fields
  if (this.transactionCode && !this.code) {
    this.code = this.transactionCode;
  } else if (this.code && !this.transactionCode) {
    this.transactionCode = this.code;
  }
  
  // Set default message for STK/Webhook payments if not present
  if (!this.message) {
    if (this.source === "stk") {
      this.message = `Automated STK Deposit of KES ${this.amount} for user ${this.userEmail}`;
    } else if (this.source === "manual_verification") {
      this.message = `Manual verification request logged for KES ${this.amount} | TRX: ${this.transactionCode}`;
    }
  }
  
  // Auto-set approvedAt if status is set to completed or approved
  if ((this.status === "completed" || this.status === "approved") && !this.approvedAt) {
    this.approvedAt = new Date();
  }
  
  next();
});

module.exports = mongoose.model("Deposit", depositSchema);
