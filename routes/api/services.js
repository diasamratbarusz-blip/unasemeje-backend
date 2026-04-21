const express = require("express");
const axios = require("axios");
const Service = require("../../models/Service"); // Ensure this model exists

const router = express.Router();

// ================= CACHE SYSTEM =================
// Prevents hitting the provider API on every single page load
let cache = {
  data: null,
  time: 0
};
const CACHE_TIME = 10 * 60 * 1000; // 10 Minutes

// ================= PROVIDER SYNC =================
async function fetchServicesFromProvider() {
  try {
    const params = new URLSearchParams();
    params.append("key", process.env.SMM_API_KEY);
    params.append("action", "services");

    const res = await axios.post(process.env.SMM_API_URL, params, { timeout: 15000 });

    if (!Array.isArray(res.data)) {
      throw new Error("Provider returned invalid data format");
    }

    return res.data.map(s => ({
      serviceId: String(s.service || s.id),
      name: s.name || "Service",
      category: s.category || "General",
      rate: parseFloat(s.rate || 0),
      min: parseInt(s.min || 1),
      max: parseInt(s.max || 10000)
    }));
  } catch (err) {
    console.error("Sync Error:", err.message);
    return null;
  }
}

// ================= CATEGORY HELPERS =================
function getPlatform(name = "", category = "") {
  const text = (name + " " + category).toLowerCase();
  if (text.includes("instagram") || text.includes("ig ")) return "Instagram";
  if (text.includes("tiktok") || text.includes("tik tok")) return "TikTok";
  if (text.includes("youtube") || text.includes("yt ")) return "YouTube";
  if (text.includes("facebook") || text.includes("fb ")) return "Facebook";
  if (text.includes("twitter") || text.includes(" x ")) return "Twitter/X";
  if (text.includes("telegram") || text.includes("tg ")) return "Telegram";
  return "Other";
}

function getType(name = "") {
  const n = name.toLowerCase();
  if (n.includes("follower")) return "Followers";
  if (n.includes("like")) return "Likes";
  if (n.includes("view")) return "Views";
  if (n.includes("comment")) return "Comments";
  if (n.includes("save") || n.includes("bookmark")) return "Saves";
  return "Boosts";
}

// ================= PROFIT MARKUP LOGIC =================
// Rules: 20% for followers, 30% for likes, 40% for everything else
function calculateSellingRate(originalRate, name = "") {
  const text = name.toLowerCase();
  let margin = 1.40; // Default 40% profit

  if (text.includes("follower")) margin = 1.20; // 20% profit
  if (text.includes("like")) margin = 1.30;     // 30% profit

  // Formula: Original Cost * Margin
  return parseFloat((originalRate * margin).toFixed(2));
}

// ================= MAIN ROUTE =================
router.get("/", async (req, res) => {
  try {
    const now = Date.now();
    let services;

    // 1. Check Memory Cache first for speed
    if (cache.data && now - cache.time < CACHE_TIME) {
      services = cache.data;
    } else {
      // 2. Fallback to Database
      services = await Service.find().lean();

      // 3. If DB is empty or cache expired, sync with Provider
      if (!services.length || (now - cache.time >= CACHE_TIME)) {
        const providerServices = await fetchServicesFromProvider();
        
        if (providerServices) {
          // Update DB in background
          await Service.deleteMany({});
          await Service.insertMany(providerServices);
          services = providerServices;
        }
      }
      cache = { data: services, time: now };
    }

    const { platform, search } = req.query;
    let filtered = services;

    // 4. Filter by platform (e.g., ?platform=Instagram)
    if (platform && platform !== "All") {
      filtered = filtered.filter(s => getPlatform(s.name, s.category) === platform);
    }

    // 5. Filter by search term
    if (search) {
      filtered = filtered.filter(s => 
        s.name.toLowerCase().includes(search.toLowerCase()) || 
        s.category.toLowerCase().includes(search.toLowerCase())
      );
    }

    // 6. Group and Apply Markup
    const grouped = {};

    filtered.forEach(s => {
      if (s.rate <= 0) return; // Skip broken services

      const pName = getPlatform(s.name, s.category);
      const type = getType(s.name);
      
      const sellingRate = calculateSellingRate(s.rate, s.name);

      if (!grouped[pName]) grouped[pName] = {};
      if (!grouped[pName][type]) grouped[pName][type] = [];

      grouped[pName][type].push({
        id: s.serviceId,
        name: s.name,
        category: s.category,
        rate: sellingRate, // The user only sees your marked-up price
        min: s.min,
        max: s.max
      });
    });

    res.json({
      success: true,
      data: grouped
    });

  } catch (err) {
    console.error("SERVICES_ROUTE_ERROR:", err);
    res.status(500).json({ success: false, message: "Error loading services" });
  }
});

module.exports = router;
