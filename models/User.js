const mongoose = require("mongoose");
const crypto = require("crypto");

/**
 * =========================
 * USER SCHEMA (SMM PANEL)
 * =========================
 * Handles:
 * - Authentication
 * - Balance system
 * - Admin role
 * - API key system
 * - Referral system (FIXED)
 */

function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex");
}

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

    /* ================= BALANCE ================= */
    balance: {
      type: Number,
      default: 0,
      min: 0
    },

    /* ================= ROLE SYSTEM ================= */
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },

    status: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active"
    },

    isVerified: {
      type: Boolean,
      default: false
    },

    lastLogin: {
      type: Date,
      default: null
    },

    /* ================= API SYSTEM ================= */
    apiKey: {
      type: String,
      default: null
    },

    /* ================= REFERRAL SYSTEM (FIXED) ================= */

    // Unique referral code for each user
    referralCode: {
      type: String,
      unique: true,
      default: generateReferralCode,
      index: true
    },

    // IMPORTANT: must be STRING code (NOT ObjectId)
    referredBy: {
      type: String,
      default: null
    },

    // earnings from referrals
    referralEarnings: {
      type: Number,
      default: 0
    },

    /* ================= OPTIONAL STATS ================= */
    totalOrders: {
      type: Number,
      default: 0
    },

    totalSpent: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

/* ================= INDEXES ================= */
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ referralCode: 1 });

module.exports = mongoose.model("User", UserSchema);
