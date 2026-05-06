const express = require("express");
const router = express.Router();
const axios = require("axios");

const Service = require("../models/Service");
const { calculateSellingPrice } = require("../utils/priceCalculator");

/**
 * =========================================
 * SYNC SERVICES ROUTE (UNASEMEJE ø DIA)
 * =========================================
 * This endpoint manual triggers a full sync:
 * - Fetches fresh data from the SMM provider.
 * - Updates existing rates in the database.
 * - Adds any new services launched by the provider.
 * - Automatically applies your profit margins to KES rates.
 */

router.get("/", async (req, res) => {
  try {
    // ================= VALIDATION =================
    // Ensure credentials for Delixgains or SMM Africa are set
    if (!process.env.API_URL || !process.env.API_KEY) {
      return res.status(500).json({
        success: false,
        error: "API configuration missing in environment variables"
      });
    }

    // ================= FETCH PROVIDER SERVICES =================
    // Using a POST request as required by most SMM reseller APIs
    const response = await axios.post(
      process.env.API_URL,
      {
        key: process.env.API_KEY,
        action: "services"
      },
      {
        timeout: 25000 // Extended timeout for large service lists
      }
    );

    const services = response.data;

    if (!Array.isArray(services)) {
      return res.status(500).json({
        success: false,
        error: "Invalid provider response. Expected an array of services."
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
          const serviceId = String(s.service || s.id);

          if (!serviceId) {
            failed++;
            return;
          }

          const providerRate = Number(s.rate || 0);
          
          /**
           * PROFIT MARGIN LOGIC
           * 1.5 means you are charging 50% more than the provider cost.
           * Adjust this value based on your business strategy for the Kenyan market.
           */
          const profitMargin = 1.5; 

          // Convert provider rate to your selling rate using the utility
          const sellingRate = calculateSellingPrice(providerRate, profitMargin);

          // Check if service already exists in UNASEMEJE database
          const existing = await Service.findOne({ serviceId });

          if (existing) {
            // ================= UPDATE EXISTING =================
            await Service.updateOne(
              { serviceId },
              {
                $set: {
                  name: s.name,
                  category: s.category,
                  rate: providerRate, // Base cost
                  min: s.min,
                  max: s.max,
                  sellingRate: sellingRate // Price shown to users
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
          console.error(`Sync error for service ${s.service || 'unknown'}:`, err.message);
          failed++;
        }
      })
    );

    // ================= RESPONSE =================
    res.json({
      success: true,
      message: "UNASEMEJE Service Sync Completed",
      stats: {
        total: services.length,
        added,
        updated,
        failed
      }
    });

  } catch (error) {
    console.error("❌ GLOBAL SYNC ERROR:", {
      message: error.message,
      data: error.response?.data
    });

    res.status(500).json({
      success: false,
      error: "Sync failed due to connection or provider error",
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
