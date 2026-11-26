import { describe, expect, it, vi } from "vitest";
import { OAuthError, type TokenSet } from "@/lib/providers/oauth";
import { ReauthRequiredError, TokenBusyError, TokenManager, type CredentialStore, type StoredCredentials } from "@/lib/providers/token-manager";

/** In-memory store with a real lease lock, emulating public.acquire_refresh_lock. */
class MemoryStore implements CredentialStore {
  creds = new Map<string, StoredCredentials>();
  lockedUntil = new Map<string, number>();
  reauth: string[] = [];
  constructor(private readonly now: () => number) {}
  async load(id: string) {
    const c = this.creds.get(id);
    return c ? { ...c } : null;
  }
  async save(id: string, c: StoredCredentials) {
    this.creds.set(id, { ...c });
  }
  async acquireRefreshLock(id: string, lease: number) {
    const until = this.lockedUntil.get(id) ?? 0;
    if (until > this.now()) return false;
    this.lockedUntil.set(id, this.now() + lease * 1000);
    return true;
  }
  async releaseRefreshLock(id: string) {
    this.lockedUntil.delete(id);
  }
  async markReauthRequired(id: string) {
    this.reauth.push(id);
  }
}

const NOW = Date.parse("2026-11-26T12:00:00Z");
const clock = () => NOW;

function setup(expiresInSec: number, refresh: (rt: string) => Promise<TokenSet>) {
  const store = new MemoryStore(clock);
  store.creds.set("c1", { accessToken: "old-access", refreshToken: "rt-1", expiresAt: new Date(NOW + expiresInSec * 1000).toISOString(), scope: "offline" });
  const tm = new TokenManager(store, refresh, { now: clock, sleepImpl: async () => undefined, pollIntervalMs: 1, waitForOtherRefreshMs: 50 });
  return { store, tm };
}

describe("TokenManager", () => {
  it("does not refresh a valid token (on-demand refresh only)", async () => {
    const refresh = vi.fn();
    const { tm } = setup(3600, refresh);
    expect(await tm.getAccessToken("c1")).toBe("old-access");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes shortly before expiry and stores the rotated refresh token", async () => {
    const refresh = vi.fn(async () => ({ accessToken: "new-access", refreshToken: "rt-2", expiresAt: new Date(NOW + 3600_000).toISOString(), scope: "offline" }));
    const { tm, store } = setup(60, refresh);
    expect(await tm.getAccessToken("c1")).toBe("new-access");
    expect(refresh).toHaveBeenCalledWith("rt-1");
    expect(store.creds.get("c1")?.refreshToken).toBe("rt-2");
  });

  it("keeps the previous refresh token if the provider does not rotate (Google)", async () => {
    const { tm, store } = setup(0, async () => ({ accessToken: "new", refreshToken: null, expiresAt: new Date(NOW + 3600_000).toISOString(), scope: null }));
    await tm.getAccessToken("c1");
    expect(store.creds.get("c1")?.refreshToken).toBe("rt-1");
  });

  it("performs exactly one refresh for concurrent callers (rotation-safe)", async () => {
    // real clock + real sleeps: the second caller polls until the first refresh is stored
    const store = new MemoryStore(Date.now);
    store.creds.set("c1", { accessToken: "old-access", refreshToken: "rt-1", expiresAt: new Date(Date.now() - 1000).toISOString(), scope: null });
    let calls = 0;
    const tm = new TokenManager(
      store,
      async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 20));
        return { accessToken: "fresh", refreshToken: "rt-2", expiresAt: new Date(Date.now() + 3600_000).toISOString(), scope: null };
      },
      { pollIntervalMs: 2, waitForOtherRefreshMs: 2000 },
    );
    expect(await Promise.all([tm.getAccessToken("c1"), tm.getAccessToken("c1"), tm.getAccessToken("c1")])).toEqual(["fresh", "fresh", "fresh"]);
    expect(calls).toBe(1);
  });

  it("marks the connection for re-authorization when the refresh token is rejected", async () => {
    const { tm, store } = setup(0, async () => {
      throw new OAuthError("invalid_grant", 400);
    });
    await expect(tm.getAccessToken("c1")).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(store.reauth).toEqual(["c1"]);
    expect(store.lockedUntil.size).toBe(0); // lock released
  });

  it("forces a refresh after a 401 unless another worker already replaced the token", async () => {
    const refresh = vi.fn(async () => ({ accessToken: "after-401", refreshToken: "rt-2", expiresAt: new Date(NOW + 3600_000).toISOString(), scope: null }));
    const { tm, store } = setup(3600, refresh);
    expect(await tm.getAccessToken("c1", "old-access")).toBe("after-401");
    store.creds.set("c1", { ...store.creds.get("c1")!, accessToken: "someone-else" });
    expect(await tm.getAccessToken("c1", "after-401")).toBe("someone-else");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("gives up with TokenBusyError if another worker holds the lock too long", async () => {
    const { tm, store } = setup(0, async () => ({ accessToken: "x", refreshToken: null, expiresAt: null, scope: null }));
    store.lockedUntil.set("c1", NOW + 60_000);
    let t = NOW;
    const slowTm = new TokenManager(store, async () => ({ accessToken: "x", refreshToken: null, expiresAt: null, scope: null }), { now: () => (t += 20), sleepImpl: async () => undefined, waitForOtherRefreshMs: 100, pollIntervalMs: 1 });
    void tm;
    await expect(slowTm.getAccessToken("c1")).rejects.toBeInstanceOf(TokenBusyError);
  });
});
