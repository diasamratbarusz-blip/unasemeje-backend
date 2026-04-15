/**
 * PRICE CALCULATOR (SMM PANEL CORE LOGIC)
 * ---------------------------------------
 * Formula used:
 * sellingRate = providerRate × profitMargin
 */

/**
 * Calculate final selling price for a service
 *
 * @param {number} providerRate - Cost from provider (e.g 0.002)
 * @param {number} profitMargin - Your multiplier (e.g 2 = 100% profit)
 * @returns {number} selling price
 */
function calculateSellingPrice(providerRate, profitMargin = 1.5) {
  if (!providerRate || providerRate < 0) return 0;

  if (!profitMargin || profitMargin < 1) {
    profitMargin = 1; // safety fallback (no profit loss)
  }

  const sellingRate = providerRate * profitMargin;

  // round to 6 decimals (important for SMM APIs)
  return Math.round(sellingRate * 1000000) / 1000000;
}

/**
 * Calculate profit amount per order
 *
 * @param {number} sellingRate
 * @param {number} providerRate
 * @param {number} quantity
 */
function calculateProfit(sellingRate, providerRate, quantity) {
  const profitPerUnit = sellingRate - providerRate;
  return profitPerUnit * quantity;
}

/**
 * Calculate total user charge
 *
 * @param {number} sellingRate
 * @param {number} quantity
 */
function calculateTotal(sellingRate, quantity) {
  return sellingRate * quantity;
}

module.exports = {
  calculateSellingPrice,
  calculateProfit,
  calculateTotal
};
