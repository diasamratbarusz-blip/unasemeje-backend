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
      timeout: 20000
    });

    const raw = response.data;

    if (!raw) throw new Error("Empty provider response");

    let services = Array.isArray(raw)
      ? raw
      : typeof raw === "object"
        ? Object.values(raw).flat()
        : [];

    return services.map((s) => ({
      serviceId: String(s.service || s.id || ""),
      name: s.name || "Unnamed Service",
      rate: Number(s.rate || s.cost || 0),
      min: Number(s.min || 1),
      max: Number(s.max || 100000),
      category: s.category || "Other",
      status: "active"
    }));

  } catch (err) {
    console.error("❌ Provider fetch error:", err.message);
    return [];
  }
};

/* =========================
   SYNC TO DATABASE
========================= */
const syncServicesToDB = async (services) => {
  try {
    if (!services.length) return;

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
  const t = `${text} ${category}`.toLowerCase();

  if (t.includes("instagram")) return "Instagram";
  if (t.includes("tiktok")) return "TikTok";
  if (t.includes("youtube")) return "YouTube";
  if (t.includes("facebook")) return "Facebook";
  if (t.includes("twitter") || t.includes("x")) return "Twitter/X";

  return "Other";
}

/* =========================
   TYPE DETECTION
========================= */
function detectType(name = "") {
  const n = name.toLowerCase();

  if (n.includes("followers")) return "Followers";
  if (n.includes("likes")) return "Likes";
  if (n.includes("views")) return "Views";
  if (n.includes("comments")) return "Comments";
  if (n.includes("subscribers")) return "Subscribers";
  if (n.includes("save")) return "Saved";

  return "Other";
}

/* =========================
   FLAT SERVICES
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
   GROUPED SERVICES
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
        rate: Number(s.rate || 0).toFixed(2),
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
