// ================= SERVICE MODEL =================
const mongoose = require("mongoose");

const ServiceSchema = new mongoose.Schema(
  {
    serviceId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      default: "Unnamed Service",
      trim: true
    },

    category: {
      type: String,
      default: "Other",
      index: true
    },

    rate: {
      type: Number,
      required: true,
      default: 0
    },

    sellingRate: {
      type: Number,
      default: 0
    },

    min: {
      type: Number,
      default: 1
    },

    max: {
      type: Number,
      default: 1000000
    },

    platform: {
      type: String,
      default: "Other",
      index: true
    },

    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active"
    }

  },
  { timestamps: true }
);

module.exports = mongoose.model("Service", ServiceSchema);
