const fs = require("fs");
const path = require("path");

// Define logs directory and file
const logDir = path.join(__dirname, "../logs");
const logFile = path.join(logDir, "app.log");

// Ensure logs folder exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function log(message) {
  const time = new Date().toISOString();
  const data = `[${time}] ${message}\n`;

  console.log(data);

  try {
    fs.appendFileSync(logFile, data);
  } catch (err) {
    console.error("Logging error:", err);
  }
}

module.exports = log;
