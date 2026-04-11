const axios = require("axios");

// ================= CONFIG =================
const API_URL =
  process.env.SMM_API_URL || "https://delixgainske.com/api/v2";

const API_KEY = process.env.SMM_API_KEY;

// ================= VALIDATION =================
if (!API_KEY) {
  console.error("❌ SMM_API_KEY missing in environment variables");
}

if (!API_URL) {
  console.error("❌ SMM_API_URL missing in environment variables");
}

// ================= DEBUG MODE =================
const DEBUG = true;

// ================= CORE REQUEST =================
async function request(params) {
  if (!API_KEY || !API_URL) {
    console.error("❌ API CONFIG ERROR");
    return null;
  }

  try {
    const res = await axios.get(API_URL, {
      params: {
        key: API_KEY,
        ...params
      },
      timeout: 20000
    });

    if (DEBUG) {
      console.log("📡 SMM REQUEST:", params);
      console.log("📥 SMM RESPONSE:", res.data);
    }

    return res.data;

  } catch (err) {
    console.error("❌ SMM API ERROR:");
    console.error(err?.response?.data || err.message);

    return null;
  }
}

// ================= SERVICES =================
async function getServices() {
  const data = await request({ action: "services" });

  if (!data || !Array.isArray(data)) {
    console.error("❌ Invalid services response from provider");
    return [];
  }

  return data;
}

// ================= CREATE ORDER =================
async function createOrder(service, link, quantity) {
  if (!service || !link || !quantity) {
    console.error("❌ Missing order params");
    return null;
  }

  return await request({
    action: "add",
    service,
    link,
    quantity
  });
}

// ================= STATUS =================
async function getStatus(order) {
  return await request({
    action: "status",
    order
  });
}

// ================= MULTIPLE STATUS =================
async function getMultipleStatus(orders) {
  return await request({
    action: "status",
    orders: Array.isArray(orders)
      ? orders.join(",")
      : orders
  });
}

// ================= BALANCE =================
async function getBalance() {
  return await request({ action: "balance" });
}

// ================= REFILL =================
async function refill(order) {
  return await request({
    action: "refill",
    order
  });
}

// ================= CANCEL =================
async function cancel(order) {
  return await request({
    action: "cancel",
    order
  });
}

// ================= EXPORTS =================
module.exports = {
  getServices,
  createOrder,
  getStatus,
  getMultipleStatus,
  getBalance,
  refill,
  cancel
};
