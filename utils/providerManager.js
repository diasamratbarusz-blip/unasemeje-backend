const axios = require("axios");

// Primary Provider (Original)
const PRIMARY_URL = process.env.API_URL;
const PRIMARY_KEY = process.env.API_KEY;

// Backup Provider (Original)
const BACKUP_URL = process.env.API_BACKUP_URL;
const BACKUP_KEY = process.env.API_BACKUP_KEY;

// Provider 2 (SMM Africa v3)
const PROVIDER2_URL = process.env.API_URL_PROVIDER2;
const PROVIDER2_KEY = process.env.API_KEY_PROVIDER2;

/**
 * =========================================
 * CALL PROVIDER
 * =========================================
 * Standard SMM Panels often use Form-Data.
 * SMM Africa (v3) uses JSON. This function handles both.
 */
async function callProvider(url, key, action, extra = {}, isJson = false) {
  if (!url || !key) {
    throw new Error("Provider URL or KEY missing in environment variables");
  }

  const payload = {
    key,
    action,
    ...extra,
  };

  const headers = isJson 
    ? { "Content-Type": "application/json" } 
    : { "Content-Type": "application/x-www-form-urlencoded" };

  // For Form-Data, we convert the object if not using JSON
  const data = isJson ? payload : new URLSearchParams(payload).toString();

  const response = await axios.post(url, data, { 
    timeout: 20000,
    headers: headers
  });

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
    console.log("⚠️ Primary failed, switching to backup/provider2...");
    try {
      // Try SMM Africa (Provider 2) first as a strong alternative
      if (PROVIDER2_URL && PROVIDER2_KEY) {
        const data = await callProvider(PROVIDER2_URL, PROVIDER2_KEY, "services", {}, true);
        return normalizeServices(data);
      }
      
      // Fallback to original backup if provider2 isn't set
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
    console.log("⚠️ Primary order failed, switching to backup/provider2...");
    try {
      // Try SMM Africa (Provider 2)
      if (PROVIDER2_URL && PROVIDER2_KEY) {
        return await callProvider(PROVIDER2_URL, PROVIDER2_KEY, "add", data, true);
      }

      if (!BACKUP_URL || !BACKUP_KEY) throw err;
      const res = await callProvider(BACKUP_URL, BACKUP_KEY, "add", data);
      if (!res || !res.order) throw new Error("Invalid order response from backup");
      return res;
    } catch (backupErr) {
      console.error("❌ Order failed on all providers:", backupErr.message);
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
    // Check Provider 2 Balance
    if (PROVIDER2_URL && PROVIDER2_KEY) {
      return await callProvider(PROVIDER2_URL, PROVIDER2_KEY, "balance", {}, true);
    }
    
    if (!BACKUP_URL || !BACKUP_KEY) throw err;
    return await callProvider(BACKUP_URL, BACKUP_KEY, "balance");
  }
}

// ================= HEALTH CHECK =================
async function checkProviderHealth() {
  const status = { primary: false, provider2: false };
  try {
    const res = await callProvider(PRIMARY_URL, PRIMARY_KEY, "balance");
    status.primary = true;
  } catch (e) {
    status.primary = false;
  }

  try {
    if (PROVIDER2_URL && PROVIDER2_KEY) {
      await callProvider(PROVIDER2_URL, PROVIDER2_KEY, "balance", {}, true);
      status.provider2 = true;
    }
  } catch (e) {
    status.provider2 = false;
  }
  return status;
}

module.exports = {
  getServicesSmart,
  createOrderSmart,
  getBalanceSmart,
  checkProviderHealth,
  // Export direct access to Provider 2 if needed
  callProvider2: (action, extra) => callProvider(PROVIDER2_URL, PROVIDER2_KEY, action, extra, true)
};
