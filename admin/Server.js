require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoURI =
      process.env.MONGODB_URI || "mongodb://localhost:27017/fixitnow_2";

    await mongoose.connect(mongoURI);

    console.log("MongoDB connected successfully");

    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.log("MongoDB disconnected");
    });

    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      console.log("MongoDB connection closed through app termination");
      process.exit(0);
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

// User Schema
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

const User = mongoose.model("User", userSchema);

// Connect to MongoDB
connectDB();

// Admin registration endpoint
// Requires body: { name, email, password, adminSecret }
// adminSecret must match process.env.ADMIN_SECRET
app.post("/register", async (req, res) => {
  try {
    const { name, email, password, adminSecret } = req.body;

    if (!name || !email || !password || !adminSecret) {
      return res.status(400).json({
        message: "All fields required (name, email, password, adminSecret).",
      });
    }

    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({
        message: "Invalid admin secret — registration denied.",
      });
    }

    // Check if email exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        message: "Email already registered.",
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashed,
      role: "admin",
    });

    await newUser.save();

    res.json({
      message: "Admin registered successfully.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error during registration.",
    });
  }
});

// Admin login endpoint
// Accepts { email, password }
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required.",
      });
    }

    const user = await User.findOne({ email }).select(
      "id name email password role",
    );

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials.",
      });
    }

    // Role-based restriction: only admins allowed
    if (user.role !== "admin") {
      return res.status(403).json({
        message: "Access denied. Not an admin.",
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({
        message: "Invalid credentials.",
      });
    }

    // For demonstration we'll just return a success + minimal profile.
    // In production you should create a session or JWT and use HTTPS.
    res.json({
      message: "Login successful.",
      admin: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error during login.",
    });
  }
});

// Simple protected admin-only route example
app.get("/admin/dashboard", async (req, res) => {
  // In a real app you'd check a session or JWT.
  res.json({
    message:
      "This is a placeholder admin dashboard endpoint (requires auth in real app).",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
