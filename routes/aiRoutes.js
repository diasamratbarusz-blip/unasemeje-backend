const express = require('express');
const router = express.Router();
const { getAIResponse } = require('../controllers/aiController');

// POST /api/support-bot
router.post('/support-bot', getAIResponse);

module.exports = router;
