const mongoose = require("mongoose");

const providerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    service_type: {
      type: String,
      required: true,
      enum: ["plumbing", "electrical", "carpentry", "appliance", "cleaning"],
    },
    experience: {
      type: Number,
      required: true,
      min: 0,
    },
    experience_unit: {
      type: String,
      enum: ["months", "years"],
      default: "years",
    },
    license_image: {
      type: String,
      default: null,
    },
    profile_image: {
      type: String,
      default: null,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    total_jobs: {
      type: Number,
      default: 0,
      min: 0,
    },
    pending_jobs: {
      type: Number,
      default: 0,
      min: 0,
    },
    completed_jobs: {
      type: Number,
      default: 0,
      min: 0,
    },
    total_earnings: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Index for faster queries (email already indexed via unique: true)
providerSchema.index({ service_type: 1 });

module.exports = mongoose.model("Provider", providerSchema);
