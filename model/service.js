const mongoose = require("mongoose");

const ServiceSchema = new mongoose.Schema({
  serviceId: String,     // SMM Africa service ID
  name: String,
  category: String,
  rate: Number          // price per 1000 or per unit
});

module.exports = mongoose.model("Service", ServiceSchema);
