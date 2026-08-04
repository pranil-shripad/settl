import { Router } from "express";
import { supabase } from "../db.js";
import { logger } from "../logger.js";

const router = Router();

// Liveness probe
router.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Readiness probe (verifies database connectivity)
router.get("/ready", async (req, res) => {
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      // PGRST205 means PostgREST is alive and responding, but schema migration hasn't been applied yet
      if (error.code === "PGRST205") {
        logger.warn({ err: error }, "Database connected, but schema tables (profiles) are missing/pending migration");
        return res.status(200).json({
          status: "ready",
          db: "connected",
          warning: "Schema table 'profiles' missing; please run migrations",
        });
      }

      logger.error({ err: error }, "Readiness check database error");
      return res.status(500).json({ status: "not_ready", error: error.message || "Database connection failed" });
    }

    return res.status(200).json({ status: "ready", db: "connected" });
  } catch (err) {
    logger.error({ err }, "Readiness check exception");
    return res.status(500).json({ status: "not_ready", error: err.message || "Connection failed" });
  }
});

export default router;
