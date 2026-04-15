const express = require("express");
const router = express.Router();
const axios = require("axios");

const Service = require("../models/Service");
const { calculateSellingPrice } = require("../utils/priceCalculator");

/**
 * ================================
 * SYNC SERVICES FROM PROVIDER → DATABASE
 * ================================
 * This endpoint:
 * - Fetches services from SMM provider
 * - Updates existing services
 * - Adds new services
 * - Recalculates selling price
 */

router.get("/", async (req, res) => {
  try {
    // ================= VALIDATION =================
    if (!process.env.API_URL || !process.env.API_KEY) {
      return res.status(500).json({
        error: "API configuration missing"
      });
    }

    // ================= FETCH PROVIDER SERVICES =================
    const response = await axios.post(
      process.env.API_URL,
      {
        key: process.env.API_KEY,
        action: "services"
      },
      {
        timeout: 25000
      }
    );

    const services = response.data;

    if (!Array.isArray(services)) {
      return res.status(500).json({
        error: "Invalid provider response"
      });
    }

    // ================= TRACK STATS =================
    let added = 0;
    let updated = 0;
    let failed = 0;

    // ================= PROCESS SERVICES =================
    await Promise.all(
      services.map(async (s) => {
        try {
          const serviceId = s.service || s.id;

          if (!serviceId) {
            failed++;
            return;
          }

          const providerRate = Number(s.rate || 0);
          const profitMargin = 1.5; // default margin (you can change later)

          const sellingRate = calculateSellingPrice(providerRate, profitMargin);

          const existing = await Service.findOne({ serviceId });

          if (existing) {
            // ================= UPDATE EXISTING =================
            await Service.updateOne(
              { serviceId },
              {
                $set: {
                  name: s.name,
                  category: s.category,
                  rate: providerRate,
                  min: s.min,
                  max: s.max,
                  sellingRate: sellingRate
                }
              }
            );

            updated++;
          } else {
            // ================= CREATE NEW =================
            await Service.create({
              serviceId,
              name: s.name,
              category: s.category,
              rate: providerRate,
              min: s.min,
              max: s.max,
              profitMargin: profitMargin,
              sellingRate: sellingRate,
              status: "active"
            });

            added++;
          }
        } catch (err) {
          console.error("Service sync error:", err.message);
          failed++;
        }
      })
    );

    // ================= RESPONSE =================
    res.json({
      success: true,
      message: "Services sync completed",
      stats: {
        total: services.length,
        added,
        updated,
        failed
      }
    });

  } catch (error) {
    console.error("❌ SYNC ERROR:", {
      message: error.message,
      data: error.response?.data
    });

    res.status(500).json({
      error: "Sync failed",
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
