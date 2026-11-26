import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getGoogleHealthKeys,
  googleNotificationBatchSchema,
  notificationDateRange,
  verifyAuthorizationHeader,
  verifyGoogleHealthSignature,
} from "@/lib/providers/google-health/webhook";
import { addDays, diffDays } from "@/lib/normalization/time";
import { enqueueJob, processDueJobs } from "@/lib/sync/queue";
import { logSafe } from "@/lib/security/redact";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Google Health API webhook subscriber endpoint.
 * - Authorization header must equal the secret configured on the subscriber
 * - GOOGLE-HEALTH-API-SIGNATURE (ECDSA P-256) is verified against Google's public keyset
 * - Responds quickly (204) and processes asynchronously
 */
export async function POST(request: Request) {
  const authorized = verifyAuthorizationHeader(request.headers.get("authorization"), process.env.GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION);
  const rawBody = await request.text();
  if (rawBody.length > 500_000) return NextResponse.json({ error: "too_large" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: authorized ? 400 : 401 });
  }

  // Endpoint verification handshake (authorized → 201, unauthorized → 401).
  if (body && !Array.isArray(body) && (body as { type?: string }).type === "verification") {
    return new NextResponse(null, { status: authorized ? 201 : 401 });
  }
  if (!authorized) return new NextResponse(null, { status: 401 });

  let keys = await getGoogleHealthKeys().catch(() => null);
  const signature = request.headers.get("google-health-api-signature");
  let valid = keys ? verifyGoogleHealthSignature(rawBody, signature, keys) : false;
  if (!valid) {
    keys = await getGoogleHealthKeys(true).catch(() => null); // key rotation
    valid = keys ? verifyGoogleHealthSignature(rawBody, signature, keys) : false;
  }
  if (!valid) {
    if (!keys) return new NextResponse(null, { status: 503 }); // keyset unreachable → Google retries
    return new NextResponse(null, { status: 401 });
  }

  const parsed = googleNotificationBatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const db = supabaseAdmin();
  for (const n of parsed.data) {
    const eventKey = createHash("sha256").update(JSON.stringify(n)).digest("hex");
    const { data: inserted } = await db
      .from("webhook_events")
      .upsert({ provider: "google_health", event_key: eventKey, event_type: `${n.data.dataType}.${n.data.operation}`, payload: n }, { onConflict: "provider,event_key", ignoreDuplicates: true })
      .select("id");
    if (!inserted?.length) continue; // duplicate delivery

    const { data: conn } = await db.from("provider_connections").select("id, user_id, status").eq("provider", "google_health").eq("external_user_id", n.data.healthUserId).maybeSingle();
    const range = notificationDateRange(n);
    if (!conn || conn.status === "disconnected" || !range) {
      await db.from("webhook_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("id", inserted[0]!.id);
      continue;
    }
    const start = diffDays(range.start, range.end) > 31 ? addDays(range.end, -31) : range.start;
    await enqueueJob({
      connectionId: conn.id,
      userId: conn.user_id,
      kind: "webhook",
      rangeStart: start,
      rangeEnd: range.end,
      payload: { dataType: n.data.dataType, operation: n.data.operation },
      dedupeKey: `wh:gh:${conn.id}:${start}:${range.end}`,
    });
    await db.from("webhook_events").update({ status: "queued", processed_at: new Date().toISOString() }).eq("id", inserted[0]!.id);
    await db.from("provider_connections").update({ last_webhook_at: new Date().toISOString() }).eq("id", conn.id);
  }
  after(() => processDueJobs({ limit: 5, timeBudgetMs: 45_000 }).catch((e) => logSafe.error("webhook processing failed", e)));
  return new NextResponse(null, { status: 204 });
}
