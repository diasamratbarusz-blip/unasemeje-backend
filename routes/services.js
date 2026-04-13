const express = require("express");
const router = express.Router();
const axios = require("axios");

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

// GET SERVICES
router.get("/", async (req, res) => {
  try {
    const response = await axios.post(API_URL, {
      key: API_KEY,
      action: "services"
    });

    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: "Failed to load services",
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
