const cron = require("node-cron");
const smmRequest = require("../utils/smmApi");
const Service = require("../models/Service");

cron.schedule("0 * * * *", async () => {
  console.log("🔄 Syncing services...");

  try {
    const services = await smmRequest({ action: "services" });

    if (!Array.isArray(services)) return;

    for (let s of services) {
      await Service.findOneAndUpdate(
        { serviceId: String(s.service) },
        {
          serviceId: String(s.service),
          name: s.name,
          category: s.category,
          rate: parseFloat(s.rate),
          min: s.min,
          max: s.max
        },
        { upsert: true }
      );
    }

    console.log("✅ Services synced");
  } catch (err) {
    console.error("❌ Sync failed:", err.message);
  }
});
