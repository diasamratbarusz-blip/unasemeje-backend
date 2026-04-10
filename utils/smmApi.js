const axios = require("axios");

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

// SERVICE LIST
async function getServices() {
  const res = await axios.get(
    `${API_URL}?action=services&key=${API_KEY}`
  );
  return res.data;
}

// CREATE ORDER
async function createOrder(service, link, quantity) {
  const res = await axios.get(API_URL, {
    params: {
      action: "add",
      service,
      link,
      quantity,
      key: API_KEY
    }
  });

  return res.data;
}

// ORDER STATUS (single)
async function getStatus(order) {
  const res = await axios.get(API_URL, {
    params: {
      action: "status",
      order,
      key: API_KEY
    }
  });

  return res.data;
}

// MULTIPLE STATUS
async function getMultipleStatus(orders) {
  const res = await axios.get(API_URL, {
    params: {
      action: "status",
      orders: orders.join(","),
      key: API_KEY
    }
  });

  return res.data;
}

// BALANCE
async function getBalance() {
  const res = await axios.get(API_URL, {
    params: {
      action: "balance",
      key: API_KEY
    }
  });

  return res.data;
}

// REFILL
async function refill(order) {
  const res = await axios.get(API_URL, {
    params: {
      action: "refill",
      order,
      key: API_KEY
    }
  });

  return res.data;
}

// CANCEL ORDER
async function cancel(order) {
  const res = await axios.get(API_URL, {
    params: {
      action: "cancel",
      order,
      key: API_KEY
    }
  });

  return res.data;
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
