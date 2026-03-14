require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 4000;

const authRoutes = require('./routes/auth');
const workspaceRoutes = require('./routes/workspaces');
const standupRoutes = require('./routes/standups');
const summaryRoutes = require('./routes/summaries');

// Middleware
app.use(cors());
app.use(express.json()); // Allows us to accept JSON data in the body

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/standups', standupRoutes);
app.use('/api/summaries', summaryRoutes);

// Basic Route for testing
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Database Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
    // Start server only after connecting to DB
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((error) => {
    console.error("❌ Error connecting to MongoDB:", error.message);
  });
