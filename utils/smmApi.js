const fetch = require("node-fetch");

const API_URL = "https://smm.africa/api/v3";
const API_KEY = process.env.SMM_API_KEY; // store in env

async function smmRequest(data) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      key: API_KEY,
      ...data
    })
  });

  return await res.json();
}

module.exports = smmRequest;
