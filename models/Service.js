const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Initialize Environment Variables
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

/* ======================================================
 * 1. DATABASE CONNECTION
 * ====================================================== */
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/unasemeje", {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

/* ======================================================
 * 2. SERVICE MODEL (SMM PANEL)
 * ====================================================== */
const ServiceSchema = new mongoose.Schema(
  {
    serviceId: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, required: true, trim: true, default: "Unnamed Service", index: true },
    category: { type: String, default: "Other", index: true },
    
    // PRICING
    originalRate: { type: Number, default: 0 }, // Provider price
    rate: { type: Number, required: true, default: 0 }, // Internal price
    sellingRate: { type: Number, default: 0 }, // Price shown to user
    currency: { type: String, enum: ["USD", "KES", "EUR", "OTHER"], default: "KES" },

    // LIMITS & META
    min: { type: Number, default: 1 },
    max: { type: Number, default: 1000000 },
    platform: { type: String, default: "Other", index: true },
    status: { type: String, enum: ["active", "disabled"], default: "active", index: true },
    provider: { type: String, default: "default" }
  },
  { timestamps: true }
);

/* --- AUTO PRICE CALCULATION LOGIC --- */
function applyMarkup(service) {
  const name = (service.name || "").toLowerCase();
  let markup = 40; // Default flat profit per 1k

  if (name.includes("likes")) markup = 30;
  else if (name.includes("followers")) markup = 20;
  else if (name.includes("views")) markup = 40;
  else if (name.includes("save")) markup = 40;

  return Number(service.rate || 0) + markup;
}

// Save Hook
ServiceSchema.pre("save", function (next) {
  if (!this.originalRate) this.originalRate = this.rate;
  this.sellingRate = applyMarkup(this);
  next();
});

// Update Hook
ServiceSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update.rate || update.name) {
    const rate = update.rate || 0;
    const name = update.name || "";
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
});

const Service = mongoose.model("Service", ServiceSchema);

/* ======================================================
 * 3. API ROUTES
 * ====================================================== */

/**
 * GET /api/services
 * Fetches and groups all active services for the dashboard
 */
app.get('/api/services', async (req, res) => {
    try {
        const services = await Service.find({ status: 'active' });
        
        // Group services by Platform and Category for the UI
        const grouped = services.reduce((acc, s) => {
            if (!acc[s.platform]) acc[s.platform] = {};
            if (!acc[s.platform][s.category]) acc[s.platform][s.category] = [];
            
            acc[s.platform][s.category].push({
                serviceId: s.serviceId,
                name: s.name,
                rate: s.sellingRate, // Send the marked-up price to user
                min: s.min,
                max: s.max
            });
            return acc;
        }, {});

        res.json({ success: true, data: grouped });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/admin/update-services
 * Used to sync services from your provider (delixgainske.com)
 */
app.post('/api/admin/update-services', async (req, res) => {
    const servicesFromProvider = req.body; // Expects array of services

    try {
        for (const item of servicesFromProvider) {
            await Service.findOneAndUpdate(
                { serviceId: item.serviceId },
                { 
                    name: item.name,
                    category: item.category,
                    rate: item.rate, // The hooks will handle markup automatically
                    min: item.min,
                    max: item.max,
                    platform: item.platform || "Other"
                },
                { upsert: true, new: true }
            );
        }
        res.json({ success: true, message: "Services synced and marked up successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ======================================================
 * 4. START SERVER
 * ====================================================== */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 UNASEMEJE Server running on port ${PORT}`);
});

module.exports = app; // For testing purposes
