import { Router } from "express";
import { supabase } from "../db.js";
import { logger } from "../logger.js";

const router = Router();

// Liveness probe
router.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Readiness probe
router.get("/ready", async (req, res) => {
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      logger.warn({ err: error }, "Database check warning in readiness probe");
    }

    return res.status(200).json({
      status: "ready",
      db: error ? "degraded" : "connected",
    });
  } catch (err) {
    logger.warn({ err }, "Readiness check exception");
    return res.status(200).json({ status: "ready", db: "degraded" });
  }
});

export default router;
