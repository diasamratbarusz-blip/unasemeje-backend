app.get("/api/sync-services", async (req, res) => {
  try {
    const apiServices = await smmRequest.getServices();

    await Service.deleteMany();

    const formatted = apiServices.map(s => ({
      serviceId: s.service,
      name: s.name,
      type: s.type,
      category: s.category,
      rate: s.rate,
      min: s.min,
      max: s.max,
      refill: s.refill,
      cancel: s.cancel
    }));

    await Service.insertMany(formatted);

    res.json({ message: "Services synced successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sync failed" });
  }
});
