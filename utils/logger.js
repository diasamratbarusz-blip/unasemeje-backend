const fs = require("fs");
const path = require("path");

/**
 * =========================================
 * LOGGER UTILITY - UNASEMEJE ø DIA
 * =========================================
 * Handles console output and persistent file logging 
 * for debugging provider errors (Delixgains/SMM Africa)
 * and payment transaction issues.
 */

// Define logs directory and file
const logDir = path.join(__dirname, "../logs");
const logFile = path.join(logDir, "app.log");

// Ensure logs folder exists safely
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (dirError) {
  console.warn("⚠️ Warning: Local disk directory creation skipped. Running in read-only environment.");
}

/**
 * Main Logging Function
 * @param {string} message - The message to log
 * @param {string} level - Log level: INFO, ERROR, WARN (Default: INFO)
 */
function log(message, level = "INFO") {
  // Use Nairobi time for accurate local business tracking
  const time = new Date().toLocaleString("en-KE", { 
    timeZone: "Africa/Nairobi",
    dateStyle: "short",
    timeStyle: "medium"
  });
  
  // Format: [5/8/2026, 10:20:00 PM] [ERROR] Message content
  const formattedMessage = `[${time}] [${level.toUpperCase()}] ${message}\n`;

  // Print to terminal for real-time monitoring (Render live log stream)
  if (level.toUpperCase() === "ERROR") {
    console.error(`❌ ${formattedMessage.trim()}`);
  } else if (level.toUpperCase() === "WARN") {
    console.warn(`⚠️ ${formattedMessage.trim()}`);
  } else {
    console.log(`📡 ${formattedMessage.trim()}`);
  }

  // Append to the local log file for persistent debugging
  try {
    fs.appendFileSync(logFile, formattedMessage);
  } catch (err) {
    /**
     * Fallback handling for cloud hosting (Render):
     * If disk is non-persistent or read-only, we do not throw unhandled rejections
     * so your critical app execution or payment webhook stays alive.
     */
    return; 
  }
}

/**
 * Helper methods for cleaner syntax:
 * Usage: log.error("Payment Failed") or log.warn("API Slow")
 */
log.error = (message) => log(message, "ERROR");
log.warn = (message) => log(message, "WARN");
log.info = (message) => log(message, "INFO");

module.exports = log;
