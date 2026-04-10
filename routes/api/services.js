app.get("/api/services", async (req, res) => {
  try {
    const services = await smmRequest.getServices();
    res.json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch services from API" });
  }
});
