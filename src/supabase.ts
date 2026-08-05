import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://vclmpksodceracmxdmtl.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjbG1wa3NvZGNlcmFjbXhkbXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzY0MjUsImV4cCI6MjEwMTQxMjQyNX0.z6HY1znbNmJlH6BnQ6ux39n06At5aUGr84bBtwXeBC0";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string) || DEFAULT_SUPABASE_URL;
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
