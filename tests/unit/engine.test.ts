import { describe, expect, it, vi } from "vitest";
import { RateLimitedError, ProviderHttpError } from "@/lib/http/fetch-with-retry";
import { executeJob, jobRetryDelayMs, type ConnectionRecord, type EngineDeps, type JobRecord, type SyncStore } from "@/lib/sync/engine";
import { ReauthRequiredError, TokenManager } from "@/lib/providers/token-manager";
import type { HealthProvider } from "@/lib/providers/types";
import { WhoopProvider } from "@/lib/providers/whoop/provider";
import type { HealthDataWriter } from "@/lib/sync/writer";
import { whoopSleep } from "./fixtures/whoop";

const conn: ConnectionRecord = { id: "c1", user_id: "u1", provider: "whoop", status: "active", granted_scopes: [], timezone: "Europe/Zurich" };
const job = (over: Partial<JobRecord> = {}): JobRecord => ({ id: "j1", connection_id: "c1", user_id: "u1", kind: "incremental", range_start: "2026-11-20", range_end: "2026-11-26", payload: {}, attempts: 1, max_attempts: 6, ...over });

function deps(provider: Partial<HealthProvider>, storeOver: Partial<SyncStore> = {}, connection: ConnectionRecord | null = conn) {
  const store: SyncStore = {
    getConnection: vi.fn(async () => connection),
    completeJob: vi.fn(async () => undefined),
    failJob: vi.fn(async () => undefined),
    cancelJob: vi.fn(async () => undefined),
    updateConnection: vi.fn(async () => undefined),
    log: vi.fn(async () => undefined),
    findLocalDate: vi.fn(async () => null),
    ...storeOver,
  };
  const writer: HealthDataWriter = { replaceRange: vi.fn(async () => ({ daily: 3, sleep: 1, workouts: 0, deleted: 0 })) };
  const d: EngineDeps = {
    store,
    writer,
    providerFor: () => ({ id: "whoop", maxRangeDays: 31, fetchRange: vi.fn(async () => ({ daily: [], sleep: [], workouts: [] })), ...provider }) as unknown as HealthProvider,
    tokenManagerFor: () => ({ getAccessToken: async () => "token" }) as unknown as TokenManager,
    today: () => "2026-11-26",
    now: () => new Date("2026-11-26T12:00:00Z"),
  };
  return { d, store, writer };
}

describe("sync engine", () => {
  it("fetches the range, writes it and marks the connection active", async () => {
    const fetchRange = vi.fn(async (_ctx: unknown, _start: string, _end: string) => ({ daily: [], sleep: [], workouts: [] }));
    const { d, store, writer } = deps({ fetchRange });
    expect(await executeJob(job(), d)).toBe("succeeded");
    expect(fetchRange).toHaveBeenCalledWith(expect.anything(), "2026-11-20", "2026-11-26");
    expect(writer.replaceRange).toHaveBeenCalledWith("u1", "whoop", { start: "2026-11-20", end: "2026-11-26" }, expect.anything());
    expect(store.updateConnection).toHaveBeenLastCalledWith("c1", expect.objectContaining({ status: "active" }));
    expect(store.completeJob).toHaveBeenCalledWith("j1");
  });

  it("splits long ranges into provider-sized chunks and never syncs the future", async () => {
    const fetchRange = vi.fn(async (_ctx: unknown, _start: string, _end: string) => ({ daily: [], sleep: [], workouts: [] }));
    const { d } = deps({ fetchRange, maxRangeDays: 10 });
    await executeJob(job({ range_start: "2026-11-01", range_end: "2026-12-31" }), d);
    expect(fetchRange.mock.calls.map((c) => [c[1], c[2]])).toEqual([["2026-11-01", "2026-11-10"], ["2026-11-11", "2026-11-20"], ["2026-11-21", "2026-11-26"]]);
  });

  it("resolves WHOOP webhook jobs to the affected local date ±1 day", async () => {
    const provider = Object.create(WhoopProvider.prototype) as WhoopProvider;
    Object.assign(provider, { maxRangeDays: 31, getSleepById: vi.fn(async () => whoopSleep), fetchRange: vi.fn(async () => ({ daily: [], sleep: [], workouts: [] })), getBodyMeasurement: vi.fn() });
    const { d } = deps({});
    d.providerFor = () => provider;
    await executeJob(job({ kind: "webhook", range_start: null, range_end: null, payload: { resource: "recovery", operation: "updated", resourceId: whoopSleep.id } }), d);
    expect(provider.getSleepById).toHaveBeenCalledWith(expect.anything(), whoopSleep.id);
    expect(provider.fetchRange).toHaveBeenCalledWith(expect.anything(), "2026-11-24", "2026-11-26");
  });

  it("re-syncs the stored date of deleted records (deletion propagates)", async () => {
    const fetchRange = vi.fn(async (_ctx: unknown, _start: string, _end: string) => ({ daily: [], sleep: [], workouts: [] }));
    const { d } = deps({ fetchRange }, { findLocalDate: vi.fn(async () => "2026-11-10") });
    await executeJob(job({ kind: "webhook", range_start: null, range_end: null, payload: { resource: "sleep", operation: "deleted", resourceId: "gone" } }), d);
    expect(fetchRange).toHaveBeenCalledWith(expect.anything(), "2026-11-09", "2026-11-11");
  });

  it("requeues rate-limited jobs at the provider's retry time", async () => {
    const { d, store } = deps({ fetchRange: vi.fn(async () => { throw new RateLimitedError(60_000); }) });
    expect(await executeJob(job(), d)).toBe("retry");
    const retryAt = (store.failJob as ReturnType<typeof vi.fn>).mock.calls[0]![2] as Date;
    expect(retryAt.getTime()).toBe(Date.parse("2026-11-26T12:01:01Z"));
  });

  it("retries transient errors with backoff and gives up after max attempts", async () => {
    const failing = { fetchRange: vi.fn(async () => { throw new ProviderHttpError("HTTP 500", 500, ""); }) };
    const a = deps(failing);
    expect(await executeJob(job({ attempts: 2 }), a.d)).toBe("retry");
    const b = deps(failing);
    expect(await executeJob(job({ attempts: 6 }), b.d)).toBe("failed");
    expect(b.store.updateConnection).toHaveBeenLastCalledWith("c1", expect.objectContaining({ status: "error" }));
  });

  it("does not retry when the user must re-authorize", async () => {
    const { d, store } = deps({ fetchRange: vi.fn(async () => { throw new ReauthRequiredError(); }) });
    expect(await executeJob(job(), d)).toBe("failed");
    expect(store.updateConnection).toHaveBeenCalledWith("c1", expect.objectContaining({ status: "reauth_required" }));
    expect(store.failJob).toHaveBeenCalledWith("j1", "reauth_required", null);
  });

  it("cancels jobs of disconnected connections", async () => {
    const { d, store } = deps({}, {}, { ...conn, status: "disconnected" });
    expect(await executeJob(job(), d)).toBe("cancelled");
    expect(store.cancelJob).toHaveBeenCalled();
  });

  it("uses growing, capped backoff", () => {
    expect(jobRetryDelayMs(1, () => 0)).toBe(60_000);
    expect(jobRetryDelayMs(3, () => 0)).toBe(240_000);
    expect(jobRetryDelayMs(30, () => 0)).toBe(6 * 3_600_000);
  });
});
