// ================= EXTERNAL SERVICES (SMM API) =================
app.get("/api/services/external", async (req, res) => {
  try {
    if (!process.env.API_URL || !process.env.API_KEY) {
      return res.status(500).json({ error: "API configuration missing" });
    }

    const response = await axios.post(
      process.env.API_URL,
      {
        key: process.env.API_KEY,
        action: "services",
      },
      { timeout: 15000 }
    );

    if (!response.data || !Array.isArray(response.data)) {
      return res.status(500).json({
        error: "Invalid response from provider",
      });
    }

    res.json(response.data);

  } catch (error) {
    console.error("❌ SMM API Error:", {
      message: error.message,
      data: error.response?.data,
      status: error.response?.status,
    });

    res.status(500).json({
      error: "Failed to load external services",
      details: error.response?.data || error.message,
    });
  }
});


// ================= INTERNAL SERVICES =================
app.get("/api/services", async (req, res) => {
  try {
    const services = await smmRequest.getServices();

    if (!Array.isArray(services)) {
      return res.status(500).json({
        error: "Invalid services format",
      });
    }

    res.json(services);

  } catch (err) {
    console.error("❌ Internal Service Error:", err.message);

    res.status(500).json({
      error: "Failed to fetch services from API",
      details: err.message,
    });
  }
});


// ================= SYNC SERVICES TO DB =================
app.get("/api/sync-services", async (req, res) => {
  try {
    if (!process.env.API_URL || !process.env.API_KEY) {
      return res.status(500).json({ error: "API configuration missing" });
    }

    const response = await axios.post(
      process.env.API_URL,
      {
        key: process.env.API_KEY,
        action: "services",
      },
      { timeout: 20000 }
    );

    const services = response.data;

    if (!Array.isArray(services)) {
      return res.status(500).json({
        error: "Invalid service data from provider",
      });
    }

    let added = 0;
    let updated = 0;

    // 🔥 OPTIMIZED: run in parallel instead of slow loop
    await Promise.all(
      services.map(async (s) => {
        const existing = await Service.findOne({ serviceId: s.service });

        if (existing) {
          await Service.updateOne(
            { serviceId: s.service },
            {
              $set: {
                name: s.name,
                rate: s.rate,
                min: s.min,
                max: s.max,
                type: s.type,
                category: s.category,
              },
            }
          );
          updated++;
        } else {
          await Service.create({
            serviceId: s.service,
            name: s.name,
            rate: s.rate,
            min: s.min,
            max: s.max,
            type: s.type,
            category: s.category,
          });
          added++;
        }
      })
    );

    res.json({
      message: "✅ Sync completed",
      added,
      updated,
      total: services.length,
    });

  } catch (error) {
    console.error("❌ SYNC ERROR:", {
      message: error.message,
      data: error.response?.data,
    });

    res.status(500).json({
      error: "Sync failed",
      details: error.response?.data || error.message,
    });
  }
});
