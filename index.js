require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
console.log("DB URL:", process.env.DATABASE_URL);
// ✅ safer DB config
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ✅ root route always works (no DB dependency)
app.get("/", (req, res) => {
  res.send("Server running ✅");
});

// ✅ DB test route (separate)
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows);
  } catch (err) {
    console.error("DB ERROR:", err);
    res.status(500).send("DB error: " + err.message);
  }
});


// --- JWT Middleware ---
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ error: "Invalid token" });
      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ error: "Authorization header missing" });
  }
};

// --- OTP AUTH APIs ---

app.post("/check-user", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone is required" });
  try {
    const result = await pool.query("SELECT id FROM users WHERE phone = $1", [phone]);
    if (result.rows.length > 0) {
      res.json({ action: "LOGIN" });
    } else {
      res.json({ action: "REGISTER" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/register", async (req, res) => {
  const { phone, name, email, address, is_married, is_indian, allow_messages } = req.body;
  if (!phone || !name) return res.status(400).json({ error: "Phone and name are required" });
  try {
    const check = await pool.query("SELECT id FROM users WHERE phone = $1", [phone]);
    if (check.rows.length > 0) return res.status(400).json({ error: "User already registered. Please login." });
    
    await pool.query(
      "INSERT INTO users (phone, name, email, address, is_married, is_indian, allow_messages) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [phone, name, email, address, is_married, is_indian, allow_messages !== undefined ? allow_messages : true]
    );
    res.json({ message: "Registration successful" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/send-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone is required" });
  try {
    const userResult = await pool.query("SELECT id FROM users WHERE phone = $1", [phone]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not registered. Please signup." });
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    const expiresAt = new Date(Date.now() + 2 * 60000); // 2 minutes from now
    
    await pool.query("DELETE FROM otp_codes WHERE phone = $1", [phone]);
    await pool.query(
      "INSERT INTO otp_codes (phone, otp, expires_at) VALUES ($1, $2, $3)",
      [phone, otp, expiresAt]
    );
    
    // MOCK SMS VENDOR LOGIC
    console.log(`[SMS VENDOR MOCK] OTP for ${phone} is: ${otp}`);
    
    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP are required" });
  try {
    const result = await pool.query("SELECT * FROM otp_codes WHERE phone = $1 AND otp = $2", [phone, otp]);
    if (result.rows.length === 0) return res.status(400).json({ error: "Invalid OTP" });
    
    const otpRecord = result.rows[0];
    if (new Date() > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ error: "OTP expired" });
    }
    
    // Valid OTP, get user ID
    const userResult = await pool.query("SELECT id, phone FROM users WHERE phone = $1", [phone]);
    const user = userResult.rows[0];
    
    // Generate JWT
    const token = jwt.sign({ userId: user.id, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: "15m" });
    
    // Clear OTP after successful use
    await pool.query("DELETE FROM otp_codes WHERE phone = $1", [phone]);
    
    res.json({ message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/profile", authenticateJWT, async (req, res) => {
  try {
    const userResult = await pool.query("SELECT id, phone, name, email, address, is_married, is_indian, allow_messages, is_verified, created_at FROM users WHERE id = $1", [req.user.userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(userResult.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ users route (protected)
app.get("/users", authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, phone, name, email, address, is_married, is_indian, allow_messages, is_verified, created_at FROM users");
    res.json(result.rows);
  } catch (err) {
    console.error("USERS ERROR:", err);
    res.status(500).send("Users error: " + err.message);
  }
});

// ✅ Railway binding fix
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server started on port ${PORT}`);
});