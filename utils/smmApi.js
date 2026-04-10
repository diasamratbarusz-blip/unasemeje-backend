const axios = require("axios");

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

// 🔒 Validate ENV
if (!API_URL || !API_KEY) {
  console.error("❌ Missing API_URL or API_KEY in environment variables");
}

// 🔁 Helper function (central request handler)
async function request(params) {
  try {
    const res = await axios.get(API_URL, {
      params: {
        key: API_KEY,
        ...params
      },
      timeout: 10000
    });

    return res.data;

  } catch (err) {
    console.error("❌ SMM API ERROR:", err?.response?.data || err.message);
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

// ================= SINGLE STATUS =================
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
