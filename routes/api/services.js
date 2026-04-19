const express = require("express");
const axios = require("axios");
const Service = require("../../models/Service");

const router = express.Router();

// ================= CACHE =================
let cache = {
  data: null,
  time: 0
};

const CACHE_TIME = 5 * 60 * 1000;

// ================= FETCH PROVIDER =================
async function fetchServicesFromProvider() {
  const params = new URLSearchParams();
  params.append("key", process.env.SMM_API_KEY);
  params.append("action", "services");

  const res = await axios.post(process.env.SMM_API_URL, params);

  if (!Array.isArray(res.data)) {
    throw new Error("Invalid provider response");
  }

  return res.data.map(s => ({
    serviceId: String(s.service),
    name: s.name || "Service",
    category: s.category || "Other",
    rate: Number(s.rate || 0),
    min: Number(s.min || 1),
    max: Number(s.max || 10000)
  }));
}

// ================= PLATFORM DETECTION (FIXED 🔥) =================
function getPlatform(name = "", category = "") {
  const text = (name + " " + category).toLowerCase();

  if (text.includes("instagram") || text.includes("ig")) return "Instagram";
  if (text.includes("tiktok") || text.includes("tik tok")) return "TikTok";
  if (text.includes("youtube") || text.includes("yt")) return "YouTube";
  if (text.includes("facebook") || text.includes("fb")) return "Facebook";
  if (text.includes("twitter") || text.includes("x")) return "Twitter/X";

  return "Other";
}

// ================= TYPE DETECTION =================
function getType(name = "") {
  const n = name.toLowerCase();

  if (n.includes("follower")) return "Followers";
  if (n.includes("like")) return "Likes";
  if (n.includes("view")) return "Views";
  if (n.includes("comment")) return "Comments";
  if (n.includes("save")) return "Saved";

  return "Other";
}

// ================= MARKUP SYSTEM (YOUR RULES ✅) =================
function getMarkup(name = "") {
  const text = name.toLowerCase();

  if (text.includes("like")) return 30;
  if (text.includes("follower")) return 20;
  if (text.includes("view")) return 40;
  if (text.includes("save")) return 40;

  return 40;
}

// ================= MAIN ROUTE =================
router.get("/", async (req, res) => {
  try {
    const now = Date.now();
    let services;

    // ================= CACHE =================
    if (cache.data && now - cache.time < CACHE_TIME) {
      services = cache.data;
    } else {
      services = await Service.find();

      // FETCH FROM PROVIDER IF EMPTY
      if (!services.length) {
        console.log("🔄 Fetching services from provider...");

        const providerServices = await fetchServicesFromProvider();

        await Service.deleteMany({});
        await Service.insertMany(providerServices);

        services = providerServices;
      }

      cache = { data: services, time: now };
    }

    const { platform, search } = req.query;
    let filtered = services;

    // ================= FILTER =================
    if (platform) {
      filtered = filtered.filter(
        s => getPlatform(s.name, s.category) === platform
      );
    }

    // ================= SEARCH =================
    if (search) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // ================= GROUP =================
    const grouped = {};

    for (let s of filtered) {
      if (!s.rate || s.rate <= 0) continue;

      const platformName = getPlatform(s.name, s.category);
      const type = getType(s.name);

      if (!grouped[platformName]) grouped[platformName] = {};
      if (!grouped[platformName][type]) grouped[platformName][type] = [];

      // 🔥 APPLY YOUR MARKUP HERE
      const markup = getMarkup(s.name);
      const sellingRate = Number((s.rate + markup).toFixed(2));

      grouped[platformName][type].push({
        serviceId: s.serviceId,
        name: s.name,

        // ✅ USER SEES ONLY THIS PRICE
        rate: sellingRate,

        // ❌ DO NOT expose provider price to frontend (optional)
        // originalRate: s.rate,

        min: s.min,
        max: s.max
      });
    }

    return res.json({
      success: true,
      total: filtered.length,
      data: grouped
    });

  } catch (err) {
    console.error("SERVICES ERROR:", err.message);

    res.status(500).json({
      success: false,
      error: "Failed to load services"
    });
  }
});

module.exports = router;
