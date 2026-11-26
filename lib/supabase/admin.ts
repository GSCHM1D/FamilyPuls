import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. BYPASSES Row Level Security – only use it in server code
 * after an explicit authorization check, for sync jobs and token handling.
 */
export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!publicEnv.supabaseUrl || !key) throw new Error("Supabase service role is not configured");
  admin = createClient(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-client-info": "familypulse-server" } },
  });
  return admin;
}
