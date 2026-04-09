const axios = require("axios");

const API_URL = process.env.SMM_API_URL;
const API_KEY = process.env.SMM_API_KEY;

async function apiRequest(data) {
  const res = await axios.post(API_URL, {
    key: API_KEY,
    ...data
  });
  return res.data;
}

exports.getServices = () => apiRequest({ action: "services" });

exports.placeOrder = (service, link, quantity) =>
  apiRequest({
    action: "add",
    service,
    link,
    quantity
  });

exports.getStatus = (order) =>
  apiRequest({
    action: "status",
    order
  });
