import { describe, expect, it, vi } from "vitest";
import { fetchWithRetry, ProviderHttpError, RateLimitedError, retryAfterFromHeaders } from "@/lib/http/fetch-with-retry";
import { requestToken } from "@/lib/providers/oauth";

const res = (status: number, headers: Record<string, string> = {}, body = "{}") => new Response(body, { status, headers });

describe("fetchWithRetry", () => {
  it("retries 5xx with exponential backoff and succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(502)).mockResolvedValueOnce(res(200));
    const sleeps: number[] = [];
    const r = await fetchWithRetry("https://x", {}, { fetchImpl, sleepImpl: async (ms) => void sleeps.push(ms), random: () => 0, baseDelayMs: 100 });
    expect(r.status).toBe(200);
    expect(sleeps).toEqual([100, 200]);
  });

  it("honours Retry-After / X-RateLimit-Reset on 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(429, { "x-ratelimit-reset": "3" })).mockResolvedValueOnce(res(200));
    const sleeps: number[] = [];
    await fetchWithRetry("https://x", {}, { fetchImpl, sleepImpl: async (ms) => void sleeps.push(ms) });
    expect(sleeps[0]).toBe(3250);
  });

  it("throws RateLimitedError instead of blocking for long waits", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(429, { "retry-after": "120" }));
    await expect(fetchWithRetry("https://x", {}, { fetchImpl, sleepImpl: async () => undefined })).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("throws RateLimitedError when retries are exhausted on 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(429));
    await expect(fetchWithRetry("https://x", {}, { fetchImpl, sleepImpl: async () => undefined, maxRetries: 2 })).rejects.toBeInstanceOf(RateLimitedError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry client errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(403, {}, '{"error":"forbidden"}'));
    await expect(fetchWithRetry("https://x", {}, { fetchImpl })).rejects.toMatchObject({ status: 403 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries network errors", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(res(200));
    expect((await fetchWithRetry("https://x", {}, { fetchImpl, sleepImpl: async () => undefined })).status).toBe(200);
  });

  it("parses Retry-After dates", () => {
    const now = Date.parse("2026-11-26T12:00:00Z");
    expect(retryAfterFromHeaders(new Headers({ "retry-after": "Thu, 26 Nov 2026 12:00:10 GMT" }), now)).toBe(10_000);
  });
});

describe("OAuth token requests", () => {
  it("sends form-encoded params and computes expiry", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded" });
      expect(String(init?.body)).toContain("grant_type=refresh_token");
      return res(200, {}, JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 3600, scope: "offline read:sleep" }));
    });
    const t = await requestToken("https://token", { grant_type: "refresh_token", refresh_token: "x" }, { fetchImpl: fetchImpl as typeof fetch, now: () => 0 });
    expect(t).toEqual({ accessToken: "a", refreshToken: "r", expiresAt: new Date(3_600_000).toISOString(), scope: "offline read:sleep" });
  });

  it("maps provider errors to OAuthError (invalid_grant => re-auth)", async () => {
    const fetchImpl = vi.fn(async () => res(400, {}, '{"error":"invalid_grant"}'));
    await expect(requestToken("https://token", {}, { fetchImpl: fetchImpl as typeof fetch })).rejects.toMatchObject({ code: "invalid_grant", isInvalidGrant: true });
  });

  it("error objects never include the token request body", async () => {
    const fetchImpl = vi.fn(async () => res(401, {}, "unauthorized"));
    try {
      await requestToken("https://token", { client_secret: "SECRET-123", refresh_token: "RT-456" }, { fetchImpl: fetchImpl as typeof fetch });
    } catch (err) {
      expect(JSON.stringify(err)).not.toContain("SECRET-123");
      expect(String(err)).not.toContain("RT-456");
      expect(err).not.toBeInstanceOf(ProviderHttpError);
    }
  });
});
