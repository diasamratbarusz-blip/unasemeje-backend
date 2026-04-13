// ================= EXTERNAL SERVICES (SMM API) =================
app.get("/api/services/external", async (req, res) => {
  try {
    // Validate ENV
    if (!process.env.API_URL || !process.env.API_KEY) {
      return res.status(500).json({
        error: "API configuration missing",
      });
    }

    const response = await axios.post(
      process.env.API_URL,
      {
        key: process.env.API_KEY,
        action: "services",
      },
      {
        timeout: 15000, // prevent hanging requests
      }
    );

    // Validate response
    if (!response.data || typeof response.data !== "object") {
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


// ================= INTERNAL SERVICES (WRAPPER) =================
app.get("/api/services", async (req, res) => {
  try {
    const services = await smmRequest.getServices();

    if (!services || !Array.isArray(services)) {
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
