const mongoose = require("mongoose");
const crypto = require("crypto");

/**
 * =========================================
 * USER SCHEMA (unasemeje ø dia SMM PANEL)
 * =========================================
 * Handles:
 * - Authentication (Username, Email, Phone)
 * - Balance system (KES/USD compatible)
 * - Admin role & Security status
 * - API key system for resellers
 * - Referral system (Hex-based tracking)
 */

function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex");
}

const UserSchema = new mongoose.Schema(
  {
    /* ================= AUTHENTICATION INFO ================= */
    
    /** 
     * NEW: Username support for 'unasemeje ø dia' branding. 
     * 'sparse: true' ensures compatibility with legacy records if necessary.
     */
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true
    },

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

    /** 
     * Phone is required for M-Pesa STK Push integrations 
     * common in the Kenyan regional market.
     */
    phone: {
      type: String,
      required: true, 
      unique: true,
      trim: true,
      index: true
    },

    /* ================= FINANCIAL DATA ================= */
    balance: {
      type: Number,
      default: 0,
      min: 0
    },

    /* ================= ROLE & SECURITY ================= */
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

    /* ================= REFERRAL SYSTEM ================= */

    // Unique hex code assigned to each user upon creation
    referralCode: {
      type: String,
      unique: true,
      default: generateReferralCode,
      index: true
    },

    // Stores the referral code of the inviter
    referredBy: {
      type: String,
      default: null
    },

    // Total accumulated commission from referrals
    referralEarnings: {
      type: Number,
      default: 0
    },

    /* ================= BUSINESS STATS ================= */
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
    // Automatically creates 'createdAt' and 'updatedAt' fields
    timestamps: true
  }
);

/* ================= DATABASE INDEXING ================= */
/**
 * Optimized for high-speed lookups during login (identifier check) 
 * and referral tracking.
 */
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ referralCode: 1 });

module.exports = mongoose.model("User", UserSchema);
