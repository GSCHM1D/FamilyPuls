import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { metricCategory } from "@/lib/metrics/catalog";
import type { NormalizedBatch, ProviderId } from "@/types/health";

export interface WriteResult {
  daily: number;
  sleep: number;
  workouts: number;
  deleted: number;
}

export interface HealthDataWriter {
  /**
   * Upserts the batch and removes rows of this source inside [start, end] that
   * the provider no longer returns (deleted or corrected records).
   */
  replaceRange(userId: string, source: ProviderId, range: { start: string; end: string }, batch: NormalizedBatch): Promise<WriteResult>;
}

const CHUNK = 500;
function chunks<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export class SupabaseHealthWriter implements HealthDataWriter {
  constructor(private readonly db: SupabaseClient) {}

  private async must<T>(p: PromiseLike<{ data: T; error: { code?: string; message?: string } | null }>, what: string): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(`${what} failed: ${error.code ?? ""} ${error.message ?? ""}`.trim());
    return data;
  }

  async replaceRange(userId: string, source: ProviderId, range: { start: string; end: string }, batch: NormalizedBatch): Promise<WriteResult> {
    let deleted = 0;

    // ---- daily metrics --------------------------------------------------------
    const dailyRows = batch.daily.map((d) => ({
      user_id: userId,
      source,
      metric: d.metric,
      category: metricCategory(d.metric),
      value: d.value,
      unit: d.unit,
      local_date: d.localDate,
      measured_at: d.measuredAt,
      external_id: d.externalId,
      aggregation: d.aggregation,
      synced_at: d.syncedAt,
    }));
    for (const part of chunks(dailyRows)) {
      await this.must(this.db.from("daily_metrics").upsert(part, { onConflict: "user_id,source,metric,local_date" }), "daily upsert");
    }
    const keep = new Set(dailyRows.map((r) => `${r.metric}|${r.local_date}`));
    const existing = await this.must(
      this.db.from("daily_metrics").select("id, metric, local_date").eq("user_id", userId).eq("source", source).gte("local_date", range.start).lte("local_date", range.end),
      "daily select",
    );
    const staleDaily = (existing as { id: string; metric: string; local_date: string }[]).filter((r) => !keep.has(`${r.metric}|${r.local_date}`)).map((r) => r.id);
    for (const part of chunks(staleDaily)) {
      await this.must(this.db.from("daily_metrics").delete().in("id", part), "daily delete");
      deleted += part.length;
    }

    // ---- sleep sessions + stages ---------------------------------------------
    for (const part of chunks(batch.sleep, 100)) {
      const rows = part.map((s) => ({
        user_id: userId,
        source,
        external_id: s.externalId,
        start_at: s.start,
        end_at: s.end,
        local_date: s.localDate,
        is_nap: s.isNap,
        duration_asleep_min: s.durationAsleepMin,
        in_bed_min: s.inBedMin,
        awake_min: s.awakeMin,
        light_min: s.lightMin,
        deep_min: s.deepMin,
        rem_min: s.remMin,
        efficiency_pct: s.efficiencyPct,
        performance_pct: s.performancePct,
        respiratory_rate: s.respiratoryRate,
        synced_at: new Date().toISOString(),
      }));
      const saved = (await this.must(
        this.db.from("sleep_sessions").upsert(rows, { onConflict: "user_id,source,external_id" }).select("id, external_id"),
        "sleep upsert",
      )) as { id: string; external_id: string }[];
      const idByExt = new Map(saved.map((r) => [r.external_id, r.id]));
      const ids = [...idByExt.values()];
      if (ids.length) await this.must(this.db.from("sleep_stages").delete().in("session_id", ids), "stage delete");
      const stageRows = part.flatMap((s) =>
        s.stages.map((st) => ({ session_id: idByExt.get(s.externalId)!, user_id: userId, stage: st.stage, start_at: st.start, end_at: st.end })),
      );
      for (const sp of chunks(stageRows)) {
        await this.must(this.db.from("sleep_stages").upsert(sp, { onConflict: "session_id,start_at" }), "stage insert");
      }
    }
    deleted += await this.deleteMissing("sleep_sessions", userId, source, range, batch.sleep.map((s) => s.externalId));

    // ---- workouts --------------------------------------------------------------
    for (const part of chunks(batch.workouts)) {
      const rows = part.map((w) => ({
        user_id: userId,
        source,
        external_id: w.externalId,
        sport: w.sport,
        start_at: w.start,
        end_at: w.end,
        local_date: w.localDate,
        duration_min: w.durationMin,
        calories: w.calories,
        avg_heart_rate: w.avgHeartRate,
        max_heart_rate: w.maxHeartRate,
        strain: w.strain,
        distance_m: w.distanceM,
        synced_at: new Date().toISOString(),
      }));
      await this.must(this.db.from("workouts").upsert(rows, { onConflict: "user_id,source,external_id" }), "workout upsert");
    }
    deleted += await this.deleteMissing("workouts", userId, source, range, batch.workouts.map((w) => w.externalId));

    return { daily: dailyRows.length, sleep: batch.sleep.length, workouts: batch.workouts.length, deleted };
  }

  private async deleteMissing(table: "sleep_sessions" | "workouts", userId: string, source: ProviderId, range: { start: string; end: string }, keepIds: string[]) {
    const existing = (await this.must(
      this.db.from(table).select("id, external_id").eq("user_id", userId).eq("source", source).gte("local_date", range.start).lte("local_date", range.end),
      `${table} select`,
    )) as { id: string; external_id: string }[];
    const keep = new Set(keepIds);
    const stale = existing.filter((r) => !keep.has(r.external_id)).map((r) => r.id);
    for (const part of chunks(stale)) await this.must(this.db.from(table).delete().in("id", part), `${table} delete`);
    return stale.length;
  }
}
