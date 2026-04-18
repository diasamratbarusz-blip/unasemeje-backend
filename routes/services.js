const express = require("express");
const router = express.Router();
const axios = require("axios");
const Service = require("../../models/Service");

/* =========================
   ENV CHECK SAFETY
========================= */
if (!process.env.SMM_API_URL || !process.env.SMM_API_KEY) {
  console.error("❌ Missing SMM_API_URL or SMM_API_KEY");
}

/* =========================
   FETCH FROM PROVIDER
========================= */
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

    let services = [];

    if (Array.isArray(raw)) {
      services = raw;
    } else if (typeof raw === "object") {
      services = Object.values(raw).flat();
    }

    return services.map((s) => ({
      serviceId: String(s.service || s.id),
      name: s.name || "Unnamed Service",
      rate: Number(s.rate || s.cost || 0),
      min: Number(s.min || 1),
      max: Number(s.max || 100000),
      category: s.category || "Other",
      status: "active"
    }));

  } catch (err) {
    console.error("❌ Provider fetch error:", err.message);
    throw err;
  }
};

/* =========================
   SAVE TO DATABASE (UPSERT)
========================= */
const syncServicesToDB = async (services) => {
  try {
    if (!services || !services.length) return;

    const ops = services.map((s) => ({
      updateOne: {
        filter: { serviceId: s.serviceId },
        update: { $set: s },
        upsert: true
      }
    }));

    await Service.bulkWrite(ops);

  } catch (err) {
    console.error("❌ DB sync error:", err.message);
  }
};

/* =========================
   PLATFORM DETECTION
========================= */
function detectPlatform(text = "", category = "") {
  text = (text + " " + category).toLowerCase();

  if (text.includes("instagram")) return "Instagram";
  if (text.includes("tiktok")) return "TikTok";
  if (text.includes("youtube")) return "YouTube";
  if (text.includes("facebook")) return "Facebook";
  if (text.includes("twitter") || text.includes("x")) return "Twitter/X";

  return "Other";
}

/* =========================
   TYPE DETECTION
========================= */
function detectType(name = "") {
  name = name.toLowerCase();

  if (name.includes("followers")) return "Followers";
  if (name.includes("likes")) return "Likes";
  if (name.includes("views")) return "Views";
  if (name.includes("comments")) return "Comments";
  if (name.includes("subscribers")) return "Subscribers";

  return "Other";
}

/* =========================
   GET FLAT SERVICES
   /api/services/all
========================= */
router.get("/all", async (req, res) => {
  try {
    let services = await Service.find({ status: "active" });

    if (!services.length) {
      const provider = await fetchProviderServices();
      await syncServicesToDB(provider);
      services = provider;
    }

    res.json({
      success: true,
      data: services
    });

  } catch (err) {
    console.error("❌ FLAT SERVICES ERROR:", err.message);

    res.status(500).json({
      success: false,
      error: "Failed to load services"
    });
  }
});

/* =========================
   GET GROUPED SERVICES
   /api/services
========================= */
router.get("/", async (req, res) => {
  try {
    let services = await Service.find({ status: "active" });

    if (!services.length) {
      const provider = await fetchProviderServices();
      await syncServicesToDB(provider);
      services = provider;
    }

    const grouped = {};

    services.forEach((s) => {
      const platform = detectPlatform(s.name, s.category);
      const type = detectType(s.name);

      if (!grouped[platform]) grouped[platform] = {};
      if (!grouped[platform][type]) grouped[platform][type] = [];

      grouped[platform][type].push({
        serviceId: s.serviceId,
        name: s.name,
        rate: Number(s.rate).toFixed(2),
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
      error: "Failed to load services"
    });
  }
});

/* =========================
   SINGLE SERVICE
========================= */
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
      error: "Failed to fetch service"
    });
  }
});

module.exports = router;
