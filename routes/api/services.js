// ================= EXTERNAL SERVICES (SMM API) =================
app.get("/api/services/external", async (req, res) => {
  try {
    const response = await axios.post(process.env.API_URL, {
      key: process.env.API_KEY,
      action: "services"
    });

    res.json(response.data);

  } catch (error) {
    console.error("SMM API Error:", error.response?.data || error.message);

    res.status(500).json({
      error: "Failed to load external services",
      details: error.response?.data || error.message
    });
  }
});

app.get("/api/services", async (req, res) => {
  try {
    const services = await smmRequest.getServices();
    res.json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch services from API" });
  }
});
