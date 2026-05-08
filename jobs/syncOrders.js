const cron = require("node-cron");
const smmRequest = require("../utils/smmApi");
const Service = require("../models/Service");

/**
 * =========================
 * SERVICE SYNC JOB (UNASEMEJE ø DIA)
 * =========================
 * This cron job runs every hour to pull the latest services
 * and rates from the SMM provider. This ensures your 
 * markup calculations always use the most current base prices.
 */

cron.schedule("0 * * * *", async () => {
  console.log("🔄 Syncing services from provider...");

  try {
    // Fetching action: services from the provider utility
    const services = await smmRequest({ action: "services" });

    if (!Array.isArray(services)) {
        console.log("⚠️ Sync skipped: Provider returned invalid data format.");
        return;
    }

    /**
     * Helper to detect platform based on service/category text
     * Matches the logic used in your server.js
     */
    const detectPlatform = (name, category) => {
      const text = `${name || ""} ${category || ""}`.toLowerCase();
      if (/(instagram|insta|ig)/.test(text)) return "Instagram";
      if (/(tiktok|tik tok|tt)/.test(text)) return "TikTok";
      if (/(youtube|yt)/.test(text)) return "YouTube";
      if (/(facebook|fb)/.test(text)) return "Facebook";
      if (/(twitter|x)/.test(text)) return "Twitter/X";
      if (/(telegram|tg)/.test(text)) return "Telegram";
      return "Other";
    };

    /**
     * Helper to clean service names by removing brackets
     */
    const cleanServiceName = (name = "") => {
      return String(name || "").replace(/\[.*?\]/g, "").trim() || "SMM Service";
    };

    for (let s of services) {
      const serviceId = String(s.service || s.id);
      
      // Use findOneAndUpdate with upsert: true to update existing or create new
      await Service.findOneAndUpdate(
        { serviceId: serviceId },
        {
          serviceId: serviceId,
          name: cleanServiceName(s.name),
          category: s.category || "General",
          platform: detectPlatform(s.name, s.category),
          // Ensuring rate is a valid number to prevent pricing errors
          rate: parseFloat(s.rate) || 0,
          min: parseInt(s.min) || 1,
          max: parseInt(s.max) || 10000,
          provider: "PROVIDER1" 
        },
        { upsert: true, new: true }
      );
    }

    console.log(`✅ Successfully synced ${services.length} services.`);
  } catch (err) {
    console.error("❌ Service Sync failed:", err.message);
  }
});
