import type { DailyMetricRow, MetricKey, NormalizedBatch, SleepSessionRow, WorkoutRow } from "@/types/health";
import { METRICS } from "@/lib/metrics/catalog";
import { localDateInZone, localDateWithOffset, minutesBetween, parseOffsetMinutes } from "@/lib/normalization/time";
import type { WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout } from "./types";

const KJ_PER_KCAL = 4.184;
const msToMin = (ms: number) => ms / 60_000;

export interface WhoopRaw {
  cycles: WhoopCycle[];
  recoveries: WhoopRecovery[];
  sleeps: WhoopSleep[];
  workouts: WhoopWorkout[];
}

export interface NormalizeContext {
  userId: string;
  timeZone: string;
  syncedAt: string;
  /** Only rows with localDate inside [start, end] are returned. */
  range: { start: string; end: string };
  now?: Date;
}

/** Local date of a sleep = local date of wake-up. */
export function whoopSleepLocalDate(sleep: Pick<WhoopSleep, "end" | "timezone_offset">): string {
  return localDateWithOffset(sleep.end, parseOffsetMinutes(sleep.timezone_offset));
}

/**
 * A WHOOP cycle starts when the member falls asleep and spans roughly one
 * day. We attribute it to the local date of its midpoint (ongoing cycles use
 * "now" as provisional end) so that e.g. 23:00 Mon → 23:30 Tue counts as Tuesday.
 */
export function whoopCycleLocalDate(cycle: Pick<WhoopCycle, "start" | "end" | "timezone_offset">, now = new Date()): string {
  const start = Date.parse(cycle.start);
  const end = cycle.end ? Date.parse(cycle.end) : Math.max(start, now.getTime());
  const mid = new Date(start + (end - start) / 2).toISOString();
  return localDateWithOffset(mid, parseOffsetMinutes(cycle.timezone_offset));
}

export function normalizeWhoop(raw: WhoopRaw, ctx: NormalizeContext): NormalizedBatch {
  const daily = new Map<string, DailyMetricRow>();
  const inRange = (d: string) => d >= ctx.range.start && d <= ctx.range.end;

  const put = (metric: MetricKey, value: number | null | undefined, localDate: string, extra: Partial<DailyMetricRow> = {}) => {
    if (value === null || value === undefined || !Number.isFinite(value) || !inRange(localDate)) return;
    daily.set(`${metric}|${localDate}`, {
      userId: ctx.userId,
      source: "whoop",
      metric,
      value,
      unit: METRICS[metric].unit,
      localDate,
      measuredAt: null,
      externalId: null,
      aggregation: null,
      syncedAt: ctx.syncedAt,
      ...extra,
    });
  };

  // ---- Sleep ---------------------------------------------------------------
  const sleepDate = new Map<string, string>();
  const sleepSessions: SleepSessionRow[] = [];
  const mainSleepByDate = new Map<string, { sleep: WhoopSleep; asleepMin: number }>();

  for (const s of raw.sleeps) {
    const localDate = whoopSleepLocalDate(s);
    sleepDate.set(s.id, localDate);
    if (!inRange(localDate)) continue;
    const st = s.score_state === "SCORED" ? s.score?.stage_summary : undefined;
    const asleepMin = st ? msToMin(st.total_light_sleep_time_milli + st.total_slow_wave_sleep_time_milli + st.total_rem_sleep_time_milli) : null;
    sleepSessions.push({
      userId: ctx.userId,
      source: "whoop",
      externalId: s.id,
      start: s.start,
      end: s.end,
      localDate,
      isNap: s.nap,
      durationAsleepMin: asleepMin,
      inBedMin: st ? msToMin(st.total_in_bed_time_milli) : null,
      awakeMin: st ? msToMin(st.total_awake_time_milli) : null,
      lightMin: st ? msToMin(st.total_light_sleep_time_milli) : null,
      deepMin: st ? msToMin(st.total_slow_wave_sleep_time_milli) : null,
      remMin: st ? msToMin(st.total_rem_sleep_time_milli) : null,
      efficiencyPct: s.score?.sleep_efficiency_percentage ?? null,
      performancePct: s.score?.sleep_performance_percentage ?? null,
      respiratoryRate: s.score?.respiratory_rate ?? null,
      stages: [], // WHOOP API v2 provides stage totals only, no segments
      raw: null,
    });
    if (!s.nap && asleepMin !== null) {
      const current = mainSleepByDate.get(localDate);
      if (!current || asleepMin > current.asleepMin) mainSleepByDate.set(localDate, { sleep: s, asleepMin });
    }
  }

  for (const [localDate, { sleep, asleepMin }] of mainSleepByDate) {
    const base = { externalId: sleep.id, measuredAt: sleep.end, aggregation: "main_sleep" };
    put("sleep_duration", Math.round(asleepMin), localDate, base);
    put("sleep_performance", sleep.score?.sleep_performance_percentage, localDate, base);
    put("sleep_consistency", sleep.score?.sleep_consistency_percentage, localDate, base);
    put("sleep_efficiency", sleep.score?.sleep_efficiency_percentage, localDate, base);
    put("respiratory_rate", sleep.score?.respiratory_rate, localDate, base);
  }

  // ---- Recovery ------------------------------------------------------------
  for (const r of raw.recoveries) {
    if (r.score_state !== "SCORED" || !r.score) continue;
    const localDate = sleepDate.get(r.sleep_id) ?? localDateInZone(r.created_at, ctx.timeZone);
    const base = {
      externalId: String(r.cycle_id),
      measuredAt: r.created_at,
      aggregation: r.score.user_calibrating ? "calibrating" : "vendor_score",
    };
    put("recovery_score", r.score.recovery_score, localDate, base);
    put("resting_heart_rate", r.score.resting_heart_rate, localDate, { ...base, aggregation: "sleep" });
    put("hrv", r.score.hrv_rmssd_milli, localDate, { ...base, aggregation: "rmssd_sleep" });
    put("spo2", r.score.spo2_percentage, localDate, { ...base, aggregation: "sleep" });
    put("skin_temperature", r.score.skin_temp_celsius, localDate, { ...base, aggregation: "sleep" });
  }

  // ---- Cycles (day strain, energy, heart rate, steps) ----------------------
  for (const c of raw.cycles) {
    const localDate = whoopCycleLocalDate(c, ctx.now);
    const base = { externalId: String(c.id), measuredAt: c.end ?? null, aggregation: c.end ? "cycle" : "cycle_in_progress" };
    if (c.score_state === "SCORED" && c.score) {
      put("strain", c.score.strain, localDate, base);
      put("calories", Math.round(c.score.kilojoule / KJ_PER_KCAL), localDate, base);
      put("avg_heart_rate", c.score.average_heart_rate, localDate, base);
      put("max_heart_rate", c.score.max_heart_rate, localDate, base);
    }
    // step_count is null when no step data exists for the cycle – never default to 0.
    if (typeof c.step_count === "number") put("steps", c.step_count, localDate, base);
  }

  // ---- Workouts ------------------------------------------------------------
  const workouts: WorkoutRow[] = [];
  for (const w of raw.workouts) {
    const localDate = localDateWithOffset(w.start, parseOffsetMinutes(w.timezone_offset));
    if (!inRange(localDate)) continue;
    const scored = w.score_state === "SCORED" && w.score ? w.score : null;
    workouts.push({
      userId: ctx.userId,
      source: "whoop",
      externalId: w.id,
      sport: w.sport_name || "unknown",
      start: w.start,
      end: w.end,
      localDate,
      durationMin: minutesBetween(w.start, w.end),
      calories: scored ? Math.round(scored.kilojoule / KJ_PER_KCAL) : null,
      avgHeartRate: scored?.average_heart_rate ?? null,
      maxHeartRate: scored?.max_heart_rate ?? null,
      strain: scored?.strain ?? null,
      distanceM: scored?.distance_meter ?? null,
    });
  }
  addWorkoutAggregates(workouts, put);

  return { daily: [...daily.values()], sleep: sleepSessions, workouts };
}

/** Per-day count and total duration, derived from the complete workout list of the range. */
export function addWorkoutAggregates(
  workouts: WorkoutRow[],
  put: (metric: MetricKey, value: number, localDate: string, extra?: Partial<DailyMetricRow>) => void,
) {
  const byDate = new Map<string, { count: number; minutes: number }>();
  for (const w of workouts) {
    const agg = byDate.get(w.localDate) ?? { count: 0, minutes: 0 };
    agg.count += 1;
    agg.minutes += w.durationMin;
    byDate.set(w.localDate, agg);
  }
  for (const [date, agg] of byDate) {
    put("workout_count", agg.count, date, { aggregation: "count" });
    put("workout_duration", Math.round(agg.minutes), date, { aggregation: "sum" });
  }
}
