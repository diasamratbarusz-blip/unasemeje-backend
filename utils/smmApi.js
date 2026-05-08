const axios = require("axios");

// ================= CONFIG PROVIDER 1 =================
// Defaulting to Delixgains as your primary service provider
const API_URL_1 = process.env.SMM_API_URL || "https://delixgainske.com/api/v2";
const API_KEY_1 = process.env.SMM_API_KEY;

// ================= CONFIG PROVIDER 2 (SMM AFRICA) =================
const API_URL_2 = process.env.API_URL_PROVIDER2 || "https://smm.africa/api/v3";
const API_KEY_2 = process.env.API_KEY_PROVIDER2;

// ================= VALIDATION =================
// Critical for production stability
if (!API_KEY_1) console.error("❌ SMM_API_KEY (Provider 1) missing");
if (!API_KEY_2) console.error("❌ API_KEY_PROVIDER2 (Provider 2) missing");

// ================= DEBUG MODE =================
const DEBUG = true;

// ================= SAFE NORMALIZER =================
/**
 * Ensures the data returned from various API formats is 
 * converted into a standard array format for processing.
 */
function normalizeResponse(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === "object") {
    return Object.values(data).flat();
  }
  return [];
}

// ================= CORE REQUEST =================
/**
 * Core communication engine supporting both GET (Delixgains) 
 * and POST (SMM Africa) methods.
 */
async function request(params, providerNum = 1) {
  const url = providerNum === 2 ? API_URL_2 : API_URL_1;
  const key = providerNum === 2 ? API_KEY_2 : API_KEY_1;

  if (!key || !url) {
    console.error(`❌ API CONFIG ERROR FOR PROVIDER ${providerNum}`);
    return null;
  }

  try {
    let res;
    
    // Provider 2 (SMM Africa) prefers JSON POST
    if (providerNum === 2) {
      res = await axios.post(url, {
        key: key,
        ...params
      }, {
        timeout: 20000,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      // Provider 1 (Delixgains) uses the original GET method
      res = await axios.get(url, {
        params: {
          key: key,
          ...params
        },
        timeout: 20000
      });
    }

    if (DEBUG) {
      console.log(`📡 SMM REQUEST (P${providerNum}):`, params);
      console.log(`📥 SMM RESPONSE TYPE (P${providerNum}):`, typeof res.data);
    }

    return res.data;

  } catch (err) {
    console.error(`❌ SMM API ERROR (P${providerNum}):`);
    console.error(err?.response?.data || err.message);
    return null;
  }
}

// ================= SERVICES =================
/**
 * Fetches and maps services into a unified format for the database.
 */
async function getServices(providerNum = 1) {
  const data = await request({ action: "services" }, providerNum);
  const services = normalizeResponse(data);

  if (!services.length) {
    console.error(`❌ Empty services response from Provider ${providerNum}`);
    return [];
  }

  return services.map((s, i) => ({
    serviceId: String(s.service || s.id || `srv_${i}`),
    name: s.name || "Unnamed Service",
    rate: Number(s.rate || 0),
    min: Number(s.min || 1),
    max: Number(s.max || 10000),
    category: s.category || "Other",
    provider: providerNum // Track which provider this service belongs to
  }));
}

// ================= CREATE ORDER =================
/**
 * Submits new orders to the selected provider.
 */
async function createOrder(service, link, quantity, providerNum = 1) {
  if (!service || !link || !quantity) {
    console.error("❌ Missing order params");
    return null;
  }

  const payload = {
    action: "add",
    service,
    link,
    quantity
  };

  // SMM Africa v3 documentation suggests adding source_flow
  if (providerNum === 2) payload.source_flow = 'api_v3';

  return await request(payload, providerNum);
}

// ================= STATUS =================
async function getStatus(order, providerNum = 1) {
  return await request({
    action: "status",
    order
  }, providerNum);
}

// ================= MULTIPLE STATUS =================
/**
 * Efficiently checks multiple order statuses in a single call.
 */
async function getMultipleStatus(orders, providerNum = 1) {
  return await request({
    action: "status",
    orders: Array.isArray(orders) ? orders.join(",") : orders
  }, providerNum);
}

// ================= BALANCE =================
async function getBalance(providerNum = 1) {
  return await request({ action: "balance" }, providerNum);
}

// ================= REFILL =================
async function refill(order, providerNum = 1) {
  return await request({
    action: "refill",
    order
  }, providerNum);
}

// ================= CANCEL =================
async function cancel(order, providerNum = 1) {
  return await request({
    action: "cancel",
    order
  }, providerNum);
}

// ================= HEALTH CHECK =================
/**
 * Simple check to verify provider credentials are active.
 */
async function testConnection(providerNum = 1) {
  const res = await request({ action: "balance" }, providerNum);
  return !!res;
}

// ================= EXPORTS =================
module.exports = {
  getServices,
  createOrder,
  getStatus,
  getMultipleStatus,
  getBalance,
  refill,
  cancel,
  testConnection
};
