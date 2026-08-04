import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./logger.js";
import healthRoutes from "./routes/health.js";
import groupRoutes from "./routes/groups.js";
import expenseRoutes from "./routes/expenses.js";
import settlementRoutes from "./routes/settlements.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Structured HTTP logging
app.use(
  pinoHttp({
    logger,
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 500 || err) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  })
);

// Health check routes
app.use("/", healthRoutes);

// API routes
app.use("/groups", groupRoutes);
app.use("/", expenseRoutes);
app.use("/", settlementRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Centralized error handling
app.use((err, req, res, _next) => {
  logger.error({ err }, "Unhandled application error");
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
});

export default app;
