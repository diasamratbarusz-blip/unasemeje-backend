/**
 * PRICE CALCULATOR (SMM PANEL CORE LOGIC)
 * ---------------------------------------
 * FINAL RULE:
 * Provider Rate + Fixed Markup = Selling Price
 */

/* ================= FIXED MARKUP SYSTEM ================= */
function getMarkup(name = "") {
  const text = String(name).toLowerCase();

  if (text.includes("like")) return 30;
  if (text.includes("follower")) return 20;
  if (text.includes("view")) return 40;
  if (text.includes("save") || text.includes("saved")) return 40;

  return 40; // default markup
}

/* ================= SAFETY CLEAN ================= */
function safeNumber(value) {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

/* ================= CALCULATE SELLING PRICE ================= */
function calculateSellingPrice(providerRate, serviceName = "") {
  providerRate = safeNumber(providerRate);

  if (providerRate <= 0) return 0;

  const markup = getMarkup(serviceName);

  const finalPrice = providerRate + markup;

  return Math.round(finalPrice * 1000000) / 1000000;
}

/* ================= CALCULATE PRICE PER QUANTITY ================= */
function calculateTotalPrice(providerRate, quantity, serviceName = "") {
  providerRate = safeNumber(providerRate);
  quantity = safeNumber(quantity);

  const sellingRate = calculateSellingPrice(providerRate, serviceName);

  // SMM standard: per 1000 units
  return (sellingRate / 1000) * quantity;
}

/* ================= PROFIT CALCULATION ================= */
function calculateProfit(providerRate, quantity, serviceName = "") {
  providerRate = safeNumber(providerRate);
  quantity = safeNumber(quantity);

  const sellingRate = calculateSellingPrice(providerRate, serviceName);

  const profitPerUnit = sellingRate - providerRate;

  return profitPerUnit * quantity;
}

/* ================= BULK SAFE CALCULATION ================= */
function calculateOrder(providerRate, quantity, serviceName = "") {
  const sellingRate = calculateSellingPrice(providerRate, serviceName);
  const total = calculateTotalPrice(providerRate, quantity, serviceName);
  const profit = calculateProfit(providerRate, quantity, serviceName);

  return {
    providerRate,
    sellingRate,
    quantity,
    total,
    profit
  };
}

module.exports = {
  calculateSellingPrice,
  calculateTotalPrice,
  calculateProfit,
  calculateOrder
};
