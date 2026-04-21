require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// ✅ DB connection (Railway compatible)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// ✅ Root route (health check)
app.get("/", (req, res) => {
  res.send("Server running ✅");
});

// ✅ Users API
app.get("/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (err) {
    console.error("DB ERROR:", err);
    res.status(500).send("DB error");
  }
});

// ✅ Port + Railway binding (IMPORTANT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server started on port ${PORT}`);
});