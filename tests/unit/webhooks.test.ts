import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWhoopSignature, whoopWebhookSchema } from "@/lib/providers/whoop/webhook";
import {
  googleNotificationBatchSchema,
  notificationDateRange,
  parseKeyset,
  verifyAuthorizationHeader,
  verifyGoogleHealthSignature,
} from "@/lib/providers/google-health/webhook";

describe("WHOOP webhook signature", () => {
  const secret = "test-client-secret";
  const body = JSON.stringify({ user_id: 456, id: "550e8400-e29b-41d4-a716-446655440000", type: "sleep.updated", trace_id: "e369c784-5100-49e8-8098-75d35c47b31b" });
  const now = 1_764_000_000_000;
  const ts = String(now);
  const sig = createHmac("sha256", secret).update(ts + body).digest("base64");

  it("accepts a valid signature", () => {
    expect(verifyWhoopSignature({ rawBody: body, signature: sig, timestamp: ts, clientSecret: secret, now })).toBe(true);
  });
  it("rejects a modified body", () => {
    expect(verifyWhoopSignature({ rawBody: body.replace("456", "457"), signature: sig, timestamp: ts, clientSecret: secret, now })).toBe(false);
  });
  it("rejects a wrong secret and missing headers", () => {
    expect(verifyWhoopSignature({ rawBody: body, signature: sig, timestamp: ts, clientSecret: "other", now })).toBe(false);
    expect(verifyWhoopSignature({ rawBody: body, signature: null, timestamp: ts, clientSecret: secret, now })).toBe(false);
  });
  it("rejects replayed (old) timestamps", () => {
    expect(verifyWhoopSignature({ rawBody: body, signature: sig, timestamp: ts, clientSecret: secret, now: now + 10 * 60_000 })).toBe(false);
  });
  it("validates the payload schema", () => {
    expect(whoopWebhookSchema.safeParse(JSON.parse(body)).success).toBe(true);
    expect(whoopWebhookSchema.safeParse({ ...JSON.parse(body), type: "user.deleted" }).success).toBe(false);
  });
});

/** Encodes a P-256 public key the way Tink serializes EcdsaPublicKey (x = field 3, y = field 4). */
function tinkKeyValue(x: Buffer, y: Buffer): string {
  const field = (tag: number, data: Buffer) => Buffer.concat([Buffer.from([(tag << 3) | 2, data.length]), data]);
  const params = field(2, Buffer.from([0x08, 0x03, 0x10, 0x02, 0x18, 0x02]));
  return Buffer.concat([params, field(3, Buffer.concat([Buffer.from([0]), x])), field(4, Buffer.concat([Buffer.from([0]), y]))]).toString("base64");
}

describe("Google Health webhook verification", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const keyId = 1083906037;
  const keyset = {
    primaryKeyId: keyId,
    key: [{ keyData: { typeUrl: "type.googleapis.com/google.crypto.tink.EcdsaPublicKey", value: tinkKeyValue(Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")), keyMaterialType: "ASYMMETRIC_PUBLIC" }, status: "ENABLED", keyId, outputPrefixType: "TINK" }],
  };
  const keys = parseKeyset(keyset);
  const body = JSON.stringify([{ data: { version: "1", healthUserId: "abc123", operation: "UPSERT", dataType: "steps", intervals: [{ civilIso8601TimeInterval: { startTime: "2026-03-07T17:29:00", endTime: "2026-03-07T17:34:00" } }] } }]);
  const prefix = Buffer.alloc(5);
  prefix[0] = 0x01;
  prefix.writeUInt32BE(keyId, 1);
  const signature = Buffer.concat([prefix, sign("sha256", Buffer.from(body), { key: privateKey, dsaEncoding: "der" })]).toString("base64");

  it("verifies a Tink-prefixed ECDSA P-256 signature", () => {
    expect(verifyGoogleHealthSignature(body, signature, keys)).toBe(true);
  });
  it("rejects modified payloads, unknown key ids and garbage", () => {
    expect(verifyGoogleHealthSignature(body.replace("abc123", "evil"), signature, keys)).toBe(false);
    const wrongId = Buffer.from(signature, "base64");
    wrongId.writeUInt32BE(42, 1);
    expect(verifyGoogleHealthSignature(body, wrongId.toString("base64"), keys)).toBe(false);
    expect(verifyGoogleHealthSignature(body, "bm9wZQ==", keys)).toBe(false);
    expect(verifyGoogleHealthSignature(body, null, keys)).toBe(false);
  });
  it("parses Google's real public keyset format", () => {
    const real = { key: [{ keyData: { typeUrl: "type.googleapis.com/google.crypto.tink.EcdsaPublicKey", value: "EgYIAxACGAIaIQBYMWbRCkGhn5ikaiDBVgfukm2WSNJapsTU73m2vDmU2iIhAGVXNnrf4uGhixf4wnbNyS7ZU97MSmIlMEnpdNiEaji0" }, status: "ENABLED", keyId: 1083906037, outputPrefixType: "TINK" }] };
    expect(parseKeyset(real).size).toBe(1);
  });
  it("compares the Authorization header in constant time", () => {
    expect(verifyAuthorizationHeader("Bearer abc", "Bearer abc")).toBe(true);
    expect(verifyAuthorizationHeader("Bearer abd", "Bearer abc")).toBe(false);
    expect(verifyAuthorizationHeader(null, "Bearer abc")).toBe(false);
    expect(verifyAuthorizationHeader("Bearer abc", undefined)).toBe(false);
  });
  it("validates notification batches and extracts the affected date range", () => {
    const parsed = googleNotificationBatchSchema.parse(JSON.parse(body));
    expect(notificationDateRange(parsed[0]!)).toEqual({ start: "2026-03-07", end: "2026-03-07" });
    expect(googleNotificationBatchSchema.safeParse([]).success).toBe(false);
    expect(googleNotificationBatchSchema.safeParse({ type: "verification" }).success).toBe(false);
  });
});
