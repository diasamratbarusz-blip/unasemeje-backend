const express = require("express");
const router = express.Router();
const Service = require("../models/Service");
const smmRequest = require("../utils/smmApi");

/**
 * =========================================
 * SERVICE SYNC ROUTE (UNASEMEJE ø DIA)
 * =========================================
 * Endpoint: GET /api/sync-services
 * Logic: Clears existing services and performs a fresh bulk insert
 * from the SMM provider to ensure data integrity.
 */
router.get("/sync-services", async (req, res) => {
  try {
    // ✅ Fetch services using the smmRequest utility
    const apiServices = await smmRequest({ action: "services" });

    // ✅ Validate response format
    if (!Array.isArray(apiServices)) {
      return res.status(500).json({ 
        success: false, 
        error: "Invalid provider response: Expected an array." 
      });
    }

    // ✅ Clear existing services to avoid duplicates and outdated items
    await Service.deleteMany({});

    // ✅ Format data to match your Service Model
    const formatted = apiServices.map(s => ({
      serviceId: String(s.service || s.id),
      name: s.name || "Unnamed Service",
      type: s.type || "Default",
      category: s.category || "General",
      rate: Number(s.rate) || 0,
      min: Number(s.min) || 1,
      max: Number(s.max) || 10000,
      refill: s.refill ?? false,
      cancel: s.cancel ?? false,
      status: "active"
    }));

    // ✅ Bulk insert for high performance
    await Service.insertMany(formatted);

    console.log(`✅ ${formatted.length} services synced to Unasemeje Database.`);

    res.json({
      success: true,
      message: "Services synced successfully",
      total: formatted.length
    });

  } catch (err) {
    console.error("CRITICAL SYNC ERROR:", err.message);
    res.status(500).json({ 
      success: false, 
      error: "Sync failed", 
      details: err.message 
    });
  }
});

module.exports = router;
