const axios = require("axios");

const PRIMARY_URL = process.env.API_URL;
const PRIMARY_KEY = process.env.API_KEY;

// optional backup provider
const BACKUP_URL = process.env.API_BACKUP_URL;
const BACKUP_KEY = process.env.API_BACKUP_KEY;

// ================= CALL PROVIDER =================
async function callProvider(url, key, action, extra = {}) {
  if (!url || !key) {
    throw new Error("Provider URL or KEY missing in environment variables");
  }

  const response = await axios.post(
    url,
    {
      key,
      action,
      ...extra,
    },
    { timeout: 20000 }
  );

  return response.data;
}

// ================= NORMALIZE RESPONSE =================
function normalizeServices(data) {
  if (!data) return [];

  if (Array.isArray(data)) return data;

  if (typeof data === "object") {
    return Object.values(data).flat();
  }

  return [];
}

// ================= SMART FETCH SERVICES =================
async function getServicesSmart() {
  try {
    const data = await callProvider(PRIMARY_URL, PRIMARY_KEY, "services");

    const services = normalizeServices(data);

    if (!services.length) {
      throw new Error("Primary provider returned empty services");
    }

    return services;
  } catch (err) {
    console.log("⚠️ Primary failed, switching to backup...");

    try {
      if (!BACKUP_URL || !BACKUP_KEY) throw err;

      const data = await callProvider(BACKUP_URL, BACKUP_KEY, "services");

      return normalizeServices(data);
    } catch (backupErr) {
      console.error("❌ Both providers failed:", backupErr.message);
      throw backupErr;
    }
  }
}

// ================= SMART ORDER =================
async function createOrderSmart(data) {
  try {
    const res = await callProvider(PRIMARY_URL, PRIMARY_KEY, "add", data);

    if (!res || !res.order) {
      throw new Error("Invalid order response from primary");
    }

    return res;

  } catch (err) {
    console.log("⚠️ Primary order failed, switching to backup...");

    try {
      if (!BACKUP_URL || !BACKUP_KEY) throw err;

      const res = await callProvider(BACKUP_URL, BACKUP_KEY, "add", data);

      if (!res || !res.order) {
        throw new Error("Invalid order response from backup");
      }

      return res;

    } catch (backupErr) {
      console.error("❌ Order failed on both providers:", backupErr.message);
      throw backupErr;
    }
  }
}

// ================= SMART BALANCE =================
async function getBalanceSmart() {
  try {
    const res = await callProvider(PRIMARY_URL, PRIMARY_KEY, "balance");

    if (!res) throw new Error("Invalid balance response");

    return res;

  } catch (err) {
    if (!BACKUP_URL || !BACKUP_KEY) throw err;

    const res = await callProvider(BACKUP_URL, BACKUP_KEY, "balance");

    return res;
  }
}

// ================= HEALTH CHECK =================
async function checkProviderHealth() {
  try {
    const res = await callProvider(PRIMARY_URL, PRIMARY_KEY, "balance");
    return { primary: true, response: res };
  } catch (e) {
    return { primary: false, error: e.message };
  }
}

module.exports = {
  getServicesSmart,
  createOrderSmart,
  getBalanceSmart,
  checkProviderHealth
};
