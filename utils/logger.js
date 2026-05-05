const fs = require("fs");
const path = require("path");

/**
 * =========================================
 * LOGGER UTILITY - UNASEMEJE ø DIA
 * =========================================
 * This utility handles both console output and
 * persistent file logging for debugging provider
 * errors and transaction issues.
 */

// Define logs directory and file
const logDir = path.join(__dirname, "../logs");
const logFile = path.join(logDir, "app.log");

// Ensure logs folder exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Main Logging Function
 * @param {string} message - The message to log
 * @param {string} level - Log level: INFO, ERROR, WARN (Default: INFO)
 */
function log(message, level = "INFO") {
  const time = new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  
  // Format: [2026-05-05 20:44:00] [ERROR] Message content
  const formattedMessage = `[${time}] [${level.toUpperCase()}] ${message}\n`;

  // Print to terminal for real-time monitoring
  if (level.toUpperCase() === "ERROR") {
    console.error(formattedMessage);
  } else if (level.toUpperCase() === "WARN") {
    console.warn(formattedMessage);
  } else {
    console.log(formattedMessage);
  }

  // Append to the local log file
  try {
    fs.appendFileSync(logFile, formattedMessage);
  } catch (err) {
    console.error("CRITICAL: Failed to write to log file:", err);
  }
}

// Custom helper for error-specific logging
log.error = (message) => log(message, "ERROR");
log.warn = (message) => log(message, "WARN");

module.exports = log;
