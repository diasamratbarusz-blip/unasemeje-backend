const express = require("express");
const router = express.Router();
const axios = require("axios");
const qs = require("qs"); // Useful for form-data encoding

/**
 * =========================================
 * FETCH SERVICES FROM PROVIDER 1
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

    const params = new URLSearchParams();
    params.append("key", API_KEY);
    params.append("action", "services");

    const response = await axios.post(API_URL, params, {
      timeout: 25000,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    if (response.data.error) {
      return res.status(400).json({
        success: false,
        error: `Provider Error: ${response.data.error}`
      });
    }

    const rawServices = response.data;
    if (!Array.isArray(rawServices)) {
      return res.status(500).json({
        success: false,
        error: "Provider returned invalid data format (Expected Array)",
        received: typeof rawServices
      });
    }

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
 * FETCH SERVICES FROM PROVIDER 2 (SMM AFRICA)
 * =========================================
 * GET /api/external-services/provider2
 */
router.get("/provider2", async (req, res) => {
  try {
    const API_URL = process.env.API_URL_PROVIDER2;
    const API_KEY = process.env.API_KEY_PROVIDER2;

    if (!API_URL || !API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Provider 2 configuration missing in .env"
      });
    }

    // SMM Africa v3 uses JSON POST
    const response = await axios.post(API_URL, {
      key: API_KEY,
      action: "services"
    }, {
      headers: { "Content-Type": "application/json" }
    });

    if (response.data.error) {
      return res.status(400).json({ success: false, error: response.data.error });
    }

    const rawServices = response.data;
    const cleanedServices = rawServices.map((s) => ({
      serviceId: String(s.service),
      name: s.name,
      category: s.category,
      rate: parseFloat(s.rate),
      min: parseInt(s.min),
      max: parseInt(s.max),
      refill: s.refill,
      cancel: s.cancel
    }));

    res.json({
      success: true,
      provider: "SMM Africa",
      total: cleanedServices.length,
      data: cleanedServices
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * =========================================
 * TEST CONNECTION & CHECK BALANCE (PROVIDER 1)
 * =========================================
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

/**
 * =========================================
 * TEST CONNECTION & CHECK BALANCE (PROVIDER 2)
 * =========================================
 */
router.get("/test/provider2", async (req, res) => {
  try {
    const response = await axios.post(process.env.API_URL_PROVIDER2, {
      key: process.env.API_KEY_PROVIDER2,
      action: "balance"
    }, {
      headers: { "Content-Type": "application/json" }
    });

    if (response.data.error) {
      return res.status(401).json({ success: false, error: response.data.error });
    }

    res.json({
      success: true,
      provider: "SMM Africa",
      balance: response.data.balance,
      currency: response.data.currency
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * =========================================
 * ACTION HANDLER (STATUS, REFILL, CANCEL)
 * =========================================
 * POST /api/external-services/action
 */
router.post("/action", async (req, res) => {
  const { provider, action, orderId } = req.body;

  try {
    let apiUrl, apiKey, payload;

    if (provider === "PROVIDER2") {
      apiUrl = process.env.API_URL_PROVIDER2;
      apiKey = process.env.API_KEY_PROVIDER2;
      
      // SMM Africa JSON Format
      payload = { key: apiKey, action: action, order: orderId };
      
      const response = await axios.post(apiUrl, payload, {
        headers: { "Content-Type": "application/json" }
      });
      return res.json({ success: true, data: response.data });
    } 
    
    // Default Provider 1 logic (Form-Data)
    apiUrl = process.env.SMM_API_URL || process.env.API_URL;
    apiKey = process.env.SMM_API_KEY || process.env.API_KEY;
    
    const params = new URLSearchParams();
    params.append("key", apiKey);
    params.append("action", action);
    params.append("order", orderId);

    const response = await axios.post(apiUrl, params);
    res.json({ success: true, data: response.data });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
