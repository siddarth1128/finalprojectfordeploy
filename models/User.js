const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
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
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "admin",
    },
  },
  {
    timestamps: true,
  },
);

// Index for faster queries (email already indexed via unique: true)
userSchema.index({ role: 1 });

module.exports = mongoose.model("User", userSchema);
