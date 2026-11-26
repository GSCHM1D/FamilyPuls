import { createPublicKey, timingSafeEqual, verify, type KeyObject } from "node:crypto";
import { z } from "zod";

export const GOOGLE_HEALTH_KEYSET_URL = "https://www.gstatic.com/googlehealthapi/webhooks/webhooks_public_keyset.json";

interface TinkKeyset {
  primaryKeyId?: number;
  key: { keyData: { typeUrl: string; value: string }; status: string; keyId: number; outputPrefixType: string }[];
}

/** Constant-time comparison of the Authorization header with our configured secret. */
export function verifyAuthorizationHeader(header: string | null, expected: string | undefined): boolean {
  if (!header || !expected) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Minimal protobuf reader: returns length-delimited fields of a message. */
function readProtoFields(buf: Buffer): Map<number, Buffer> {
  const fields = new Map<number, Buffer>();
  let i = 0;
  const varint = () => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = buf[i++];
      if (byte === undefined) throw new Error("truncated varint");
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
    }
  };
  while (i < buf.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 2) {
      const len = varint();
      fields.set(field, buf.subarray(i, i + len));
      i += len;
    } else if (wire === 0) {
      varint();
    } else {
      throw new Error(`unsupported wire type ${wire}`);
    }
  }
  return fields;
}

/** Converts a serialized Tink EcdsaPublicKey (x = tag 3, y = tag 4) into a P-256 KeyObject. */
export function ecdsaPublicKeyFromTink(valueB64: string): KeyObject {
  const fields = readProtoFields(Buffer.from(valueB64, "base64"));
  const strip = (b: Buffer | undefined) => {
    if (!b) throw new Error("missing coordinate");
    let out = b;
    while (out.length > 32 && out[0] === 0) out = out.subarray(1);
    if (out.length > 32) throw new Error("invalid coordinate length");
    return Buffer.concat([Buffer.alloc(32 - out.length), out]);
  };
  const x = strip(fields.get(3));
  const y = strip(fields.get(4));
  return createPublicKey({ key: { kty: "EC", crv: "P-256", x: x.toString("base64url"), y: y.toString("base64url") }, format: "jwk" });
}

export function parseKeyset(json: unknown): Map<number, KeyObject> {
  const ks = json as TinkKeyset;
  const keys = new Map<number, KeyObject>();
  for (const k of ks.key ?? []) {
    if (k.status !== "ENABLED" || !k.keyData?.typeUrl?.endsWith("EcdsaPublicKey")) continue;
    keys.set(k.keyId, ecdsaPublicKeyFromTink(k.keyData.value));
  }
  return keys;
}

/**
 * Verifies GOOGLE-HEALTH-API-SIGNATURE: base64( 0x01 | keyId (4 bytes BE) | DER ECDSA-P256-SHA256 signature )
 * over the raw JSON body. Source: https://developers.google.com/health/webhooks#signature-verification
 */
export function verifyGoogleHealthSignature(rawBody: string, signatureB64: string | null, keys: Map<number, KeyObject>): boolean {
  if (!signatureB64) return false;
  let sig: Buffer;
  try {
    sig = Buffer.from(signatureB64, "base64");
  } catch {
    return false;
  }
  if (sig.length < 6 || sig[0] !== 0x01) return false;
  const keyId = sig.readUInt32BE(1);
  const key = keys.get(keyId);
  if (!key) return false;
  try {
    return verify("sha256", Buffer.from(rawBody, "utf8"), { key, dsaEncoding: "der" }, sig.subarray(5));
  } catch {
    return false;
  }
}

let keyCache: { keys: Map<number, KeyObject>; fetchedAt: number } | null = null;

/** Fetches (and caches for 1h) Google's public keyset; refetches once on unknown key id. */
export async function getGoogleHealthKeys(forceRefresh = false, fetchImpl: typeof fetch = fetch): Promise<Map<number, KeyObject>> {
  if (!forceRefresh && keyCache && Date.now() - keyCache.fetchedAt < 3_600_000) return keyCache.keys;
  const res = await fetchImpl(GOOGLE_HEALTH_KEYSET_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Keyset fetch failed: HTTP ${res.status}`);
  const keys = parseKeyset(await res.json());
  keyCache = { keys, fetchedAt: Date.now() };
  return keys;
}

const intervalSchema = z.object({
  physicalTimeInterval: z.object({ startTime: z.string().optional(), endTime: z.string().optional() }).optional(),
  civilIso8601TimeInterval: z.object({ startTime: z.string().optional(), endTime: z.string().optional() }).optional(),
}).passthrough();

export const googleNotificationSchema = z.object({
  data: z.object({
    version: z.string().optional(),
    clientProvidedSubscriptionName: z.string().max(300).optional(),
    healthUserId: z.string().min(1).max(63),
    operation: z.enum(["UPSERT", "DELETE"]),
    dataType: z.string().min(1).max(64),
    intervals: z.array(intervalSchema).max(500).optional(),
    recordId: z.string().max(128).optional(),
  }).passthrough(),
});

export const googleNotificationBatchSchema = z.array(googleNotificationSchema).min(1).max(99);

/** Local date range touched by a notification (civil time preferred). */
export function notificationDateRange(n: z.infer<typeof googleNotificationSchema>): { start: string; end: string } | null {
  const dates: string[] = [];
  for (const iv of n.data.intervals ?? []) {
    for (const t of [iv.civilIso8601TimeInterval?.startTime, iv.civilIso8601TimeInterval?.endTime, iv.physicalTimeInterval?.startTime, iv.physicalTimeInterval?.endTime]) {
      if (t && /^\d{4}-\d{2}-\d{2}/.test(t)) dates.push(t.slice(0, 10));
    }
  }
  if (dates.length === 0) return null;
  dates.sort();
  return { start: dates[0]!, end: dates[dates.length - 1]! };
}
