const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

// MIDDLEWARE
app.use(express.json());
app.use(cors());

// MONGODB CONNECTION
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to UNASEMEJE Database"))
  .catch((err) => console.error("❌ Database Connection Error:", err));

/**
 * =========================
 * SERVICE MODEL (SMM PANEL)
 * =========================
 */
const ServiceSchema = new mongoose.Schema(
  {
    serviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
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
    originalRate: {
      type: Number,
      default: 0
    },
    rate: {
      type: Number,
      required: true,
      default: 0
    },
    sellingRate: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      enum: ["USD", "KES", "EUR", "OTHER"],
      default: "KES"
    },
    min: {
      type: Number,
      default: 1
    },
    max: {
      type: Number,
      default: 1000000
    },
    platform: {
      type: String,
      default: "Other",
      index: true
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true
    },
    provider: {
      type: String,
      default: "default"
    }
  },
  {
    timestamps: true
  }
);

// INDEXING
ServiceSchema.index({ platform: 1, status: 1 });
ServiceSchema.index({ category: 1 });

// MARKUP CALCULATION UTILITY
function applyMarkup(service) {
  const name = (service.name || "").toLowerCase();
  let markup = 40; // default KES profit per 1k

  if (name.includes("likes")) markup = 30;
  else if (name.includes("followers")) markup = 20;
  else if (name.includes("views")) markup = 40;
  else if (name.includes("save")) markup = 40;

  return Number(service.rate || 0) + markup;
}

// MIDDLEWARE HOOKS
ServiceSchema.pre("save", function (next) {
  try {
    if (!this.originalRate) this.originalRate = this.rate;
    this.sellingRate = applyMarkup(this);
    next();
  } catch (err) {
    next(err);
  }
});

ServiceSchema.pre("findOneAndUpdate", function (next) {
  try {
    const update = this.getUpdate();
    if (update.rate || update.name) {
      const name = update.name || "";
      const rate = update.rate || 0;
      let markup = 40;
      const n = name.toLowerCase();

      if (n.includes("likes")) markup = 30;
      else if (n.includes("followers")) markup = 20;
      else if (n.includes("views")) markup = 40;
      else if (n.includes("save")) markup = 40;

      update.sellingRate = rate + markup;
      update.originalRate = rate;
    }
    next();
  } catch (err) {
    next(err);
  }
});

const Service = mongoose.model("Service", ServiceSchema);

/**
 * =========================
 * API ROUTES
 * =========================
 */

// 1. Fetch All Services (Grouped for Dashboard)
app.get("/api/services", async (req, res) => {
  try {
    const services = await Service.find({ status: "active" });
    
    // Grouping logic for the frontend select menus
    const grouped = services.reduce((acc, s) => {
      if (!acc[s.platform]) acc[s.platform] = {};
      if (!acc[s.platform][s.category]) acc[s.platform][s.category] = [];
      
      acc[s.platform][s.category].push({
        serviceId: s.serviceId,
        name: s.name,
        rate: s.sellingRate,
        min: s.min,
        max: s.max
      });
      return acc;
    }, {});

    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to load services" });
  }
});

// 2. Health Check
app.get("/", (req, res) => {
  res.send("UNASEMEJE SMM API is running...");
});

// SERVER START
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server active on port ${PORT}`);
});
