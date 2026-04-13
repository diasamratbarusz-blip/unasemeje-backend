const express = require("express");
const router = express.Router();
const axios = require("axios");

// GET SERVICES FROM YOUR SMM PROVIDER
router.get("/", async (req, res) => {
  try {
    const response = await axios.post(process.env.API_URL, {
      key: process.env.API_KEY,
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
