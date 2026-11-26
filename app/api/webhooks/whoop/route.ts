import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyWhoopSignature, whoopWebhookSchema } from "@/lib/providers/whoop/webhook";
import { enqueueJob, processDueJobs } from "@/lib/sync/queue";
import { logSafe } from "@/lib/security/redact";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** WHOOP v2 webhooks. Signature is verified before anything else is done. */
export async function POST(request: Request) {
  const secret = process.env.WHOOP_CLIENT_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const rawBody = await request.text();
  if (rawBody.length > 10_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const valid = verifyWhoopSignature({
    rawBody,
    signature: request.headers.get("x-whoop-signature"),
    timestamp: request.headers.get("x-whoop-signature-timestamp"),
    clientSecret: secret,
  });
  if (!valid) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  let payload;
  try {
    payload = whoopWebhookSchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const eventKey = `${payload.trace_id}:${payload.type}:${payload.id}`;
  const { data: inserted } = await db
    .from("webhook_events")
    .upsert({ provider: "whoop", event_key: eventKey, event_type: payload.type, payload }, { onConflict: "provider,event_key", ignoreDuplicates: true })
    .select("id");
  if (!inserted?.length) return NextResponse.json({ ok: true, duplicate: true }); // idempotent

  const { data: conn } = await db.from("provider_connections").select("id, user_id, status").eq("provider", "whoop").eq("external_user_id", String(payload.user_id)).maybeSingle();
  if (!conn || conn.status === "disconnected") {
    await db.from("webhook_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("id", inserted[0]!.id);
    return NextResponse.json({ ok: true });
  }

  const [resource, operation] = payload.type.split(".") as ["sleep" | "recovery" | "workout", "updated" | "deleted"];
  await enqueueJob({
    connectionId: conn.id,
    userId: conn.user_id,
    kind: "webhook",
    payload: { resource, operation, resourceId: String(payload.id) },
    dedupeKey: `wh:whoop:${resource === "recovery" ? "sleep" : resource}:${payload.id}`,
  });
  await db.from("webhook_events").update({ status: "queued", processed_at: new Date().toISOString() }).eq("id", inserted[0]!.id);
  await db.from("provider_connections").update({ last_webhook_at: new Date().toISOString() }).eq("id", conn.id);
  after(() => processDueJobs({ limit: 3, timeBudgetMs: 45_000 }).catch((e) => logSafe.error("webhook processing failed", e)));
  return NextResponse.json({ ok: true });
}
