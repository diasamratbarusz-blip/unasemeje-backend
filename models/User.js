const mongoose = require("mongoose");

/**
 * =========================
 * USER SCHEMA (SMM PANEL)
 * =========================
 * Supports authentication, balance system,
 * admin roles, and future payment scaling
 */

const UserSchema = new mongoose.Schema(
  {
    /* ================= BASIC INFO ================= */
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },

    password: {
      type: String,
      required: true
    },

    phone: {
      type: String,
      default: null,
      trim: true
    },

    /* ================= ACCOUNT BALANCE ================= */
    balance: {
      type: Number,
      default: 0,
      min: 0
    },

    /* ================= USER ROLE ================= */
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },

    /* ================= ACCOUNT STATUS ================= */
    status: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active"
    },

    /* ================= SECURITY ================= */
    isVerified: {
      type: Boolean,
      default: false
    },

    lastLogin: {
      type: Date,
      default: null
    },

    /* ================= REFERRAL SYSTEM (OPTIONAL FUTURE) ================= */
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    referralCode: {
      type: String,
      unique: true,
      sparse: true
    },

    referralEarnings: {
      type: Number,
      default: 0
    },

    /* ================= API / PANEL ACCESS ================= */
    apiKey: {
      type: String,
      default: null
    }

  },
  {
    timestamps: true
  }
);

/* ================= INDEXING ================= */
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });
UserSchema.index({ role: 1 });

module.exports = mongoose.model("User", UserSchema);
