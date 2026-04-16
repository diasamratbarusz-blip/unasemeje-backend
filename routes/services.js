const express = require("express");
const router = express.Router();
const axios = require("axios");
const Service = require("../../models/Service");

/**
 * =========================================
 * CONFIG SAFETY CHECK
 * =========================================
 */
if (!process.env.SMM_API_URL || !process.env.SMM_API_KEY) {
  console.error("❌ Missing SMM_API_URL or SMM_API_KEY in environment variables");
}

/**
 * =========================================
 * FETCH FROM PROVIDER (FIXED)
 * =========================================
 */
const fetchProviderServices = async () => {
  try {
    const url = `${process.env.SMM_API_URL}?action=services&key=${process.env.SMM_API_KEY}`;

    const response = await axios.get(url, {
      timeout: 15000
    });

    const raw = response.data;

    if (!raw) {
      throw new Error("Empty provider response");
    }

    // SAFE NORMALIZATION (ARRAY OR OBJECT)
    let servicesArray = [];

    if (Array.isArray(raw)) {
      servicesArray = raw;
    } else {
      servicesArray = Object.values(raw);
    }

    return servicesArray.map((s) => ({
      serviceId: s.service,
      name: s.name,
      rate: Number(s.rate),
      min: Number(s.min),
      max: Number(s.max),
      category: s.category || "Other",
      status: "active"
    }));

  } catch (err) {
    console.error("❌ PROVIDER FETCH ERROR:", err.message);
    throw err;
  }
};

/**
 * =========================================
 * UPSERT SERVICES INTO DB
 * =========================================
 */
const syncServicesToDB = async (services) => {
  try {
    const bulkOps = services.map((s) => ({
      updateOne: {
        filter: { serviceId: s.serviceId },
        update: { $set: s },
        upsert: true
      }
    }));

    await Service.bulkWrite(bulkOps);
  } catch (err) {
    console.error("❌ DB SYNC ERROR:", err.message);
  }
};

/**
 * =========================================
 * GET FLAT SERVICES (FRONTEND SAFE)
 * =========================================
 * /api/services/all
 */
router.get("/all", async (req, res) => {
  try {
    let services = await Service.find({ status: "active" });

    if (!services.length) {
      const providerServices = await fetchProviderServices();
      await syncServicesToDB(providerServices);
      services = providerServices;
    }

    res.json({
      success: true,
      data: services
    });

  } catch (err) {
    console.error("❌ FLAT SERVICES ERROR:", err.message);

    res.status(500).json({
      success: false,
      error: "Failed to load services",
      details: err.message
    });
  }
});

/**
 * =========================================
 * GET GROUPED SERVICES (DASHBOARD)
 * =========================================
 * /api/services
 */
router.get("/", async (req, res) => {
  try {
    let services = await Service.find({ status: "active" });

    if (!services.length) {
      const providerServices = await fetchProviderServices();
      await syncServicesToDB(providerServices);
      services = providerServices;
    }

    const grouped = {};

    services.forEach((s) => {
      const category = (s.category || "").toLowerCase();
      const name = (s.name || "").toLowerCase();

      // PLATFORM DETECTION
      let platform = "Other";
      if (category.includes("instagram")) platform = "Instagram";
      else if (category.includes("tiktok")) platform = "TikTok";
      else if (category.includes("facebook")) platform = "Facebook";
      else if (category.includes("youtube")) platform = "YouTube";
      else if (category.includes("twitter") || category.includes("x")) platform = "Twitter/X";

      // TYPE DETECTION
      let type = "Other";
      if (name.includes("followers")) type = "Followers";
      else if (name.includes("likes")) type = "Likes";
      else if (name.includes("views")) type = "Views";
      else if (name.includes("comments")) type = "Comments";

      if (!grouped[platform]) grouped[platform] = {};
      if (!grouped[platform][type]) grouped[platform][type] = [];

      grouped[platform][type].push({
        serviceId: s.serviceId,
        name: s.name,
        rate: s.rate,
        min: s.min,
        max: s.max,
        category: s.category
      });
    });

    res.json({
      success: true,
      data: grouped
    });

  } catch (err) {
    console.error("❌ GROUPED SERVICES ERROR:", err.message);

    res.status(500).json({
      success: false,
      error: "Failed to load services",
      details: err.message
    });
  }
});

/**
 * =========================================
 * GET SINGLE SERVICE
 * =========================================
 */
router.get("/:serviceId", async (req, res) => {
  try {
    const service = await Service.findOne({
      serviceId: req.params.serviceId,
      status: "active"
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: "Service not found"
      });
    }

    res.json({
      success: true,
      data: service
    });

  } catch (err) {
    console.error("❌ SINGLE SERVICE ERROR:", err.message);

    res.status(500).json({
      success: false,
      error: "Failed to fetch service",
      details: err.message
    });
  }
});

module.exports = router;
