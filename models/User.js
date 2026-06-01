const mongoose = require("mongoose");
const crypto = require("crypto");

/**
 * =========================================
 * USER SCHEMA (unasemeje ø dia SMM PANEL)
 * =========================================
 * Updated for high-security admin verification and 
 * automated payment profile synchronization.
 */

// Function to generate a unique 8-character referral code
function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex");
}

const UserSchema = new mongoose.Schema(
  {
    /* ================= AUTHENTICATION INFO ================= */
    
    /** * Username support for branding and unique identification.
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
     * Profile structure updates to match metadata transmission synchronization
     */
    firstName: {
      type: String,
      default: null,
      trim: true
    },

    lastName: {
      type: String,
      default: null,
      trim: true
    },

    /**
     * Email is the primary identifier.
     * STATED OWNER: diasamratbarusz@gmail.com
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

    /** * Phone required for Kenyan mobile payment triggers (M-Pesa).
     * STATED OWNER: 0715509440
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

    /* ================= DETECTED PAYMENT PROFILE ================= */
    /**
     * Fields used for the 'Add Funds' identity verification module.
     * This securely bridges incoming gateway webhooks to user accounts.
     */
    paymentProfileName: {
      type: String,
      default: null,
      trim: true
    },

    paymentProfileEmail: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
      index: true
    },

    /**
     * Authorized M-PESA Funding Numbers
     * These allow the system to recognize which user is paying via the webhook.
     */
    paymentPhone1: {
      type: String,
      default: null,
      trim: true,
      index: true
    },

    paymentPhone2: {
      type: String,
      default: null,
      trim: true,
      index: true
    },

    paymentPhone3: {
      type: String,
      default: null,
      trim: true,
      index: true
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
    /**
     * 10% Referral bonus system implementation.
     */
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
// Optimized indexing for fast lookup during high-traffic SMM operations
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ referralCode: 1 });

// Fast-lookup indexing for automated payment webhook verification
UserSchema.index({ paymentProfileEmail: 1 });
UserSchema.index({ paymentPhone1: 1 });
UserSchema.index({ paymentPhone2: 1 });
UserSchema.index({ paymentPhone3: 1 });

/* ================= MIDDLEWARE ================= */
/**
 * Pre-save logic to ensure phone numbers are clean for payment processing
 * and your specific credentials are automatically granted Admin status.
 */
UserSchema.pre("save", function (next) {
  // Clean phone number formatting by removing spaces and special characters
  if (this.phone) {
    this.phone = this.phone.replace(/[\s+-]/g, '');
  }

  // Clean the dedicated automated funding numbers as well
  if (this.paymentPhone1) this.paymentPhone1 = this.paymentPhone1.replace(/[\s+-]/g, '');
  if (this.paymentPhone2) this.paymentPhone2 = this.paymentPhone2.replace(/[\s+-]/g, '');
  if (this.paymentPhone3) this.paymentPhone3 = this.paymentPhone3.replace(/[\s+-]/g, '');

  // FORCE ADMIN LOCK: Automatically assigns 'admin' role to your specific credentials
  const ADMIN_EMAIL = "diasamratbarusz@gmail.com";
  const ADMIN_PHONE = "0715509440";

  if (this.email === ADMIN_EMAIL || this.phone === ADMIN_PHONE) {
    this.role = "admin";
  }

  next();
});

module.exports = mongoose.model("User", UserSchema);
