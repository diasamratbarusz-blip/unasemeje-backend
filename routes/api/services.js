const express = require("express");
const axios = require("axios");
const Service = require("../../models/Service");

const router = express.Router();

// ================= CACHE =================
let servicesCache = {
  data: null,
  lastFetch: 0
};

const CACHE_TIME = 5 * 60 * 1000; // 5 minutes

// ================= FETCH FROM PROVIDER =================
async function fetchFromProvider() {
  console.log("🔄 Syncing services from provider...");

  const params = new URLSearchParams();
  params.append("key", process.env.SMM_API_KEY);
  params.append("action", "services");

  const response = await axios.post(process.env.SMM_API_URL, params);
  const data = response.data;

  if (!Array.isArray(data)) {
    throw new Error("Invalid provider response");
  }

  const formatted = data.map(s => ({
    serviceId: s.service,
    name: s.name,
    rate: Number(s.rate),
    min: Number(s.min),
    max: Number(s.max),
    category: s.category || "Other"
  }));

  await Service.deleteMany({});
  await Service.insertMany(formatted);

  return formatted;
}

// ================= AUTO SYNC (EVERY 30 MIN) =================
setInterval(async () => {
  try {
    await fetchFromProvider();
    console.log("✅ Services auto-synced");
  } catch (err) {
    console.error("Auto-sync failed:", err.message);
  }
}, 30 * 60 * 1000);

// ================= HELPERS =================
const getPlatform = (category = "") => {
  const c = category.toLowerCase();

  if (c.includes("instagram")) return "Instagram";
  if (c.includes("tiktok")) return "TikTok";
  if (c.includes("facebook")) return "Facebook";
  if (c.includes("youtube")) return "YouTube";
  if (c.includes("twitter") || c.includes("x")) return "Twitter/X";

  return "Other";
};

const getType = (name = "") => {
  const n = name.toLowerCase();

  if (n.includes("follower")) return "Followers";
  if (n.includes("like")) return "Likes";
  if (n.includes("view")) return "Views";
  if (n.includes("comment")) return "Comments";
  if (n.includes("share")) return "Shares";

  return "Other";
};

// ================= MAIN ROUTE =================
router.get("/", async (req, res) => {
  try {
    const now = Date.now();

    let services;

    // ================= CACHE =================
    if (servicesCache.data && (now - servicesCache.lastFetch < CACHE_TIME)) {
      services = servicesCache.data;
    } else {
      services = await Service.find();

      if (!services || services.length === 0) {
        services = await fetchFromProvider();
      }

      servicesCache = {
        data: services,
        lastFetch: now
      };
    }

    const { platform, search } = req.query;

    // ================= FILTER =================
    let filtered = services;

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

    filtered.forEach(service => {
      if (service.rate <= 0 || service.min <= 0) return;

      const platformName = getPlatform(service.category);
      const type = getType(service.name);

      if (!grouped[platformName]) grouped[platformName] = {};
      if (!grouped[platformName][type]) grouped[platformName][type] = [];

      // ================= PROFIT SYSTEM =================
      const baseProfit = 20;

      let profit = baseProfit;

      if (service.rate < 1) profit = 50;
      else if (service.rate < 3) profit = 30;

      const finalRate = service.rate + (service.rate * profit / 100);

      grouped[platformName][type].push({
        serviceId: service.serviceId,
        name: service.name,
        rate: Number(finalRate.toFixed(2)),
        originalRate: service.rate,
        min: service.min,
        max: service.max
      });
    });

    // ================= SORT =================
    for (let p in grouped) {
      for (let t in grouped[p]) {
        grouped[p][t].sort((a, b) => a.rate - b.rate);
      }
    }

    // ================= RESPONSE =================
    res.json({
      success: true,
      total: filtered.length,
      cached: !!servicesCache.data,
      data: grouped
    });

  } catch (err) {
    console.error("❌ SERVICES ERROR:", err.message);
    res.status(500).json({ error: "Failed to load services" });
  }
});

module.exports = router;
