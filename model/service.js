const mongoose = require("mongoose");

const ServiceSchema = new mongoose.Schema(
  {
    serviceId: {
      type: String,
      required: true,
      unique: true
    },

    name: {
      type: String,
      required: true
    },

    category: {
      type: String,
      required: true
    },

    rate: {
      type: Number,
      required: true,
      min: 0
    },

    min: {
      type: Number,
      default: 1
    },

    max: {
      type: Number,
      default: 1000000
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Service", ServiceSchema);
