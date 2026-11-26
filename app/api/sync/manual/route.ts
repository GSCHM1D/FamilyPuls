import { after, NextResponse } from "next/server";
import { jsonError, rateLimit, requireUser } from "@/lib/auth/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enqueueJob, processDueJobs } from "@/lib/sync/queue";
import { logSafe } from "@/lib/security/redact";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual "sync now" – max. 3 per 15 minutes per user. */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  if (!(await rateLimit(`manual-sync:${auth.user.id}`, 3, 900))) return jsonError(429, "rate_limited");
  const db = supabaseAdmin();
  const { data: conns } = await db.from("provider_connections").select("id").eq("user_id", auth.user.id).in("status", ["active", "error", "syncing"]);
  let queued = 0;
  for (const c of conns ?? []) {
    if (await enqueueJob({ connectionId: c.id, userId: auth.user.id, kind: "manual", dedupeKey: `manual:${c.id}` })) queued++;
  }
  after(() => processDueJobs({ limit: 3, timeBudgetMs: 45_000 }).catch((e) => logSafe.error("manual sync failed", e)));
  return NextResponse.json({ queued }, { status: 202 });
}
