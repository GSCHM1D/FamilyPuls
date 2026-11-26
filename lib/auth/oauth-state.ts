import { z } from "zod";
import { tokenCrypto } from "@/lib/encryption/tokens";
import { pkceChallenge, randomUrlSafe } from "@/lib/providers/oauth";
import type { ProviderId } from "@/types/health";

const AAD = "oauth-state-v1";
export const OAUTH_STATE_TTL_SECONDS = 600;

const stateSchema = z.object({
  s: z.string().min(16),
  v: z.string().min(43),
  u: z.uuid(),
  p: z.enum(["whoop", "google_health"]),
  e: z.number().int(),
});

export function oauthCookieName(provider: ProviderId) {
  return `fp_oauth_${provider}`;
}

/** Creates state + PKCE verifier and an encrypted, user-bound cookie value. */
export function createOAuthState(userId: string, provider: ProviderId, now = Date.now()) {
  const state = randomUrlSafe(24);
  const verifier = randomUrlSafe(48);
  const cookie = tokenCrypto().encrypt(JSON.stringify({ s: state, v: verifier, u: userId, p: provider, e: now + OAUTH_STATE_TTL_SECONDS * 1000 }), AAD);
  return { state, verifier, challenge: pkceChallenge(verifier), cookie };
}

export type OAuthStateCheck = { ok: true; verifier: string } | { ok: false; reason: "missing" | "invalid" | "expired" | "mismatch" };

/** Validates the callback: same state, same user, same provider, not expired. */
export function verifyOAuthState(params: { cookie: string | undefined; state: string | null; userId: string; provider: ProviderId; now?: number }): OAuthStateCheck {
  const { cookie, state, userId, provider, now = Date.now() } = params;
  if (!cookie || !state) return { ok: false, reason: "missing" };
  let parsed: z.infer<typeof stateSchema>;
  try {
    parsed = stateSchema.parse(JSON.parse(tokenCrypto().decrypt(cookie, AAD)));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (parsed.e < now) return { ok: false, reason: "expired" };
  if (parsed.s !== state || parsed.u !== userId || parsed.p !== provider) return { ok: false, reason: "mismatch" };
  return { ok: true, verifier: parsed.v };
}
