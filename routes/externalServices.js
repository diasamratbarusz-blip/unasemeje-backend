const express = require("express");
const router = express.Router();
const axios = require("axios");
const qs = require("qs"); // Useful for form-data encoding

/**
 * =========================================
 * FETCH SERVICES FROM PROVIDER
 * =========================================
 * GET /api/external-services
 */
router.get("/", async (req, res) => {
  try {
    const API_URL = process.env.SMM_API_URL || process.env.API_URL;
    const API_KEY = process.env.SMM_API_KEY || process.env.API_KEY;

    if (!API_URL || !API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Server configuration error: API_URL or API_KEY is missing in .env"
      });
    }

    /**
     * SMM Panels are picky. We use URLSearchParams to ensure compatibility 
     * with standard APIs (like JustAnotherPanel, PerfectPanel, etc.)
     */
    const params = new URLSearchParams();
    params.append("key", API_KEY);
    params.append("action", "services");

    const response = await axios.post(API_URL, params, {
      timeout: 25000,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    // 1. Check for provider-level errors (e.g., "Invalid API Key")
    if (response.data.error) {
      return res.status(400).json({
        success: false,
        error: `Provider Error: ${response.data.error}`
      });
    }

    // 2. Validate that we received an array of services
    const rawServices = response.data;
    if (!Array.isArray(rawServices)) {
      return res.status(500).json({
        success: false,
        error: "Provider returned invalid data format (Expected Array)",
        received: typeof rawServices
      });
    }

    // 3. Clean and Standardize Data
    // We map the fields to ensure your frontend always gets consistent keys
    const cleanedServices = rawServices.map((s) => ({
      serviceId: String(s.service || s.id),
      name: s.name || "Unnamed Service",
      category: s.category || "General",
      rate: parseFloat(s.rate || 0),
      min: parseInt(s.min || 0),
      max: parseInt(s.max || 0),
      type: s.type || "Default",
      description: s.description || ""
    }));

    res.json({
      success: true,
      total: cleanedServices.length,
      data: cleanedServices
    });

  } catch (error) {
    console.error("❌ External Services Fetch Failed:", error.message);
    
    res.status(500).json({
      success: false,
      error: "Connection to SMM Provider failed",
      details: error.response?.data || error.message
    });
  }
});

/**
 * =========================================
 * TEST CONNECTION & CHECK BALANCE
 * =========================================
 * GET /api/external-services/test
 */
router.get("/test", async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.append("key", process.env.SMM_API_KEY || process.env.API_KEY);
    params.append("action", "balance");

    const response = await axios.post(
      process.env.SMM_API_URL || process.env.API_URL, 
      params
    );

    if (response.data.error) {
      return res.status(401).json({
        success: false,
        message: "Authentication failed with provider",
        error: response.data.error
      });
    }

    res.json({
      success: true,
      message: "Successfully connected to provider",
      balance: response.data.balance,
      currency: response.data.currency || "USD"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Could not reach provider server",
      details: err.message
    });
  }
});

module.exports = router;
