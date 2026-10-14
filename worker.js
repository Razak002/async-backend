import { httpServerHandler } from "cloudflare:node";
import express from "express";
import mongoosePkg from "mongoose";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import workspaceRoutes from "./routes/workspaces.js";
import standupRoutes from "./routes/standups.js";
import summaryRoutes from "./routes/summaries.js";

const mongoose = mongoosePkg.default || mongoosePkg;

const app = express();
app.use(cors());
app.use(express.json());

// Basic test route
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Database connection middleware for serverless execution
app.use(async (req, res, next) => {
  try {
    if (mongoose && mongoose.connection && mongoose.connection.readyState < 1) {
      if (process.env.MONGO_URI) {
        await mongoose.connect(process.env.MONGO_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        });
      } else {
        console.warn("MONGO_URI not found in process.env");
      }
    }
    next();
  } catch (err) {
    console.error("Database connection error:", err);
    res.status(500).json({ error: "Database connection failed", message: err.message });
  }
});

// Routes
app.use("/api/auth", authRoutes.default || authRoutes);
app.use("/api/workspaces", workspaceRoutes.default || workspaceRoutes);
app.use("/api/standups", standupRoutes.default || standupRoutes);
app.use("/api/summaries", summaryRoutes.default || summaryRoutes);

const PORT = 3000;
app.listen(PORT);

export default httpServerHandler({ port: PORT });
