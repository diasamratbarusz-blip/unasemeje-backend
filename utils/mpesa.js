const axios = require("axios");

/**
 * =========================================================================
 * 1. SAFARICOM DIRECT MPESA FUNCTIONS
 * =========================================================================
 */

/**
 * GENERATE MPESA ACCESS TOKEN
 * Switches to production URL for live payments
 */
async function getToken() {
  try {
    const auth = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString("base64");

    const res = await axios.get(
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: { Authorization: `Basic ${auth}` }
      }
    );

    return res.data.access_token;
  } catch (error) {
    console.error("Mpesa Token Error:", error.response?.data || error.message);
    throw new Error("Failed to authenticate with M-Pesa");
  }
}

/**
 * INITIATE STK PUSH (Lipa Na M-Pesa Online)
 * @param {string} phone - User phone number (format: 2547XXXXXXXX)
 * @param {number} amount - Amount to charge
 */
async function stkPush(phone, amount) {
  try {
    const token = await getToken();

    // Generate Timestamp: YYYYMMDDHHMMSS
    const date = new Date();
    const timestamp =
      date.getFullYear() +
      ("0" + (date.getMonth() + 1)).slice(-2) +
      ("0" + date.getDate()).slice(-2) +
      ("0" + date.getHours()).slice(-2) +
      ("0" + date.getMinutes()).slice(-2) +
      ("0" + date.getSeconds()).slice(-2);

    // Generate Password: Base64(ShortCode + PassKey + Timestamp)
    const password = Buffer.from(
      process.env.MPESA_SHORTCODE +
      process.env.MPESA_PASSKEY +
      timestamp
    ).toString("base64");

    const requestBody = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline", // Use CustomerBuyGoodsOnline if using a Till Number
      Amount: Math.round(amount),
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.CALLBACK_URL,
      AccountReference: "UNASEMEJE",
      TransactionDesc: "Wallet Deposit"
    };

    const response = await axios.post(
      "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      requestBody,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    return response.data;
  } catch (error) {
    console.error("STK Push Error:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * =========================================================================
 * 2. PAYNECTA PAYMENT LINK STATUS VERIFICATION
 * =========================================================================
 */

/**
 * CHECK PAYNECTA TRANSACTION STATUS
 * This function hits Paynecta to verify if a user's payment reference is actually completed.
 * 
 * @param {string} transactionReference - The reference code from the payment link (e.g., ABCP20240803123456ABCD)
 * @returns {Promise<Object>} - The payment data if successful
 */
async function checkPaymentStatus(transactionReference) {
  try {
    // Ensure critical API details are present in environment variables
    if (!process.env.PAYNECTA_API_KEY || !process.env.PAYNECTA_EMAIL) {
      throw new Error("Missing PAYNECTA_API_KEY or PAYNECTA_EMAIL in server environment variables.");
    }

    const response = await axios.get("https://paynecta.co.ke/api/v1/payment/status", {
      params: {
        transaction_reference: transactionReference
      },
      headers: {
        "X-API-Key": process.env.PAYNECTA_API_KEY,
        "X-User-Email": process.env.PAYNECTA_EMAIL
      }
    });

    // Check if Paynecta successfully responded with data
    if (response.data && response.data.success) {
      return response.data.data; // This returns the inner "data" object containing status, amount, mpesa_receipt_number, etc.
    } else {
      throw new Error(response.data?.message || "Failed to retrieve transaction status from Paynecta.");
    }

  } catch (error) {
    console.error("❌ Paynecta Status Verification Error:", error.response?.data || error.message);
    throw error;
  }
}

// Export all functionalities so they are fully available to your server routes
module.exports = { 
  stkPush,
  checkPaymentStatus 
};
