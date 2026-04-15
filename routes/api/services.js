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
    name: s.name,
    category: s.category || "Other",
    rate: Number(s.rate),
    min: Number(s.min),
    max: Number(s.max)
  }));
}

// ================= PLATFORM DETECTION =================
function getPlatform(category = "") {
  const c = category.toLowerCase();

  if (c.includes("instagram")) return "Instagram";
  if (c.includes("tiktok")) return "TikTok";
  if (c.includes("youtube")) return "YouTube";
  if (c.includes("facebook")) return "Facebook";
  if (c.includes("twitter") || c.includes("x")) return "Twitter/X";

  return "Other";
}

// ================= SERVICE TYPE DETECTION =================
function getType(name = "") {
  const n = name.toLowerCase();

  if (n.includes("follower")) return "Followers";
  if (n.includes("like")) return "Likes";
  if (n.includes("view")) return "Views";
  if (n.includes("comment")) return "Comments";
  if (n.includes("share")) return "Shares";

  return "Other";
}

// ================= MAIN ROUTE =================
router.get("/", async (req, res) => {
  try {
    const now = Date.now();

    let services;

    // ================= CACHE CHECK =================
    if (cache.data && now - cache.time < CACHE_TIME) {
      services = cache.data;
    } else {
      services = await Service.find();

      // If DB empty → fetch from provider
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

    // ================= FILTER BY PLATFORM =================
    if (platform) {
      filtered = filtered.filter(
        s => getPlatform(s.category) === platform
      );
    }

    // ================= SEARCH =================
    if (search) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // ================= GROUPING =================
    const grouped = {};

    for (let s of filtered) {
      if (s.rate <= 0) continue;

      const platformName = getPlatform(s.category);
      const type = getType(s.name);

      if (!grouped[platformName]) grouped[platformName] = {};
      if (!grouped[platformName][type]) grouped[platformName][type] = [];

      // ================= PROFIT SYSTEM =================
      let profitPercent = 25;

      if (s.rate < 1) profitPercent = 60;
      else if (s.rate < 3) profitPercent = 35;
      else if (s.rate < 10) profitPercent = 20;

      const sellingRate =
        s.rate + (s.rate * profitPercent) / 100;

      grouped[platformName][type].push({
        serviceId: s.serviceId,
        name: s.name,
        rate: Number(sellingRate.toFixed(2)),
        originalRate: s.rate,
        min: s.min,
        max: s.max,
        profit: profitPercent
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
