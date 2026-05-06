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

    for (let s of services) {
      // Use findOneAndUpdate with upsert: true to update existing or create new
      await Service.findOneAndUpdate(
        { serviceId: String(s.service || s.id) },
        {
          serviceId: String(s.service || s.id),
          name: s.name,
          category: s.category,
          // Ensuring rate is a valid number to prevent pricing errors
          rate: parseFloat(s.rate) || 0,
          min: parseInt(s.min) || 1,
          max: parseInt(s.max) || 10000,
          // Optionally tag the provider if you use multiple
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
