import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, rateLimit, requireUser } from "@/lib/auth/api";
import { isProviderId } from "@/lib/providers/registry";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addDays, DEFAULT_TIMEZONE, todayInZone } from "@/lib/normalization/time";
import { enqueueBackfill, MAX_HISTORY_DAYS } from "@/lib/sync/queue";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ provider: z.string().refine(isProviderId), days: z.number().int().min(31).max(MAX_HISTORY_DAYS).default(MAX_HISTORY_DAYS) });

/** Extends the history import (optional, runs in background jobs). */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid_request");
  if (!(await rateLimit(`backfill:${auth.user.id}`, 2, 3600))) return jsonError(429, "rate_limited");
  const db = supabaseAdmin();
  const { data: conn } = await db.from("provider_connections").select("id").eq("user_id", auth.user.id).eq("provider", parsed.data.provider).neq("status", "disconnected").maybeSingle();
  if (!conn) return jsonError(404, "not_connected");
  const { data: profile } = await db.from("profiles").select("timezone").eq("id", auth.user.id).maybeSingle();
  const tz = profile?.timezone ?? DEFAULT_TIMEZONE;
  await enqueueBackfill(conn.id, auth.user.id, tz, parsed.data.days);
  await db.from("provider_connections").update({ history_start: addDays(todayInZone(tz), -(parsed.data.days - 1)) }).eq("id", conn.id);
  return NextResponse.json({ ok: true }, { status: 202 });
}
