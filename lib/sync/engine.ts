import { RateLimitedError, ProviderHttpError } from "@/lib/http/fetch-with-retry";
import { addDays, chunkDateRange, diffDays, localDateWithOffset, parseOffsetMinutes } from "@/lib/normalization/time";
import { GoogleHealthProvider } from "@/lib/providers/google-health/provider";
import { ReauthRequiredError, TokenBusyError, type TokenManager } from "@/lib/providers/token-manager";
import type { HealthProvider, ProviderContext } from "@/lib/providers/types";
import { whoopSleepLocalDate } from "@/lib/providers/whoop/normalize";
import { WhoopProvider } from "@/lib/providers/whoop/provider";
import { logSafe } from "@/lib/security/redact";
import type { ProviderId } from "@/types/health";
import type { HealthDataWriter } from "./writer";

export type JobKind = "initial" | "incremental" | "backfill" | "webhook" | "manual" | "fallback";

export interface JobRecord {
  id: string;
  connection_id: string;
  user_id: string;
  kind: JobKind;
  range_start: string | null;
  range_end: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export interface ConnectionRecord {
  id: string;
  user_id: string;
  provider: ProviderId;
  status: string;
  granted_scopes: string[];
  timezone: string;
}

export interface SyncStore {
  getConnection(id: string): Promise<ConnectionRecord | null>;
  completeJob(id: string): Promise<void>;
  /** retryAt null => permanently failed */
  failJob(id: string, error: string, retryAt: Date | null): Promise<void>;
  cancelJob(id: string, reason: string): Promise<void>;
  updateConnection(id: string, patch: Record<string, unknown>): Promise<void>;
  log(entry: { connectionId: string; userId: string; jobId: string | null; level: "info" | "warn" | "error"; message: string; records?: number }): Promise<void>;
  findLocalDate(table: "sleep_sessions" | "workouts", userId: string, source: ProviderId, externalId: string): Promise<string | null>;
  saveMeasurements?(userId: string, source: ProviderId, rows: { metric: string; value: number; unit: string; localDate: string; measuredAt: string }[]): Promise<void>;
}

export interface EngineDeps {
  store: SyncStore;
  writer: HealthDataWriter;
  providerFor: (id: ProviderId) => HealthProvider | null;
  tokenManagerFor: (provider: HealthProvider) => TokenManager;
  today: (timeZone: string) => string;
  now?: () => Date;
}

/** Exponential backoff for failed jobs: 1, 2, 4, 8 … minutes (max 6 h) with jitter. */
export function jobRetryDelayMs(attempts: number, random = Math.random): number {
  const base = Math.min(6 * 3_600_000, 60_000 * 2 ** Math.max(0, attempts - 1));
  return base + Math.floor(random() * 30_000);
}

export interface WebhookPayload {
  resource?: "sleep" | "recovery" | "workout";
  operation?: "updated" | "deleted";
  resourceId?: string;
}

/** Determines the local date range a job has to (re-)synchronise. */
export async function resolveJobRange(job: JobRecord, conn: ConnectionRecord, provider: HealthProvider, ctx: ProviderContext, deps: EngineDeps): Promise<{ start: string; end: string } | null> {
  if (job.kind !== "webhook" || job.range_start) {
    const end = job.range_end ?? deps.today(conn.timezone);
    const start = job.range_start ?? addDays(end, -2);
    return { start, end };
  }
  // WHOOP webhooks carry a resource id instead of a date.
  const p = job.payload as WebhookPayload;
  if (!p.resourceId || !p.resource) return null;
  let date: string | null = null;
  if (p.operation === "deleted") {
    date = await deps.store.findLocalDate(p.resource === "workout" ? "workouts" : "sleep_sessions", conn.user_id, conn.provider, p.resourceId);
  } else if (provider instanceof WhoopProvider) {
    if (p.resource === "workout") {
      const w = await provider.getWorkoutById(ctx, p.resourceId);
      date = localDateWithOffset(w.start, parseOffsetMinutes(w.timezone_offset));
    } else {
      // recovery.* events reference the associated sleep id (v2 webhooks)
      date = whoopSleepLocalDate(await provider.getSleepById(ctx, p.resourceId));
    }
  }
  if (!date) return null;
  return { start: addDays(date, -1), end: addDays(date, 1) };
}

export async function executeJob(job: JobRecord, deps: EngineDeps): Promise<"succeeded" | "failed" | "retry" | "cancelled"> {
  const { store } = deps;
  const conn = await store.getConnection(job.connection_id);
  if (!conn || conn.status === "disconnected") {
    await store.cancelJob(job.id, "connection removed");
    return "cancelled";
  }
  if (conn.status === "reauth_required") {
    await store.cancelJob(job.id, "re-authorization required");
    return "cancelled";
  }
  const provider = deps.providerFor(conn.provider);
  if (!provider) {
    await store.failJob(job.id, "provider not configured on server", null);
    return "failed";
  }
  if (provider instanceof GoogleHealthProvider) provider.granted = new Set(conn.granted_scopes);

  const tokens = deps.tokenManagerFor(provider);
  const ctx: ProviderContext = {
    connectionId: conn.id,
    userId: conn.user_id,
    timeZone: conn.timezone,
    getAccessToken: (stale) => tokens.getAccessToken(conn.id, stale),
  };

  await store.updateConnection(conn.id, { status: "syncing" });
  try {
    const range = await resolveJobRange(job, conn, provider, ctx, deps);
    let records = 0;
    if (range) {
      // never sync the future, never more than 400 days in one job
      const today = deps.today(conn.timezone);
      const end = range.end > today ? today : range.end;
      const start = diffDays(range.start, end) > 400 ? addDays(end, -400) : range.start;
      for (const chunk of chunkDateRange(start, end, provider.maxRangeDays)) {
        const batch = await provider.fetchRange(ctx, chunk.start, chunk.end);
        const res = await deps.writer.replaceRange(conn.user_id, conn.provider, chunk, batch);
        records += res.daily + res.sleep + res.workouts;
      }
    }
    if (provider instanceof WhoopProvider && store.saveMeasurements && (job.kind === "initial" || job.kind === "manual" || job.kind === "fallback")) {
      try {
        const body = await provider.getBodyMeasurement(ctx);
        const nowIso = (deps.now?.() ?? new Date()).toISOString();
        const localDate = deps.today(conn.timezone);
        await store.saveMeasurements(conn.user_id, "whoop", [
          { metric: "height", value: body.height_meter, unit: "m", localDate, measuredAt: nowIso },
          { metric: "weight", value: body.weight_kilogram, unit: "kg", localDate, measuredAt: nowIso },
          { metric: "max_heart_rate_setting", value: body.max_heart_rate, unit: "bpm", localDate, measuredAt: nowIso },
        ].filter((r) => Number.isFinite(r.value)));
      } catch (err) {
        logSafe.warn("body measurement fetch failed", err);
      }
    }
    await store.updateConnection(conn.id, { status: "active", last_synced_at: (deps.now?.() ?? new Date()).toISOString(), last_error: null });
    await store.completeJob(job.id);
    await store.log({ connectionId: conn.id, userId: conn.user_id, jobId: job.id, level: "info", message: `${job.kind} sync ok${range ? ` ${range.start}…${range.end}` : ""}`, records });
    return "succeeded";
  } catch (err) {
    if (err instanceof ReauthRequiredError) {
      await store.updateConnection(conn.id, { status: "reauth_required", last_error: "Re-authorization required" });
      await store.failJob(job.id, "reauth_required", null);
      await store.log({ connectionId: conn.id, userId: conn.user_id, jobId: job.id, level: "error", message: "Re-authorization required" });
      return "failed";
    }
    const now = deps.now?.() ?? new Date();
    if (err instanceof RateLimitedError || err instanceof TokenBusyError) {
      const wait = err instanceof RateLimitedError ? err.retryAfterMs : 15_000;
      await store.updateConnection(conn.id, { status: "active" });
      await store.failJob(job.id, err.message, new Date(now.getTime() + wait + 1_000));
      return "retry";
    }
    // Permission errors (scope withdrawn) are not retried.
    const permanent = err instanceof ProviderHttpError && (err.status === 403 || err.status === 404 || err.status === 400);
    const message = err instanceof ProviderHttpError ? `Provider HTTP ${err.status}` : err instanceof Error ? err.message.slice(0, 200) : "unknown error";
    logSafe.error(`sync job ${job.id} failed`, err);
    const canRetry = !permanent && job.attempts < job.max_attempts;
    await store.updateConnection(conn.id, { status: canRetry ? "active" : "error", last_error: message });
    await store.failJob(job.id, message, canRetry ? new Date(now.getTime() + jobRetryDelayMs(job.attempts)) : null);
    await store.log({ connectionId: conn.id, userId: conn.user_id, jobId: job.id, level: canRetry ? "warn" : "error", message });
    return canRetry ? "retry" : "failed";
  }
}
