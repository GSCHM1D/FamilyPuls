import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processDueJobs, scheduleFallbackSyncs } from "@/lib/sync/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const fallback = await scheduleFallbackSyncs(6);
  const result = await processDueJobs({ limit: 20, timeBudgetMs: 50_000 });
  // Housekeeping: keep operational tables small (no health data in them).
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  await db.from("webhook_events").delete().lt("received_at", cutoff);
  await db.from("sync_jobs").delete().in("status", ["succeeded", "failed", "cancelled"]).lt("created_at", cutoff);
  await db.from("sync_logs").delete().lt("created_at", cutoff);
  await db.from("rate_limits").delete().lt("window_start", new Date(Date.now() - 86_400_000).toISOString());
  return NextResponse.json({ fallbackQueued: fallback, ...result });
}

export const GET = run;
export const POST = run;
