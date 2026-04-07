const fs = require("fs");
const path = require("path");

const logFile = path.join(__dirname, "../logs/app.log");

function log(message) {
  const time = new Date().toISOString();
  const data = `[${time}] ${message}\n`;

  console.log(data);
  fs.appendFileSync(logFile, data);
}

module.exports = log;
