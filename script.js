const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");

const app = express();
const PORT = 9000;

// Import database connection
const connectDB = require("./config/database");

// Import models
const Provider = require("./models/Provider");
const Job = require("./models/Job");
const Transaction = require("./models/Transaction");
const Service = require("./models/Service");
const User = require("./models/User");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use(express.static("welcome"));
app.use('/admin', express.static('admin'));
app.use('/user', express.static('user'));
app.use('/service', express.static('service'));

// Route to serve welcome.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'welcome', 'welcome.html'));
});

// Admin login endpoint
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find admin user
    const user = await User.findOne({ email, role: "admin" });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    console.log("Admin login successful:", user.name);

    // Return user data (without password)
    res.json({
      success: true,
      message: "Login successful",
      admin: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Connect to MongoDB
connectDB();

// In-memory storage for legacy endpoints (replace with database in production)
let providers = [];
let bookings = [];

// Helper function to generate unique IDs
const generateId = () => Date.now().toString();

// Register provider endpoint (legacy in-memory version)
app.post("/provider/register", async (req, res) => {
  try {
    const { name, phone, email, service_type, experience, password } = req.body;

    console.log("Registration attempt:", { name, email, service_type });

    // Validation
    if (
      !name ||
      !phone ||
      !email ||
      !service_type ||
      !experience ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Check if provider already exists
    if (providers.find((p) => p.email === email)) {
      return res.status(400).json({
        success: false,
        message: "Provider with this email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Calculate dynamic pricing based on experience
    const basePrice = 70;
    const experienceBonus = parseInt(experience) * 5;
    const hourlyRate = basePrice + experienceBonus;

    // Create new provider
    const newProvider = {
      id: generateId(),
      name,
      phone,
      email,
      service_type,
      experience: parseInt(experience),
      password: hashedPassword,
      rating: 4.5, // Default rating
      reviews: Math.floor(Math.random() * 100) + 1, // Random reviews for demo
      price: `$${hourlyRate}/hr`,
      description: `Professional ${service_type} services with ${experience} years of experience. Licensed and insured professional.`,
      features: ["Licensed", "Insured", "24/7 Available", "Free Estimate"],
      initials: name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase(),
      is_available: true,
      date_registered: new Date().toISOString(),
    };

    providers.push(newProvider);

    console.log("Provider registered successfully:", newProvider.name);
    console.log("Total providers:", providers.length);

    res.status(201).json({
      success: true,
      message: "Provider registered successfully",
      provider: {
        id: newProvider.id,
        name: newProvider.name,
        email: newProvider.email,
        service_type: newProvider.service_type,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Database Provider Registration Endpoint (MongoDB)
app.post(
  "/provider/db/register",
  upload.fields([
    { name: "licenseImage", maxCount: 1 },
    { name: "photoImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        service_type,
        experience,
        experience_unit,
        password,
      } = req.body;

      // Validate required fields
      if (
        !name ||
        !email ||
        !phone ||
        !service_type ||
        !experience ||
        !experience_unit ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          message: "All fields are required",
        });
      }

      // Check if email already exists
      const existingProvider = await Provider.findOne({ email });
      if (existingProvider) {
        return res.status(409).json({
          success: false,
          message: "Email already registered",
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Handle file uploads
      const licenseImage =
        req.files && req.files["licenseImage"]
          ? req.files["licenseImage"][0].filename
          : null;
      const profileImage =
        req.files && req.files["photoImage"]
          ? req.files["photoImage"][0].filename
          : null;

      // Create new provider
      const newProvider = new Provider({
        name,
        email,
        phone,
        service_type,
        experience,
        experience_unit,
        license_image: licenseImage,
        profile_image: profileImage,
        password: hashedPassword,
      });

      await newProvider.save();

      res.status(201).json({
        success: true,
        message: "Provider registered successfully",
        providerId: newProvider._id,
      });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({
        success: false,
        message: "Server error during registration",
      });
    }
  },
);

// Login provider endpoint (legacy in-memory version)
app.post("/provider/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("Login attempt:", email);

    // Find provider
    const provider = providers.find((p) => p.email === email);

    if (!provider) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, provider.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    console.log("Login successful:", provider.name);

    res.json({
      success: true,
      message: "Login successful",
      provider: {
        id: provider.id,
        name: provider.name,
        email: provider.email,
        service_type: provider.service_type,
        phone: provider.phone,
        experience: provider.experience,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Database Provider Login Endpoint (MongoDB)
app.post("/provider/db/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find provider by email
    const provider = await Provider.findOne({ email });

    if (!provider) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, provider.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Return provider data (without password)
    res.json({
      success: true,
      message: "Login successful",
      provider: {
        id: provider._id,
        name: provider.name,
        email: provider.email,
        service_type: provider.service_type,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
});

// Get Provider Dashboard Data (MongoDB)
app.get("/provider/dashboard/:id", async (req, res) => {
  try {
    const providerId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID",
      });
    }

    // Get provider info
    const provider = await Provider.findById(providerId).select(
      "name service_type rating total_jobs pending_jobs completed_jobs total_earnings",
    );

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider not found",
      });
    }

    // Get today's appointments count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAppointments = await Job.countDocuments({
      provider_id: providerId,
      date: { $gte: today, $lt: tomorrow },
    });

    // Get recent jobs (last 5)
    const jobs = await Job.find({ provider_id: providerId })
      .select("customer_name service_type date status")
      .sort({ date: -1 })
      .limit(5);

    // Get recent transactions (last 5)
    const transactions = await Transaction.find({ provider_id: providerId })
      .select("service customer_name amount date")
      .sort({ date: -1 })
      .limit(5);

    // Calculate monthly earnings for chart (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyEarnings = await Transaction.aggregate([
      {
        $match: {
          provider_id: new mongoose.Types.ObjectId(providerId),
          date: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
          },
          total: { $sum: "$amount" },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
    ]);

    res.json({
      success: true,
      provider: {
        name: provider.name,
        service_type: provider.service_type,
        rating: provider.rating,
        total_jobs: provider.total_jobs,
        pending_jobs: provider.pending_jobs,
        completed_jobs: provider.completed_jobs,
        total_earnings: provider.total_earnings,
        today_appointments: todayAppointments,
      },
      recentJobs: jobs,
      recentTransactions: transactions,
      monthlyEarnings: monthlyEarnings.map((item) => ({
        year: item._id.year,
        month: item._id.month,
        total: item.total,
      })),
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching dashboard data",
    });
  }
});

// Get Provider Profile (MongoDB)
app.get("/provider/profile/:id", async (req, res) => {
  try {
    const providerId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID",
      });
    }

    const provider = await Provider.findById(providerId).select("-password");

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider not found",
      });
    }

    res.json({
      success: true,
      profile: provider,
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching profile",
    });
  }
});

// Update Provider Profile (MongoDB)
app.put("/provider/profile/:id", async (req, res) => {
  try {
    const providerId = req.params.id;
    const { name, email, phone, service_type, experience, bio } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID",
      });
    }

    // Check if email is already used by another provider
    if (email) {
      const existingProvider = await Provider.findOne({
        email,
        _id: { $ne: providerId },
      });

      if (existingProvider) {
        return res.status(409).json({
          success: false,
          message: "Email already in use",
        });
      }
    }

    // Build update object dynamically based on provided fields
    const updateFields = {};

    if (name) updateFields.name = name;
    if (email) updateFields.email = email;
    if (phone) updateFields.phone = phone;
    if (service_type) updateFields.service_type = service_type;
    if (experience) updateFields.experience = experience;

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    const result = await Provider.findByIdAndUpdate(
      providerId,
      { $set: updateFields },
      { new: true, runValidators: true },
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Provider not found",
      });
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({
      success: false,
      message: "Server error updating profile",
    });
  }
});

// Get Provider Jobs (MongoDB)
app.get("/provider/jobs/:id", async (req, res) => {
  try {
    const providerId = req.params.id;
    const { status } = req.query;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID",
      });
    }

    const query = { provider_id: providerId };

    if (status && status !== "all") {
      query.status = status;
    }

    const jobs = await Job.find(query).sort({ date: -1 });

    res.json({
      success: true,
      jobs: jobs,
    });
  } catch (err) {
    console.error("Jobs error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching jobs",
    });
  }
});

// Update Job Status (MongoDB)
app.put("/provider/jobs/:jobId", async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID",
      });
    }

    // First get the job to know the provider ID
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    const providerId = job.provider_id;

    // Update the job status
    const updateFields = { status };
    if (notes) updateFields.description = notes;

    await Job.findByIdAndUpdate(jobId, { $set: updateFields });

    // Update provider stats based on status change
    if (status === "completed") {
      await Provider.findByIdAndUpdate(providerId, {
        $inc: { completed_jobs: 1, pending_jobs: -1 },
      });

      // Add to transactions when job is completed
      if (job.amount) {
        const newTransaction = new Transaction({
          provider_id: providerId,
          service: job.service_type,
          customer_name: job.customer_name,
          amount: job.amount,
          date: new Date(),
        });
        await newTransaction.save();

        // Update total earnings
        await Provider.findByIdAndUpdate(providerId, {
          $inc: { total_earnings: job.amount },
        });
      }
    } else if (status === "in progress") {
      await Provider.findByIdAndUpdate(providerId, {
        $inc: { pending_jobs: -1 },
      });
    } else if (status === "pending") {
      await Provider.findByIdAndUpdate(providerId, {
        $inc: { pending_jobs: 1 },
      });
    }

    res.json({
      success: true,
      message: "Job status updated successfully",
    });
  } catch (err) {
    console.error("Job update error:", err);
    res.status(500).json({
      success: false,
      message: "Server error updating job",
    });
  }
});

// ------------------- Services APIs -------------------

// Get all services of a provider (MongoDB)
app.get("/provider/services", async (req, res) => {
  try {
    const providerId = req.query.provider_id;
    if (!providerId) {
      return res.status(400).json({
        success: false,
        message: "provider_id is required",
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID",
      });
    }

    const services = await Service.find({ provider_id: providerId });

    res.json({
      success: true,
      services: services,
    });
  } catch (err) {
    console.error("Error fetching services:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching services",
    });
  }
});

// Add a new service (MongoDB)
app.post("/provider/services", async (req, res) => {
  try {
    const { provider_id, name, description, price, availability } = req.body;

    if (!provider_id || !name || !price) {
      return res.status(400).json({
        success: false,
        message: "provider_id, name, and price are required",
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(provider_id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID",
      });
    }

    const newService = new Service({
      provider_id,
      name,
      description,
      price,
      availability: availability || "available",
    });

    await newService.save();

    res.status(201).json({
      success: true,
      message: "Service added successfully",
      serviceId: newService._id,
    });
  } catch (err) {
    console.error("Error adding service:", err);
    res.status(500).json({
      success: false,
      message: "Server error adding service",
    });
  }
});

// Update a service (MongoDB)
app.put("/provider/services/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, availability } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
    }

    const result = await Service.findByIdAndUpdate(
      id,
      { $set: { name, description, price, availability } },
      { new: true, runValidators: true },
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    res.json({
      success: true,
      message: "Service updated successfully",
    });
  } catch (err) {
    console.error("Error updating service:", err);
    res.status(500).json({
      success: false,
      message: "Server error updating service",
    });
  }
});

// Delete a service (MongoDB)
app.delete("/provider/services/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
    }

    const result = await Service.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    res.json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting service:", err);
    res.status(500).json({
      success: false,
      message: "Server error deleting service",
    });
  }
});

// ------------------- Payments/Transactions APIs -------------------

// Get provider transactions (MongoDB)
app.get("/provider/transactions/:id", async (req, res) => {
  try {
    const providerId = req.params.id;
    const { status, time } = req.query;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID",
      });
    }

    const query = { provider_id: providerId };

    // Handle time filters
    if (time && time !== "all") {
      const now = new Date();
      let startDate;

      switch (time) {
        case "week":
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case "month":
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case "quarter":
          startDate = new Date(now.setMonth(now.getMonth() - 3));
          break;
        default:
          startDate = null;
      }

      if (startDate) {
        query.date = { $gte: startDate };
      }
    }

    const transactions = await Transaction.find(query).sort({ date: -1 });

    res.json({
      success: true,
      transactions: transactions,
    });
  } catch (err) {
    console.error("Transactions error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching transactions",
    });
  }
});

// Get earnings summary (MongoDB)
app.get("/provider/earnings/:id", async (req, res) => {
  try {
    const providerId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID",
      });
    }

    // Lifetime earnings
    const lifetimeResult = await Transaction.aggregate([
      { $match: { provider_id: new mongoose.Types.ObjectId(providerId) } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Monthly earnings (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const monthlyResult = await Transaction.aggregate([
      {
        $match: {
          provider_id: new mongoose.Types.ObjectId(providerId),
          date: { $gte: thirtyDaysAgo },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Weekly earnings (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const weeklyResult = await Transaction.aggregate([
      {
        $match: {
          provider_id: new mongoose.Types.ObjectId(providerId),
          date: { $gte: sevenDaysAgo },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Pending payments (from pending jobs)
    const pendingResult = await Job.aggregate([
      {
        $match: {
          provider_id: new mongoose.Types.ObjectId(providerId),
          status: "pending",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.json({
      success: true,
      earnings: {
        lifetime: lifetimeResult.length > 0 ? lifetimeResult[0].total : 0,
        monthly: monthlyResult.length > 0 ? monthlyResult[0].total : 0,
        weekly: weeklyResult.length > 0 ? weeklyResult[0].total : 0,
        pending: pendingResult.length > 0 ? pendingResult[0].total : 0,
      },
    });
  } catch (err) {
    console.error("Earnings error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching earnings",
    });
  }
});

// Get providers by service type - UPDATED for booking service
app.get("/providers/:serviceType", (req, res) => {
  try {
    const { serviceType } = req.params;

    console.log("Fetching providers for service:", serviceType);

    const filteredProviders = providers.filter(
      (p) => p.service_type === serviceType && p.is_available,
    );

    console.log(
      `Found ${filteredProviders.length} providers for ${serviceType}`,
    );

    // Format providers for the booking service frontend
    const formattedProviders = filteredProviders.map((provider) => ({
      id: provider.id,
      name: provider.name,
      initials: provider.initials,
      rating: provider.rating,
      reviews: provider.reviews,
      experience: `${provider.experience} years experience`,
      price: provider.price,
      description: provider.description,
      features: provider.features,
    }));

    res.json({
      success: true,
      providers: formattedProviders,
    });
  } catch (error) {
    console.error("Error fetching providers:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching providers",
    });
  }
});

// Get all providers (for testing)
app.get("/providers", (req, res) => {
  res.json({
    success: true,
    providers: providers,
  });
});

// Create booking
app.post("/bookings", (req, res) => {
  try {
    const {
      serviceType,
      serviceCategory,
      providerId,
      customerName,
      customerEmail,
      customerPhone,
      address,
      problemDescription,
      preferredDate,
      preferredTime,
      totalCost,
    } = req.body;

    // Find provider
    const provider = providers.find((p) => p.id === providerId);

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider not found",
      });
    }

    const newBooking = {
      id: generateId(),
      serviceType,
      serviceCategory,
      providerId,
      providerName: provider.name,
      customerName,
      customerEmail,
      customerPhone,
      address,
      problemDescription,
      preferredDate,
      preferredTime,
      totalCost,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    bookings.push(newBooking);

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking: newBooking,
    });
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating booking",
    });
  }
});

// Get all bookings (for testing)
app.get("/bookings", (req, res) => {
  res.json({
    success: true,
    bookings: bookings,
  });
});

// Add Sample Data Endpoint (for testing) - MongoDB
app.post("/provider/sample-data/:id", async (req, res) => {
  try {
    const providerId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID",
      });
    }

    // Add sample services
    const sampleServices = [
      {
        provider_id: providerId,
        name: "Plumbing Repair",
        description: "Fix leaks, clogs, and other plumbing issues",
        price: 75.0,
        availability: "available",
      },
      {
        provider_id: providerId,
        name: "Electrical Installation",
        description: "Install outlets, switches, and light fixtures",
        price: 100.0,
        availability: "available",
      },
      {
        provider_id: providerId,
        name: "HVAC Maintenance",
        description: "Regular maintenance for heating and cooling systems",
        price: 120.0,
        availability: "unavailable",
      },
    ];

    await Service.insertMany(sampleServices);

    // Add sample jobs
    const sampleJobs = [
      {
        provider_id: providerId,
        customer_name: "Robert Davis",
        service_type: "Outlet Installation",
        status: "pending",
        amount: 85.0,
        date: new Date("2023-08-30"),
        time: "10:00",
      },
      {
        provider_id: providerId,
        customer_name: "Jennifer Wilson",
        service_type: "Circuit Repair",
        status: "in progress",
        amount: 120.0,
        date: new Date("2023-08-29"),
        time: "14:30",
      },
      {
        provider_id: providerId,
        customer_name: "Thomas Moore",
        service_type: "Lighting Installation",
        status: "completed",
        amount: 95.0,
        date: new Date("2023-08-28"),
        time: "09:00",
      },
    ];

    await Job.insertMany(sampleJobs);

    // Add sample transactions
    const sampleTransactions = [
      {
        provider_id: providerId,
        service: "Circuit Repair",
        customer_name: "Jennifer Wilson",
        amount: 120.0,
        date: new Date("2023-08-28"),
      },
      {
        provider_id: providerId,
        service: "Lighting Installation",
        customer_name: "Thomas Moore",
        amount: 95.0,
        date: new Date("2023-08-25"),
      },
      {
        provider_id: providerId,
        service: "Outlet Installation",
        customer_name: "Robert Davis",
        amount: 85.0,
        date: new Date("2023-08-22"),
      },
    ];

    await Transaction.insertMany(sampleTransactions);

    // Update provider stats
    await Provider.findByIdAndUpdate(providerId, {
      $set: {
        total_jobs: 3,
        pending_jobs: 1,
        completed_jobs: 1,
        total_earnings: 300.0,
        rating: 4.8,
      },
    });

    res.json({
      success: true,
      message: "Sample data added successfully",
    });
  } catch (err) {
    console.error("Sample data error:", err);
    res.status(500).json({
      success: false,
      message: "Server error adding sample data",
    });
  }
});

// Add some sample providers for testing (in-memory)
function addSampleProviders() {
  const sampleProviders = [
    {
      id: generateId(),
      name: "Mike Plumbing Pros",
      phone: "555-0101",
      email: "mike@plumbing.com",
      service_type: "plumbing",
      experience: 10,
      password: "$2a$10$examplehashedpassword",
      rating: 4.8,
      reviews: 124,
      price: "$120/hr",
      description:
        "Specialized in residential plumbing with quick response times and quality service guaranteed.",
      features: ["24/7 Available", "Licensed", "Free Estimate"],
      initials: "MP",
      is_available: true,
      date_registered: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: "Electric Pro",
      phone: "555-0102",
      email: "contact@electricpro.com",
      service_type: "electrical",
      experience: 8,
      password: "$2a$10$examplehashedpassword",
      rating: 4.7,
      reviews: 89,
      price: "$110/hr",
      description:
        "Licensed electricians providing safe and reliable electrical services for homes and businesses.",
      features: ["Licensed", "Insured", "24/7 Emergency"],
      initials: "EP",
      is_available: true,
      date_registered: new Date().toISOString(),
    },
  ];

  providers.push(...sampleProviders);
  console.log("Added sample providers for testing");
}

// Add sample admin user for testing
async function addSampleAdmin() {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: "admin@fixitnow.com" });
    if (existingAdmin) {
      console.log("Sample admin already exists");
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash("admin123", 10);

    // Create admin user
    const adminUser = new User({
      name: "System Administrator",
      email: "admin@fixitnow.com",
      password: hashedPassword,
      role: "admin",
    });

    await adminUser.save();
    console.log("Sample admin user created:");
    console.log("Email: admin@fixitnow.com");
    console.log("Password: admin123");
  } catch (error) {
    console.error("Error creating sample admin:", error);
  }
}

// Initialize sample data
addSampleProviders();

// Add sample admin user for testing
addSampleAdmin();

// Serve the dashboard HTML
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log("📝 Provider registration available at /provider/register");
  console.log(
    "📝 Database Provider registration available at /provider/db/register",
  );
  console.log("🔑 Provider login available at /provider/login");
  console.log("🔑 Database Provider login available at /provider/db/login");
  console.log("👥 Providers API available at /providers/:serviceType");
  console.log("📅 Bookings API available at /bookings");
  console.log("📊 Dashboard API available at /provider/dashboard/:id");
  console.log("💼 Jobs API available at /provider/jobs/:id");
  console.log("💰 Transactions API available at /provider/transactions/:id");
  console.log("💡 Sample providers added for testing");
});
