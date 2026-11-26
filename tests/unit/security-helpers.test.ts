import { afterEach, describe, expect, it, vi } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { hashInvitationToken, generateInvitationToken, invitationTokenSchema, isInvitationUsable } from "@/lib/auth/invitations";
import { buildCsp, isPublicPath } from "@/lib/security/csp";
import { logSafe, redact } from "@/lib/security/redact";

afterEach(() => vi.restoreAllMocks());

describe("log redaction", () => {
  it("removes tokens and secrets from logged objects and strings", () => {
    const out = JSON.stringify(redact({ access_token: "abc", refreshToken: "def", nested: { client_secret: "s" }, msg: "Authorization: Bearer abc.def-ghi", jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVl" }));
    expect(out).not.toMatch(/"abc"|"def"|"s"|abc\.def-ghi|eyJhbGci/);
  });
  it("logSafe never prints raw tokens", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logSafe.error("refresh failed", { refresh_token: "RT-SECRET", response: "Bearer AT-SECRET" });
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/RT-SECRET|AT-SECRET/);
  });
});

describe("redirect safety", () => {
  it("only allows relative in-app paths", () => {
    expect(safeNextPath("/family")).toBe("/family");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath("/api/account")).toBe("/dashboard");
  });
});

describe("public paths & CSP", () => {
  it("keeps health pages and data APIs private", () => {
    for (const p of ["/dashboard", "/family", "/family/x", "/trends", "/settings", "/api/account/export", "/api/sync/manual"]) expect(isPublicPath(p)).toBe(false);
    for (const p of ["/login", "/invite/abc", "/api/webhooks/whoop", "/api/sync/cron"]) expect(isPublicPath(p)).toBe(true);
  });
  it("builds a strict CSP with a nonce and no unsafe-inline scripts", () => {
    const csp = buildCsp("NONCE", { isDev: false, supabaseUrl: "https://abc.supabase.co" });
    expect(csp).toContain("script-src 'self' 'nonce-NONCE' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co");
  });
});

describe("cron auth", () => {
  it("rejects short secrets even if they match", () => {
    expect(isAuthorizedCron(new Request("https://x", { headers: { authorization: "Bearer short" } }), "short")).toBe(false);
    const s = "s".repeat(40);
    expect(isAuthorizedCron(new Request("https://x", { headers: { authorization: `Bearer ${s}` } }), s)).toBe(true);
  });
});

describe("invitations", () => {
  it("stores only a hash and validates token format", () => {
    const { token, hash } = generateInvitationToken();
    expect(hash).toBe(hashInvitationToken(token));
    expect(hash).not.toContain(token);
    expect(invitationTokenSchema.safeParse(token).success).toBe(true);
    expect(invitationTokenSchema.safeParse("../../etc").success).toBe(false);
  });
  it("rejects expired, revoked and accepted invitations", () => {
    const base = { id: "i", family_id: "f", email: "a@b.ch", role: "member" as const, accepted_at: null, revoked_at: null, expires_at: "2026-12-01T00:00:00Z" };
    const now = new Date("2026-11-26T00:00:00Z");
    expect(isInvitationUsable(base, now)).toBe(true);
    expect(isInvitationUsable({ ...base, expires_at: "2026-11-01T00:00:00Z" }, now)).toBe(false);
    expect(isInvitationUsable({ ...base, revoked_at: "2026-11-20T00:00:00Z" }, now)).toBe(false);
    expect(isInvitationUsable({ ...base, accepted_at: "2026-11-20T00:00:00Z" }, now)).toBe(false);
    expect(isInvitationUsable(null, now)).toBe(false);
  });
});
