const express = require("express");
const router = express.Router();

const Service = require("../models/Service");

/**
 * ================================
 * GET ALL ACTIVE SERVICES (USER VIEW)
 * ================================
 * Users ONLY see:
 * - serviceId
 * - name
 * - category
 * - selling price (rate)
 * - min / max
 * - platform / quality (optional UI use)
 */
router.get("/", async (req, res) => {
  try {
    const services = await Service.find({ status: "active" })
      .select("serviceId name category sellingRate min max platform quality");

    if (!services || services.length === 0) {
      return res.status(404).json({
        error: "No services available"
      });
    }

    res.json(
      services.map((s) => ({
        serviceId: s.serviceId,
        name: s.name,
        category: s.category,

        // 💰 USER PRICE (IMPORTANT)
        rate: s.sellingRate,

        min: s.min,
        max: s.max,

        platform: s.platform,
        quality: s.quality
      }))
    );

  } catch (err) {
    console.error("❌ SERVICES ERROR:", err.message);

    res.status(500).json({
      error: "Failed to fetch services",
      details: err.message
    });
  }
});

/**
 * ================================
 * GET SINGLE SERVICE (OPTIONAL)
 * ================================
 */
router.get("/:serviceId", async (req, res) => {
  try {
    const service = await Service.findOne({
      serviceId: req.params.serviceId,
      status: "active"
    });

    if (!service) {
      return res.status(404).json({
        error: "Service not found"
      });
    }

    res.json({
      serviceId: service.serviceId,
      name: service.name,
      category: service.category,
      rate: service.sellingRate,
      min: service.min,
      max: service.max,
      platform: service.platform,
      quality: service.quality
    });

  } catch (err) {
    console.error("❌ SERVICE ERROR:", err.message);

    res.status(500).json({
      error: "Failed to fetch service",
      details: err.message
    });
  }
});

module.exports = router;
