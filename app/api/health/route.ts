import { NextResponse } from "next/server";
import { googleHealthConfigured, isDemoMode, whoopConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Liveness/config check without exposing secrets. */
export function GET() {
  return NextResponse.json({
    ok: true,
    demoMode: isDemoMode(),
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    whoopConfigured: whoopConfigured(),
    googleHealthConfigured: googleHealthConfigured(),
  });
}
