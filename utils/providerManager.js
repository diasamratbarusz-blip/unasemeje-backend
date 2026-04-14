const axios = require("axios");

const PRIMARY_URL = process.env.API_URL;
const PRIMARY_KEY = process.env.API_KEY;

// optional backup provider
const BACKUP_URL = process.env.API_BACKUP_URL;
const BACKUP_KEY = process.env.API_BACKUP_KEY;

// ================= CALL PROVIDER =================
async function callProvider(url, key, action, extra = {}) {
  const response = await axios.post(
    url,
    {
      key,
      action,
      ...extra,
    },
    { timeout: 15000 }
  );

  return response.data;
}

// ================= SMART FETCH SERVICES =================
async function getServicesSmart() {
  try {
    return await callProvider(PRIMARY_URL, PRIMARY_KEY, "services");
  } catch (err) {
    console.log("⚠️ Primary failed, switching to backup...");

    if (!BACKUP_URL || !BACKUP_KEY) throw err;

    return await callProvider(BACKUP_URL, BACKUP_KEY, "services");
  }
}

// ================= SMART ORDER =================
async function createOrderSmart(data) {
  try {
    return await callProvider(PRIMARY_URL, PRIMARY_KEY, "add", data);
  } catch (err) {
    console.log("⚠️ Primary order failed, switching to backup...");

    if (!BACKUP_URL || !BACKUP_KEY) throw err;

    return await callProvider(BACKUP_URL, BACKUP_KEY, "add", data);
  }
}

// ================= SMART BALANCE =================
async function getBalanceSmart() {
  try {
    return await callProvider(PRIMARY_URL, PRIMARY_KEY, "balance");
  } catch (err) {
    if (!BACKUP_URL || !BACKUP_KEY) throw err;

    return await callProvider(BACKUP_URL, BACKUP_KEY, "balance");
  }
}

module.exports = {
  getServicesSmart,
  createOrderSmart,
  getBalanceSmart,
};
