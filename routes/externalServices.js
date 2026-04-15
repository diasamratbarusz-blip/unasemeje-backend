const express = require("express");
const router = express.Router();
const axios = require("axios");

/**
 * ================================
 * GET SERVICES FROM EXTERNAL SMM PROVIDER
 * ================================
 * This pulls raw services directly from:
 * - JustAnotherPanel style API
 * - or any SMM provider API
 *
 * Used ONLY for:
 * - syncing
 * - previewing provider services
 * NOT for user frontend display
 */

router.get("/", async (req, res) => {
  try {
    // ================= VALIDATE CONFIG =================
    if (!process.env.API_URL || !process.env.API_KEY) {
      return res.status(500).json({
        error: "API configuration missing (API_URL / API_KEY)"
      });
    }

    // ================= REQUEST PROVIDER =================
    const response = await axios.post(
      process.env.API_URL,
      {
        key: process.env.API_KEY,
        action: "services"
      },
      {
        timeout: 20000,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    // ================= VALIDATE RESPONSE =================
    const data = response.data;

    if (!data || !Array.isArray(data)) {
      return res.status(500).json({
        error: "Invalid response from provider",
        received: typeof data
      });
    }

    // ================= CLEAN DATA =================
    const cleanedServices = data.map((s) => ({
      serviceId: s.service || s.id || null,
      name: s.name || "Unknown Service",
      category: s.category || "General",
      rate: Number(s.rate || 0),
      min: Number(s.min || 0),
      max: Number(s.max || 0),
      type: s.type || null
    }));

    // ================= RESPONSE =================
    res.json({
      success: true,
      total: cleanedServices.length,
      services: cleanedServices
    });

  } catch (error) {
    console.error("❌ External Services Error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    res.status(500).json({
      error: "Failed to fetch external services",
      details: error.response?.data || error.message
    });
  }
});

/**
 * ================================
 * OPTIONAL: TEST PROVIDER CONNECTION
 * ================================
 */
router.get("/test", async (req, res) => {
  try {
    const response = await axios.post(process.env.API_URL, {
      key: process.env.API_KEY,
      action: "balance"
    });

    res.json({
      success: true,
      providerStatus: "connected",
      data: response.data
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      providerStatus: "failed",
      error: err.message
    });
  }
});

module.exports = router;
