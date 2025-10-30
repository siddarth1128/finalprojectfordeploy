require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Create database connection
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Bhavani@123",
  database: process.env.DB_NAME || "fixitnow_2",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Initialize database with required tables
function initializeDatabase() {
  const createProvidersTable = `
    CREATE TABLE IF NOT EXISTS providers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      phone VARCHAR(20) NOT NULL,
      password VARCHAR(255) NOT NULL,
      service_type ENUM('plumbing', 'electrical', 'carpentry', 'appliance', 'cleaning') NOT NULL,
      experience INT NOT NULL,
      experience_unit ENUM('months', 'years') NOT NULL,
      license_image VARCHAR(255),
      profile_image VARCHAR(255),
      rating FLOAT DEFAULT 0,
      total_jobs INT DEFAULT 0,
      pending_jobs INT DEFAULT 0,
      completed_jobs INT DEFAULT 0,
      total_earnings DECIMAL(10, 2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const createJobsTable = `
    CREATE TABLE IF NOT EXISTS jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider_id INT NOT NULL,
      customer_name VARCHAR(100) NOT NULL,
      service_type VARCHAR(50) NOT NULL,
      description TEXT,
      status ENUM('pending', 'in progress', 'completed', 'cancelled') DEFAULT 'pending',
      amount DECIMAL(10, 2),
      date DATE,
      time TIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    )
  `;

  const createTransactionsTable = `
    CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider_id INT NOT NULL,
      service VARCHAR(100) NOT NULL,
      customer_name VARCHAR(100) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    )
  `;

  const createServicesTable = `
    CREATE TABLE IF NOT EXISTS services (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      price DECIMAL(10, 2) NOT NULL,
      availability ENUM('available', 'unavailable') DEFAULT 'available',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    )
  `;

  db.query(createProvidersTable, (err) => {
    if (err) console.error("Error creating providers table:", err);
    else console.log("Providers table ready");
  });

  db.query(createJobsTable, (err) => {
    if (err) console.error("Error creating jobs table:", err);
    else console.log("Jobs table ready");
  });

  db.query(createTransactionsTable, (err) => {
    if (err) console.error("Error creating transactions table:", err);
    else console.log("Transactions table ready");
  });

  db.query(createServicesTable, (err) => {
    if (err) console.error("Error creating services table:", err);
    else console.log("Services table ready");
  });
}

// Helper function for database queries
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// Initialize database
initializeDatabase();

// In-memory storage (replace with database in production)
let providers = [];
let bookings = [];

// Helper function to generate unique IDs
const generateId = () => Date.now().toString();

// Provider Registration Endpoint
app.post("/provider/register", upload.fields([
  { name: 'licenseImage', maxCount: 1 },
  { name: 'photoImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const { name, email, phone, service_type, experience, experience_unit, password } = req.body;
    
    // Validate required fields
    if (!name || !email || !phone || !service_type || !experience || !experience_unit || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if email already exists
    const existingProvider = await query("SELECT id FROM providers WHERE email = ?", [email]);
    if (existingProvider.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Handle file uploads
    const licenseImage = req.files && req.files['licenseImage'] ? req.files['licenseImage'][0].filename : null;
    const profileImage = req.files && req.files['photoImage'] ? req.files['photoImage'][0].filename : null;

    // Insert provider into database
    const result = await query(
      "INSERT INTO providers (name, email, phone, service_type, experience, experience_unit, license_image, profile_image, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [name, email, phone, service_type, experience, experience_unit, licenseImage, profileImage, hashedPassword]
    );

    res.status(201).json({ 
      message: "Provider registered successfully", 
      providerId: result.insertId 
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// Provider Login Endpoint
app.post("/provider/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Find provider by email
    const providers = await query(
      "SELECT id, name, email, password, service_type FROM providers WHERE email = ?", 
      [email]
    );

    if (providers.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const provider = providers[0];

    // Check password
    const isPasswordValid = await bcrypt.compare(password, provider.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Return provider data (without password)
    res.json({
      message: "Login successful",
      provider: {
        id: provider.id,
        name: provider.name,
        email: provider.email,
        service_type: provider.service_type
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

// Get Provider Dashboard Data
app.get("/provider/dashboard/:id", async (req, res) => {
  try {
    const providerId = req.params.id;

    // Get provider info
    const providers = await query(
      "SELECT name, service_type, rating, total_jobs, pending_jobs, completed_jobs, total_earnings FROM providers WHERE id = ?", 
      [providerId]
    );

    if (providers.length === 0) {
      return res.status(404).json({ message: "Provider not found" });
    }

    const provider = providers[0];

    // Get today's appointments count
    const today = new Date().toISOString().split('T')[0];
    const todayAppointments = await query(
      "SELECT COUNT(*) as count FROM jobs WHERE provider_id = ? AND date = ?",
      [providerId, today]
    );

    // Get recent jobs (last 5)
    const jobs = await query(
      `SELECT customer_name, service_type, date, status 
       FROM jobs 
       WHERE provider_id = ? 
       ORDER BY date DESC 
       LIMIT 5`,
      [providerId]
    );

    // Get recent transactions (last 5)
    const transactions = await query(
      `SELECT service, customer_name, amount, date 
       FROM transactions 
       WHERE provider_id = ? 
       ORDER BY date DESC 
       LIMIT 5`,
      [providerId]
    );

    // Calculate monthly earnings for chart (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyEarnings = await query(
      `SELECT 
        YEAR(date) as year, 
        MONTH(date) as month, 
        SUM(amount) as total 
       FROM transactions 
       WHERE provider_id = ? AND date >= ?
       GROUP BY YEAR(date), MONTH(date) 
       ORDER BY year, month`,
      [providerId, sixMonthsAgo.toISOString().split('T')[0]]
    );

    res.json({
      provider: {
        name: provider.name,
        service_type: provider.service_type,
        rating: provider.rating,
        total_jobs: provider.total_jobs,
        pending_jobs: provider.pending_jobs,
        completed_jobs: provider.completed_jobs,
        total_earnings: provider.total_earnings,
        today_appointments: todayAppointments[0].count
      },
      recentJobs: jobs,
      recentTransactions: transactions,
      monthlyEarnings: monthlyEarnings
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ message: "Server error fetching dashboard data" });
  }
});

// Get Provider Profile
app.get("/provider/profile/:id", async (req, res) => {
  try {
    const providerId = req.params.id;

    const providers = await query(
      "SELECT id, name, email, phone, service_type, experience, experience_unit, license_image, profile_image, rating, total_jobs FROM providers WHERE id = ?", 
      [providerId]
    );

    if (providers.length === 0) {
      return res.status(404).json({ message: "Provider not found" });
    }

    const provider = providers[0];
    
    // Remove sensitive data
    delete provider.password;

    res.json(provider);
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ message: "Server error fetching profile" });
  }
});

// Update Provider Profile
app.put("/provider/profile/:id", async (req, res) => {
  try {
    const providerId = req.params.id;
    const { name, email, phone, service_type, experience, bio } = req.body;

    // Check if email is already used by another provider
    if (email) {
      const existingProvider = await query(
        "SELECT id FROM providers WHERE email = ? AND id != ?", 
        [email, providerId]
      );
      
      if (existingProvider.length > 0) {
        return res.status(409).json({ message: "Email already in use" });
      }
    }

    // Build update query dynamically based on provided fields
    let updateFields = [];
    let updateValues = [];

    if (name) {
      updateFields.push("name = ?");
      updateValues.push(name);
    }
    
    if (email) {
      updateFields.push("email = ?");
      updateValues.push(email);
    }
    
    if (phone) {
      updateFields.push("phone = ?");
      updateValues.push(phone);
    }
    
    if (service_type) {
      updateFields.push("service_type = ?");
      updateValues.push(service_type);
    }
    
    if (experience) {
      updateFields.push("experience = ?");
      updateValues.push(experience);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    updateValues.push(providerId);

    const result = await query(
      `UPDATE providers SET ${updateFields.join(", ")} WHERE id = ?`,
      updateValues
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Provider not found" });
    }

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ message: "Server error updating profile" });
  }
});

// Get Provider Jobs
app.get("/provider/jobs/:id", async (req, res) => {
  try {
    const providerId = req.params.id;
    const { status } = req.query;

    let queryStr = "SELECT * FROM jobs WHERE provider_id = ?";
    let queryParams = [providerId];

    if (status && status !== "all") {
      queryStr += " AND status = ?";
      queryParams.push(status);
    }

    queryStr += " ORDER BY date DESC";

    const jobs = await query(queryStr, queryParams);

    res.json(jobs);
  } catch (err) {
    console.error("Jobs error:", err);
    res.status(500).json({ message: "Server error fetching jobs" });
  }
});

// Update Job Status
app.put("/provider/jobs/:jobId", async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    // First get the job to know the provider ID
    const jobs = await query("SELECT provider_id FROM jobs WHERE id = ?", [jobId]);
    
    if (jobs.length === 0) {
      return res.status(404).json({ message: "Job not found" });
    }

    const providerId = jobs[0].provider_id;

    // Update the job status
    const result = await query(
      "UPDATE jobs SET status = ?, description = COALESCE(?, description) WHERE id = ?",
      [status, notes, jobId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Update provider stats based on status change
    if (status === "completed") {
      await query(
        "UPDATE providers SET completed_jobs = completed_jobs + 1, pending_jobs = GREATEST(0, pending_jobs - 1) WHERE id = ?",
        [providerId]
      );
      
      // Add to transactions when job is completed
      const job = await query("SELECT customer_name, service_type, amount FROM jobs WHERE id = ?", [jobId]);
      if (job.length > 0 && job[0].amount) {
        await query(
          "INSERT INTO transactions (provider_id, service, customer_name, amount, date) VALUES (?, ?, ?, ?, CURDATE())",
          [providerId, job[0].service_type, job[0].customer_name, job[0].amount]
        );
        
        // Update total earnings
        await query(
          "UPDATE providers SET total_earnings = total_earnings + ? WHERE id = ?",
          [job[0].amount, providerId]
        );
      }
    } else if (status === "in progress") {
      await query(
        "UPDATE providers SET pending_jobs = GREATEST(0, pending_jobs - 1) WHERE id = ?",
        [providerId]
      );
    } else if (status === "pending") {
      await query(
        "UPDATE providers SET pending_jobs = pending_jobs + 1 WHERE id = ?",
        [providerId]
      );
    }

    res.json({ message: "Job status updated successfully" });
  } catch (err) {
    console.error("Job update error:", err);
    res.status(500).json({ message: "Server error updating job" });
  }
});

// ------------------- Services APIs -------------------

// Get all services of a provider
app.get("/provider/services", async (req, res) => {
  try {
    const providerId = req.query.provider_id;
    if (!providerId) return res.status(400).json({ message: "provider_id is required" });

    const services = await query("SELECT * FROM services WHERE provider_id = ?", [providerId]);
    res.json(services);
  } catch (err) {
    console.error("Error fetching services:", err);
    res.status(500).json({ message: "Server error fetching services" });
  }
});

// Add a new service
app.post("/provider/services", async (req, res) => {
  try {
    const { provider_id, name, description, price, availability } = req.body;
    if (!provider_id || !name || !price) {
      return res.status(400).json({ message: "provider_id, name, and price are required" });
    }

    const result = await query(
      "INSERT INTO services (provider_id, name, description, price, availability) VALUES (?, ?, ?, ?, ?)",
      [provider_id, name, description, price, availability || 'available']
    );

    res.status(201).json({ message: "Service added successfully", serviceId: result.insertId });
  } catch (err) {
    console.error("Error adding service:", err);
    res.status(500).json({ message: "Server error adding service" });
  }
});

// Update a service
app.put("/provider/services/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, availability } = req.body;

    const result = await query(
      "UPDATE services SET name=?, description=?, price=?, availability=? WHERE id=?",
      [name, description, price, availability, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Service not found" });
    }

    res.json({ message: "Service updated successfully" });
  } catch (err) {
    console.error("Error updating service:", err);
    res.status(500).json({ message: "Server error updating service" });
  }
});

// Delete a service
app.delete("/provider/services/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query("DELETE FROM services WHERE id=?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Service not found" });
    }

    res.json({ message: "Service deleted successfully" });
  } catch (err) {
    console.error("Error deleting service:", err);
    res.status(500).json({ message: "Server error deleting service" });
  }
});

// ------------------- Payments/Transactions APIs -------------------

// Get provider transactions
app.get("/provider/transactions/:id", async (req, res) => {
  try {
    const providerId = req.params.id;
    const { status, time } = req.query;

    let queryStr = "SELECT * FROM transactions WHERE provider_id = ?";
    let queryParams = [providerId];

    // Handle time filters
    if (time && time !== "all") {
      const now = new Date();
      let startDate;

      switch(time) {
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case 'quarter':
          startDate = new Date(now.setMonth(now.getMonth() - 3));
          break;
        default:
          startDate = null;
      }

      if (startDate) {
        queryStr += " AND date >= ?";
        queryParams.push(startDate.toISOString().split('T')[0]);
      }
    }

    queryStr += " ORDER BY date DESC";

    const transactions = await query(queryStr, queryParams);

    res.json(transactions);
  } catch (err) {
    console.error("Transactions error:", err);
    res.status(500).json({ message: "Server error fetching transactions" });
  }
});

// Get earnings summary
app.get("/provider/earnings/:id", async (req, res) => {
  try {
    const providerId = req.params.id;

    // Lifetime earnings
    const lifetimeResult = await query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE provider_id = ?",
      [providerId]
    );

    // Monthly earnings (last 30 days)
    const monthlyResult = await query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE provider_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)",
      [providerId]
    );

    // Weekly earnings (last 7 days)
    const weeklyResult = await query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE provider_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)",
      [providerId]
    );

    // Pending payments (from pending jobs)
    const pendingResult = await query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM jobs WHERE provider_id = ? AND status = 'pending'",
      [providerId]
    );

    res.json({
      lifetime: parseFloat(lifetimeResult[0].total),
      monthly: parseFloat(monthlyResult[0].total),
      weekly: parseFloat(weeklyResult[0].total),
      pending: parseFloat(pendingResult[0].total)
    });
  } catch (err) {
    console.error("Earnings error:", err);
    res.status(500).json({ message: "Server error fetching earnings" });
  }
});

// Add Sample Data Endpoint (for testing)
app.post("/provider/sample-data/:id", async (req, res) => {
  try {
    const providerId = req.params.id;

    // Add sample services
    const sampleServices = [
      {
        provider_id: providerId,
        name: "Plumbing Repair",
        description: "Fix leaks, clogs, and other plumbing issues",
        price: 75.00,
        availability: "available"
      },
      {
        provider_id: providerId,
        name: "Electrical Installation",
        description: "Install outlets, switches, and light fixtures",
        price: 100.00,
        availability: "available"
      },
      {
        provider_id: providerId,
        name: "HVAC Maintenance",
        description: "Regular maintenance for heating and cooling systems",
        price: 120.00,
        availability: "unavailable"
      }
    ];

    for (const service of sampleServices) {
      await query(
        "INSERT INTO services (provider_id, name, description, price, availability) VALUES (?, ?, ?, ?, ?)",
        [service.provider_id, service.name, service.description, service.price, service.availability]
      );
    }

    // Add sample jobs
    const sampleJobs = [
      {
        provider_id: providerId,
        customer_name: "Robert Davis",
        service_type: "Outlet Installation",
        status: "pending",
        amount: 85.00,
        date: new Date("2023-08-30"),
        time: "10:00:00"
      },
      {
        provider_id: providerId,
        customer_name: "Jennifer Wilson",
        service_type: "Circuit Repair",
        status: "in progress",
        amount: 120.00,
        date: new Date("2023-08-29"),
        time: "14:30:00"
      },
      {
        provider_id: providerId,
        customer_name: "Thomas Moore",
        service_type: "Lighting Installation",
        status: "completed",
        amount: 95.00,
        date: new Date("2023-08-28"),
        time: "09:00:00"
      }
    ];

    for (const job of sampleJobs) {
      await query(
        "INSERT INTO jobs (provider_id, customer_name, service_type, status, amount, date, time) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [job.provider_id, job.customer_name, job.service_type, job.status, job.amount, job.date, job.time]
      );
    }

    // Add sample transactions
    const sampleTransactions = [
      {
        provider_id: providerId,
        service: "Circuit Repair",
        customer_name: "Jennifer Wilson",
        amount: 120.00,
        date: new Date("2023-08-28")
      },
      {
        provider_id: providerId,
        service: "Lighting Installation",
        customer_name: "Thomas Moore",
        amount: 95.00,
        date: new Date("2023-08-25")
      },
      {
        provider_id: providerId,
        service: "Outlet Installation",
        customer_name: "Robert Davis",
        amount: 85.00,
        date: new Date("2023-08-22")
      }
    ];

    for (const transaction of sampleTransactions) {
      await query(
        "INSERT INTO transactions (provider_id, service, customer_name, amount, date) VALUES (?, ?, ?, ?, ?)",
        [transaction.provider_id, transaction.service, transaction.customer_name, transaction.amount, transaction.date]
      );
    }

    // Update provider stats
    await query(
      "UPDATE providers SET total_jobs = 3, pending_jobs = 1, completed_jobs = 1, total_earnings = 300.00, rating = 4.8 WHERE id = ?",
      [providerId]
    );

    res.json({ message: "Sample data added successfully" });
  } catch (err) {
    console.error("Sample data error:", err);
    res.status(500).json({ message: "Server error adding sample data" });
  }
});

// Serve the dashboard HTML
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Register provider endpoint (in-memory version)
app.post('/provider/register-memory', async (req, res) => {
  try {
      const { name, phone, email, service_type, experience, password } = req.body;
      
      console.log('Registration attempt:', { name, email, service_type });

      // Validation
      if (!name || !phone || !email || !service_type || !experience || !password) {
          return res.status(400).json({ 
              success: false, 
              message: 'All fields are required' 
          });
      }

      // Check if provider already exists
      if (providers.find(p => p.email === email)) {
          return res.status(400).json({ 
              success: false, 
              message: 'Provider with this email already exists' 
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
          initials: name.split(' ').map(n => n[0]).join('').toUpperCase(),
          is_available: true,
          date_registered: new Date().toISOString()
      };

      providers.push(newProvider);
      
      console.log('Provider registered successfully:', newProvider.name);
      console.log('Total providers:', providers.length);

      res.status(201).json({ 
          success: true, 
          message: 'Provider registered successfully', 
          provider: {
              id: newProvider.id,
              name: newProvider.name,
              email: newProvider.email,
              service_type: newProvider.service_type
          }
      });

  } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ 
          success: false, 
          message: 'Internal server error' 
      });
  }
});

// Login provider endpoint (in-memory version)
app.post('/provider/login-memory', async (req, res) => {
  try {
      const { email, password } = req.body;

      console.log('Login attempt:', email);

      // Find provider
      const provider = providers.find(p => p.email === email);
      
      if (!provider) {
          return res.status(401).json({ 
              success: false, 
              message: 'Invalid email or password' 
          });
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, provider.password);
      
      if (!isPasswordValid) {
          return res.status(401).json({ 
              success: false, 
              message: 'Invalid email or password' 
          });
      }

      console.log('Login successful:', provider.name);

      res.json({ 
          success: true,
          message: 'Login successful', 
          provider: {
              id: provider.id,
              name: provider.name,
              email: provider.email,
              service_type: provider.service_type,
              phone: provider.phone,
              experience: provider.experience
          }
      });

  } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ 
          success: false, 
          message: 'Internal server error' 
      });
  }
});

// Get providers by service type - UPDATED for booking service
app.get('/providers/:serviceType', (req, res) => {
  try {
      const { serviceType } = req.params;
      
      console.log('Fetching providers for service:', serviceType);
      
      const filteredProviders = providers.filter(p => 
          p.service_type === serviceType && p.is_available
      );

      console.log(`Found ${filteredProviders.length} providers for ${serviceType}`);

      // Format providers for the booking service frontend
      const formattedProviders = filteredProviders.map(provider => ({
          id: provider.id,
          name: provider.name,
          initials: provider.initials,
          rating: provider.rating,
          reviews: provider.reviews,
          experience: `${provider.experience} years experience`,
          price: provider.price,
          description: provider.description,
          features: provider.features
      }));

      res.json({
          success: true,
          providers: formattedProviders
      });

  } catch (error) {
      console.error('Error fetching providers:', error);
      res.status(500).json({ 
          success: false, 
          message: 'Error fetching providers' 
      });
  }
});

// Get all providers (for testing)
app.get('/providers', (req, res) => {
  res.json({
      success: true,
      providers: providers
  });
});

// Create booking
app.post('/bookings', (req, res) => {
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
          totalCost 
      } = req.body;

      // Find provider
      const provider = providers.find(p => p.id === providerId);
      
      if (!provider) {
          return res.status(404).json({ 
              success: false, 
              message: 'Provider not found' 
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
          status: 'pending',
          createdAt: new Date().toISOString()
      };

      bookings.push(newBooking);

      res.status(201).json({
          success: true,
          message: 'Booking created successfully',
          booking: newBooking
      });

  } catch (error) {
      console.error('Booking error:', error);
      res.status(500).json({ 
          success: false, 
          message: 'Error creating booking' 
      });
  }
});

// Get all bookings (for testing)
app.get('/bookings', (req, res) => {
  res.json({
      success: true,
      bookings: bookings
  });
});

// Add some sample providers for testing
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
          description: "Specialized in residential plumbing with quick response times and quality service guaranteed.",
          features: ["24/7 Available", "Licensed", "Free Estimate"],
          initials: "MP",
          is_available: true,
          date_registered: new Date().toISOString()
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
          description: "Licensed electricians providing safe and reliable electrical services for homes and businesses.",
          features: ["Licensed", "Insured", "24/7 Emergency"],
          initials: "EP",
          is_available: true,
          date_registered: new Date().toISOString()
      }
  ];

  providers.push(...sampleProviders);
  console.log('Added sample providers for testing');
}

// Initialize sample data
addSampleProviders();

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('📝 Provider registration available at /provider/register');
  console.log('🔑 Provider login available at /provider/login');
  console.log('👥 Providers API available at /providers/:serviceType');
  console.log('📅 Bookings API available at /bookings');
  console.log('💡 Sample providers added for testing');
});