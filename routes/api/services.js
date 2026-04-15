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
async function fetchProviderServices() {
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

// ================= PLATFORM DETECTOR =================
function getPlatform(category = "") {
  const c = category.toLowerCase();

  if (c.includes("instagram")) return "Instagram";
  if (c.includes("tiktok")) return "TikTok";
  if (c.includes("facebook")) return "Facebook";
  if (c.includes("youtube")) return "YouTube";
  if (c.includes("twitter") || c.includes("x")) return "Twitter/X";

  return "Other";
}

// ================= TYPE DETECTOR =================
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

      if (!services.length) {
        console.log("🔄 Fetching from provider...");

        const provider = await fetchProviderServices();

        await Service.deleteMany({});
        await Service.insertMany(provider);

        services = provider;
      }

      cache = { data: services, time: now };
    }

    const { platform, search } = req.query;

    let filtered = services;

    // ================= FILTER =================
    if (platform) {
      filtered = filtered.filter(
        s => getPlatform(s.category) === platform
      );
    }

    if (search) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // ================= GROUPING =================
    const grouped = {};

    for (let s of filtered) {
      if (s.rate <= 0) continue;

      const p = getPlatform(s.category);
      const t = getType(s.name);

      if (!grouped[p]) grouped[p] = {};
      if (!grouped[p][t]) grouped[p][t] = [];

      // ================= PROFIT SYSTEM =================
      let profit = 20;

      if (s.rate < 1) profit = 60;
      else if (s.rate < 3) profit = 35;

      const sellingRate = s.rate + (s.rate * profit / 100);

      grouped[p][t].push({
        serviceId: s.serviceId,
        name: s.name,
        rate: Number(sellingRate.toFixed(2)),
        originalRate: s.rate,
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
