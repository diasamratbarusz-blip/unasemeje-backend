const providerManager = require("./providerManager");

// ================= PROFIT SETTINGS =================
const PROFIT_PERCENT = process.env.PROFIT_PERCENT || 20;

// ================= APPLY PROFIT =================
function applyProfit(rate) {
  return Number(rate) + (Number(rate) * PROFIT_PERCENT) / 100;
}

// ================= FORMAT SERVICES =================
function formatServices(services) {
  return services.map(s => ({
    serviceId: s.service || s.id,
    name: s.name,
    rate: applyProfit(s.rate || 0),
    min: s.min,
    max: s.max,
    category: s.category || "General",
  }));
}

// ================= SMART SERVICES =================
async function getServices() {
  const data = await providerManager.getServicesSmart();
  return formatServices(data || []);
}

// ================= SMART ORDER =================
async function placeOrder(data) {
  return await providerManager.createOrderSmart(data);
}

module.exports = {
  getServices,
  placeOrder,
};
