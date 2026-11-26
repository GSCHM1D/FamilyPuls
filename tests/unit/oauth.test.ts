import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createOAuthState, verifyOAuthState } from "@/lib/auth/oauth-state";
import { GoogleHealthProvider, missingScopes, GOOGLE_HEALTH_SCOPES } from "@/lib/providers/google-health/provider";
import { pkceChallenge } from "@/lib/providers/oauth";
import { WhoopProvider } from "@/lib/providers/whoop/provider";

const USER = "00000000-0000-4000-8000-000000000001";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("OAuth state (CSRF) + PKCE", () => {
  it("accepts the matching state for the same user and provider", () => {
    const s = createOAuthState(USER, "google_health");
    const r = verifyOAuthState({ cookie: s.cookie, state: s.state, userId: USER, provider: "google_health" });
    expect(r).toEqual({ ok: true, verifier: s.verifier });
    expect(s.challenge).toBe(pkceChallenge(s.verifier));
    expect(s.cookie).not.toContain(s.verifier);
  });
  it("rejects a forged state, another user, another provider, expiry and tampering", () => {
    const s = createOAuthState(USER, "whoop");
    expect(verifyOAuthState({ cookie: s.cookie, state: "forged-state-value", userId: USER, provider: "whoop" })).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyOAuthState({ cookie: s.cookie, state: s.state, userId: "00000000-0000-4000-8000-000000000002", provider: "whoop" })).toMatchObject({ ok: false });
    expect(verifyOAuthState({ cookie: s.cookie, state: s.state, userId: USER, provider: "google_health" })).toMatchObject({ ok: false });
    expect(verifyOAuthState({ cookie: s.cookie, state: s.state, userId: USER, provider: "whoop", now: Date.now() + 11 * 60_000 })).toMatchObject({ ok: false, reason: "expired" });
    expect(verifyOAuthState({ cookie: s.cookie.slice(0, -4) + "AAAA", state: s.state, userId: USER, provider: "whoop" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(verifyOAuthState({ cookie: undefined, state: s.state, userId: USER, provider: "whoop" })).toMatchObject({ ok: false, reason: "missing" });
  });
});

describe("authorization URLs", () => {
  it("WHOOP: read scopes + offline, state ≥ 8 chars", () => {
    const url = new URL(new WhoopProvider({ clientId: "cid", clientSecret: "secret", redirectUri: "https://app/api/whoop/callback" }).buildAuthorizationUrl({ state: "abcdefghij", codeChallenge: "x" }));
    expect(url.origin + url.pathname).toBe("https://api.prod.whoop.com/oauth/oauth2/auth");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(["offline", "read:recovery", "read:cycles", "read:workout", "read:sleep", "read:profile", "read:body_measurement"]);
    expect(url.searchParams.get("state")).toBe("abcdefghij");
    expect(url.toString()).not.toContain("secret");
  });
  it("Google: only read-only health scopes, offline access, PKCE S256", () => {
    const url = new URL(new GoogleHealthProvider({ clientId: "cid", clientSecret: "secret", redirectUri: "https://app/api/google-health/callback" }).buildAuthorizationUrl({ state: "st", codeChallenge: "chal" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const scopes = url.searchParams.get("scope")!.split(" ");
    expect(scopes.every((s) => s.endsWith(".readonly"))).toBe(true);
    expect(scopes.some((s) => /location|nutrition|ecg|write/.test(s))).toBe(false);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("chal");
  });
  it("detects partially granted Google scopes", () => {
    expect(missingScopes(GOOGLE_HEALTH_SCOPES.join(" "))).toEqual([]);
    expect(missingScopes(GOOGLE_HEALTH_SCOPES[1])).toHaveLength(3);
    expect(missingScopes(null)).toHaveLength(4);
  });
});
