app.get("/api/sync-services", async (req, res) => {
  try {
    const apiServices = await smmRequest.getServices();

    // ✅ validate response
    if (!Array.isArray(apiServices)) {
      return res.status(500).json({ error: "Invalid provider response" });
    }

    await Service.deleteMany();

    const formatted = apiServices.map(s => ({
      serviceId: s.service,
      name: s.name,
      type: s.type || "",
      category: s.category || "",
      rate: Number(s.rate),
      min: Number(s.min),
      max: Number(s.max),
      refill: s.refill ?? false,
      cancel: s.cancel ?? false
    }));

    await Service.insertMany(formatted);

    res.json({
      message: "Services synced successfully",
      total: formatted.length
    });

  } catch (err) {
    console.error("SYNC ERROR:", err.message);
    res.status(500).json({ error: "Sync failed" });
  }
});
