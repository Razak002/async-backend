import { httpServerHandler } from "cloudflare:node";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import workspaceRoutes from "./routes/workspaces.js";
import standupRoutes from "./routes/standups.js";
import summaryRoutes from "./routes/summaries.js";

const app = express();
app.use(cors());
app.use(express.json());

// Database connection middleware for serverless execution
app.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState < 1 && process.env.MONGO_URI) {
      await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
    next();
  } catch (err) {
    console.error("Database connection error:", err);
    res.status(500).json({ error: "Database connection failed", message: err.message });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/standups", standupRoutes);
app.use("/api/summaries", summaryRoutes);

app.get("/", (req, res) => {
  res.send("API is running...");
});

const PORT = 3000;
app.listen(PORT);

export default httpServerHandler({ port: PORT });
