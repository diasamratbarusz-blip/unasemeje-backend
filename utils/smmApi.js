const axios = require("axios");

// ================= CONFIG =================
// Use environment variables (RENDER SAFE)
const API_URL = process.env.SMM_API_URL || "https://delixgainske.com/api/v2";
const API_KEY = process.env.SMM_API_KEY;

// ================= VALIDATE ENV =================
if (!API_KEY) {
  console.error("❌ Missing SMM_API_KEY in environment variables");
}

if (!API_URL) {
  console.error("❌ Missing SMM_API_URL in environment variables");
}

// ================= CORE REQUEST HANDLER =================
async function request(params) {
  try {
    const res = await axios.get(API_URL, {
      params: {
        key: API_KEY,
        ...params
      },
      timeout: 15000
    });

    return res.data;

  } catch (err) {
    console.error(
      "❌ SMM API ERROR:",
      err?.response?.data || err.message
    );
    return null;
  }
}

// ================= SERVICES =================
async function getServices() {
  return await request({ action: "services" });
}

// ================= CREATE ORDER =================
async function createOrder(service, link, quantity) {
  if (!service || !link || !quantity) {
    throw new Error("Missing order parameters");
  }

  return await request({
    action: "add",
    service,
    link,
    quantity
  });
}

// ================= ORDER STATUS =================
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
    orders: Array.isArray(orders) ? orders.join(",") : orders
  });
}

// ================= BALANCE =================
async function getBalance() {
  return await request({
    action: "balance"
  });
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

module.exports = {
  getServices,
  createOrder,
  getStatus,
  getMultipleStatus,
  getBalance,
  refill,
  cancel
};
