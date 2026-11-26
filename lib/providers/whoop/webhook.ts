import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Maximum accepted clock skew for webhook timestamps (replay protection). */
export const WHOOP_WEBHOOK_MAX_SKEW_MS = 5 * 60_000;

/**
 * WHOOP signature: base64(HMAC-SHA256(timestamp_header + raw_body, client_secret)),
 * headers X-WHOOP-Signature and X-WHOOP-Signature-Timestamp (ms since epoch).
 * Source: https://developer.whoop.com/docs/developing/webhooks
 */
export function verifyWhoopSignature(params: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  clientSecret: string;
  now?: number;
}): boolean {
  const { rawBody, signature, timestamp, clientSecret, now = Date.now() } = params;
  if (!signature || !timestamp || !/^\d{10,16}$/.test(timestamp)) return false;
  if (Math.abs(now - Number(timestamp)) > WHOOP_WEBHOOK_MAX_SKEW_MS) return false;
  const expected = createHmac("sha256", clientSecret).update(timestamp + rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const whoopWebhookSchema = z.object({
  user_id: z.number().int(),
  id: z.union([z.string().min(1).max(64), z.number().int()]),
  type: z.enum(["workout.updated", "workout.deleted", "sleep.updated", "sleep.deleted", "recovery.updated", "recovery.deleted"]),
  trace_id: z.string().min(1).max(128),
});
