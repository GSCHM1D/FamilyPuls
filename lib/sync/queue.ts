import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addDays, chunkDateRange, DEFAULT_TIMEZONE, todayInZone } from "@/lib/normalization/time";
import { getProvider } from "@/lib/providers/registry";
import { TokenManager } from "@/lib/providers/token-manager";
import { logSafe } from "@/lib/security/redact";
import type { ProviderId } from "@/types/health";
import { SupabaseCredentialStore } from "./credential-store";
import { executeJob, type ConnectionRecord, type EngineDeps, type JobKind, type JobRecord, type SyncStore } from "./engine";
import { SupabaseHealthWriter } from "./writer";

export const INITIAL_IMPORT_DAYS = 30;
export const MAX_HISTORY_DAYS = 365;

export class SupabaseSyncStore implements SyncStore {
  constructor(private readonly db: SupabaseClient) {}

  async getConnection(id: string): Promise<ConnectionRecord | null> {
    const { data } = await this.db.from("provider_connections").select("id, user_id, provider, status, granted_scopes").eq("id", id).maybeSingle();
    if (!data) return null;
    const { data: profile } = await this.db.from("profiles").select("timezone").eq("id", data.user_id).maybeSingle();
    return { ...data, timezone: profile?.timezone ?? DEFAULT_TIMEZONE } as ConnectionRecord;
  }

  async completeJob(id: string) {
    await this.db.from("sync_jobs").update({ status: "succeeded", finished_at: new Date().toISOString(), locked_until: null, last_error: null }).eq("id", id);
  }

  async failJob(id: string, error: string, retryAt: Date | null) {
    await this.db
      .from("sync_jobs")
      .update(
        retryAt
          ? { status: "queued", run_after: retryAt.toISOString(), locked_until: null, last_error: error.slice(0, 300) }
          : { status: "failed", finished_at: new Date().toISOString(), locked_until: null, last_error: error.slice(0, 300) },
      )
      .eq("id", id);
  }

  async cancelJob(id: string, reason: string) {
    await this.db.from("sync_jobs").update({ status: "cancelled", finished_at: new Date().toISOString(), locked_until: null, last_error: reason }).eq("id", id);
  }

  async updateConnection(id: string, patch: Record<string, unknown>) {
    await this.db.from("provider_connections").update(patch).eq("id", id);
  }

  async log(entry: { connectionId: string; userId: string; jobId: string | null; level: "info" | "warn" | "error"; message: string; records?: number }) {
    await this.db.from("sync_logs").insert({
      connection_id: entry.connectionId,
      user_id: entry.userId,
      job_id: entry.jobId,
      level: entry.level,
      message: entry.message.slice(0, 500),
      records: entry.records ?? null,
    });
  }

  async findLocalDate(table: "sleep_sessions" | "workouts", userId: string, source: ProviderId, externalId: string) {
    const { data } = await this.db.from(table).select("local_date").eq("user_id", userId).eq("source", source).eq("external_id", externalId).maybeSingle();
    return (data?.local_date as string | undefined) ?? null;
  }

  async saveMeasurements(userId: string, source: ProviderId, rows: { metric: string; value: number; unit: string; localDate: string; measuredAt: string }[]) {
    if (!rows.length) return;
    await this.db.from("health_measurements").upsert(
      rows.map((r) => ({ user_id: userId, source, metric: r.metric, category: "health_metrics", value: r.value, unit: r.unit, local_date: r.localDate, measured_at: r.measuredAt })),
      { onConflict: "user_id,source,metric,local_date" },
    );
  }
}

export function defaultEngineDeps(db: SupabaseClient = supabaseAdmin()): EngineDeps {
  const credentials = new SupabaseCredentialStore(db);
  return {
    store: new SupabaseSyncStore(db),
    writer: new SupabaseHealthWriter(db),
    providerFor: getProvider,
    tokenManagerFor: (provider) => new TokenManager(credentials, (rt) => provider.refresh(rt)),
    today: (tz) => todayInZone(tz),
  };
}

export interface EnqueueInput {
  connectionId: string;
  userId: string;
  kind: JobKind;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
  runAfter?: Date;
}

/** Inserts a job; returns false if an identical open job (same dedupe key) already exists. */
export async function enqueueJob(input: EnqueueInput, db: SupabaseClient = supabaseAdmin()): Promise<boolean> {
  const { error } = await db.from("sync_jobs").insert({
    connection_id: input.connectionId,
    user_id: input.userId,
    kind: input.kind,
    range_start: input.rangeStart ?? null,
    range_end: input.rangeEnd ?? null,
    payload: input.payload ?? {},
    dedupe_key: input.dedupeKey ?? null,
    run_after: (input.runAfter ?? new Date()).toISOString(),
  });
  if (error?.code === "23505") return false; // unique violation => already queued
  if (error) throw new Error(`enqueue failed: ${error.code}`);
  return true;
}

/** First import after connecting: last 30 days, processed in the background. */
export async function enqueueInitialImport(connectionId: string, userId: string, timeZone: string) {
  const end = todayInZone(timeZone);
  await enqueueJob({ connectionId, userId, kind: "initial", rangeStart: addDays(end, -(INITIAL_IMPORT_DAYS - 1)), rangeEnd: end, dedupeKey: `initial:${connectionId}` });
}

/** Optional history extension up to 365 days, split into ~30-day jobs so each stays well inside function limits. */
export async function enqueueBackfill(connectionId: string, userId: string, timeZone: string, days = MAX_HISTORY_DAYS) {
  const end = addDays(todayInZone(timeZone), -INITIAL_IMPORT_DAYS);
  const start = addDays(todayInZone(timeZone), -(Math.min(days, MAX_HISTORY_DAYS) - 1));
  let i = 0;
  for (const chunk of chunkDateRange(start, end, 30).reverse()) {
    await enqueueJob({
      connectionId,
      userId,
      kind: "backfill",
      rangeStart: chunk.start,
      rangeEnd: chunk.end,
      dedupeKey: `backfill:${connectionId}:${chunk.start}`,
      // spread over time to respect provider rate limits
      runAfter: new Date(Date.now() + i++ * 60_000),
    });
  }
}

/** Claims due jobs and runs them sequentially within a time budget. */
export async function processDueJobs(opts: { limit?: number; timeBudgetMs?: number } = {}): Promise<{ processed: number; results: string[] }> {
  const db = supabaseAdmin();
  const deps = defaultEngineDeps(db);
  const deadline = Date.now() + (opts.timeBudgetMs ?? 45_000);
  const results: string[] = [];
  while (Date.now() < deadline && results.length < (opts.limit ?? 20)) {
    const { data, error } = await db.rpc("claim_sync_jobs", { p_limit: 1, p_lease_seconds: 120 });
    if (error) {
      logSafe.error("claim_sync_jobs failed", error);
      break;
    }
    const jobs = (data ?? []) as JobRecord[];
    if (!jobs.length) break;
    for (const job of jobs) results.push(await executeJob(job, deps));
  }
  return { processed: results.length, results };
}

/**
 * Fallback for missed webhooks: one small incremental job per connection that
 * has not synced for `staleHours`. Tokens are refreshed lazily inside the job
 * only if the access token is actually expired.
 */
export async function scheduleFallbackSyncs(staleHours = 6): Promise<number> {
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - staleHours * 3_600_000).toISOString();
  const { data } = await db
    .from("provider_connections")
    .select("id, user_id, last_synced_at")
    .in("status", ["active", "error"])
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .limit(100);
  let queued = 0;
  const bucket = new Date().toISOString().slice(0, 13); // one per hour at most
  for (const c of data ?? []) {
    if (await enqueueJob({ connectionId: c.id, userId: c.user_id, kind: "fallback", dedupeKey: `fallback:${c.id}:${bucket}` }, db)) queued++;
  }
  return queued;
}
