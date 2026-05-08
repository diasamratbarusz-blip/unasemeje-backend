const mongoose = require("mongoose");
const crypto = require("crypto");

/**
 * =========================================
 * USER SCHEMA (unasemeje ø dia SMM PANEL)
 * =========================================
 * Updated for high-security admin verification.
 */

// Function to generate a unique 8-character referral code
function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex");
}

const UserSchema = new mongoose.Schema(
  {
    /* ================= AUTHENTICATION INFO ================= */
    
    /** 
     * Username support for branding and unique identification.
     */
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true
    },

    /**
     * Email is the primary identifier. 
     * ADMIN: diasamratbarusz@gmail.com
     */
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },

    password: {
      type: String,
      required: [true, "Password is required"]
    },

    /** 
     * Phone required for M-Pesa STK Push. 
     * ADMIN: 0715509440
     */
    phone: {
      type: String,
      required: [true, "Phone number is required"], 
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
    /**
     * Role determines frontend and backend access.
     * The value 'admin' enables the visible controls in the app.
     */
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
    referralCode: {
      type: String,
      unique: true,
      default: generateReferralCode,
      index: true
    },

    referredBy: {
      type: String,
      default: null
    },

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
    timestamps: true
  }
);

/* ================= DATABASE INDEXING ================= */
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ referralCode: 1 });

/* ================= MIDDLEWARE ================= */
/**
 * Pre-save logic to ensure phone numbers are clean for M-Pesa 
 * and specific accounts are assigned admin roles.
 */
UserSchema.pre("save", function (next) {
  // Clean phone number formatting
  if (this.phone) {
    this.phone = this.phone.replace(/\s+/g, '');
  }

  // Automatic Admin Assignment based on your credentials
  const ADMIN_EMAIL = "diasamratbarusz@gmail.com";
  const ADMIN_PHONE = "0715509440";

  if (this.email === ADMIN_EMAIL || this.phone === ADMIN_PHONE) {
    this.role = "admin";
  }

  next();
});

module.exports = mongoose.model("User", UserSchema);
