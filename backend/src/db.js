import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { logger } from "./logger.js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.warn("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from environment variables.");
}

export const supabase = createClient(
  supabaseUrl || "http://127.0.0.1:54321",
  supabaseServiceKey || "placeholder-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
