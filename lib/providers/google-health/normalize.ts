import type { DailyMetricRow, MetricKey, NormalizedBatch, SleepSessionRow, SleepStageType, WorkoutRow } from "@/types/health";
import { METRICS } from "@/lib/metrics/catalog";
import { civilDateToString, localDateWithOffset, minutesBetween, parseGoogleDurationSeconds } from "@/lib/normalization/time";
import { addWorkoutAggregates } from "../whoop/normalize";
import type { GDailyRollupDataPoint, GDataPoint, GSleepStageType } from "./types";

export interface GoogleRaw {
  restingHeartRate: GDataPoint[];
  hrv: GDataPoint[];
  oxygenSaturation: GDataPoint[];
  respiratoryRate: GDataPoint[];
  sleepTemperature: GDataPoint[];
  sleep: GDataPoint[];
  exercise: GDataPoint[];
  stepsRollup: GDailyRollupDataPoint[];
  caloriesRollup: GDailyRollupDataPoint[];
  heartRateRollup: GDailyRollupDataPoint[];
  activeMinutesRollup: GDailyRollupDataPoint[];
  activeZoneMinutesRollup: GDailyRollupDataPoint[];
}

export const emptyGoogleRaw = (): GoogleRaw => ({
  restingHeartRate: [], hrv: [], oxygenSaturation: [], respiratoryRate: [], sleepTemperature: [], sleep: [], exercise: [],
  stepsRollup: [], caloriesRollup: [], heartRateRollup: [], activeMinutesRollup: [], activeZoneMinutesRollup: [],
});

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const STAGE_MAP: Record<GSleepStageType, SleepStageType | null> = {
  SLEEP_STAGE_TYPE_UNSPECIFIED: null,
  AWAKE: "awake",
  LIGHT: "light",
  DEEP: "deep",
  REM: "rem",
  ASLEEP: "asleep",
  RESTLESS: "restless",
};

/** "users/me/dataTypes/sleep/dataPoints/123" → "123" */
export function dataPointId(name: string | undefined): string | null {
  if (!name) return null;
  const id = name.split("/").pop();
  return id || null;
}

function sessionLocalDate(civil: { date?: { year?: number; month?: number; day?: number } } | undefined, iso: string, offset?: string): string {
  return civilDateToString(civil?.date) ?? localDateWithOffset(iso, parseGoogleDurationSeconds(offset) / 60);
}

export function normalizeGoogle(
  raw: GoogleRaw,
  ctx: { userId: string; syncedAt: string; range: { start: string; end: string } },
): NormalizedBatch {
  const daily = new Map<string, DailyMetricRow>();
  const inRange = (d: string | null): d is string => !!d && d >= ctx.range.start && d <= ctx.range.end;
  const put = (metric: MetricKey, value: number | null | undefined, localDate: string | null, extra: Partial<DailyMetricRow> = {}) => {
    if (value === null || value === undefined || !Number.isFinite(value) || !inRange(localDate)) return;
    daily.set(`${metric}|${localDate}`, {
      userId: ctx.userId, source: "google_health", metric, value, unit: METRICS[metric].unit, localDate,
      measuredAt: null, externalId: null, aggregation: null, syncedAt: ctx.syncedAt, ...extra,
    });
  };

  for (const p of raw.restingHeartRate) {
    const v = p.dailyRestingHeartRate;
    if (v) put("resting_heart_rate", num(v.beatsPerMinute), civilDateToString(v.date), { aggregation: "daily" });
  }
  for (const p of raw.hrv) {
    const v = p.dailyHeartRateVariability;
    if (v) put("hrv", num(v.averageHeartRateVariabilityMilliseconds), civilDateToString(v.date), { aggregation: "rmssd_daily_avg" });
  }
  for (const p of raw.oxygenSaturation) {
    const v = p.dailyOxygenSaturation;
    if (v) put("spo2", num(v.averagePercentage), civilDateToString(v.date), { aggregation: "sleep_avg" });
  }
  for (const p of raw.respiratoryRate) {
    const v = p.dailyRespiratoryRate;
    if (v) put("respiratory_rate", num(v.breathsPerMinute), civilDateToString(v.date), { aggregation: "main_sleep" });
  }
  for (const p of raw.sleepTemperature) {
    const v = p.dailySleepTemperatureDerivations;
    // Google recommends displaying the delta to the personal baseline, not raw °C.
    if (v && typeof v.baselineTemperatureCelsius === "number") {
      put("skin_temperature_deviation", Math.round((v.nightlyTemperatureCelsius - v.baselineTemperatureCelsius) * 100) / 100, civilDateToString(v.date), { aggregation: "nightly_minus_baseline" });
    }
  }

  // ---- Daily rollups ---------------------------------------------------------
  const rollDate = (r: GDailyRollupDataPoint) => civilDateToString(r.civilStartTime?.date);
  for (const r of raw.stepsRollup) put("steps", num(r.steps?.countSum), rollDate(r), { aggregation: "sum" });
  for (const r of raw.caloriesRollup) {
    const kcal = num(r.totalCalories?.kcalSum);
    put("calories", kcal === null ? null : Math.round(kcal), rollDate(r), { aggregation: "total_calories_sum" });
  }
  for (const r of raw.heartRateRollup) {
    put("avg_heart_rate", num(r.heartRate?.beatsPerMinuteAvg) === null ? null : Math.round(r.heartRate!.beatsPerMinuteAvg!), rollDate(r), { aggregation: "daily_avg" });
    put("max_heart_rate", num(r.heartRate?.beatsPerMinuteMax), rollDate(r), { aggregation: "daily_max" });
  }
  for (const r of raw.activeMinutesRollup) {
    const levels = r.activeMinutes?.activeMinutesRollupByActivityLevel;
    if (!levels) continue;
    // "Active minutes" = moderate + vigorous (light activity excluded), documented in docs/data-model.md
    const relevant = levels.filter((l) => l.activityLevel === "MODERATE" || l.activityLevel === "VIGOROUS");
    if (relevant.length === 0) continue;
    put("active_minutes", relevant.reduce((s, l) => s + (num(l.activeMinutesSum) ?? 0), 0), rollDate(r), { aggregation: "moderate_vigorous_sum" });
  }
  for (const r of raw.activeZoneMinutesRollup) {
    const a = r.activeZoneMinutes;
    if (!a) continue;
    const parts = [a.sumInFatBurnHeartZone, a.sumInCardioHeartZone, a.sumInPeakHeartZone].map(num);
    if (parts.every((p) => p === null)) continue;
    put("active_zone_minutes", parts.reduce<number>((s, p) => s + (p ?? 0), 0), rollDate(r), { aggregation: "sum" });
  }

  // ---- Sleep sessions --------------------------------------------------------
  const sleep: SleepSessionRow[] = [];
  const mainByDate = new Map<string, SleepSessionRow & { main: boolean }>();
  for (const p of raw.sleep) {
    const s = p.sleep;
    const id = dataPointId(p.name) ?? s?.metadata?.externalId ?? null;
    if (!s || !id) continue;
    const localDate = sessionLocalDate(s.interval.civilEndTime, s.interval.endTime, s.interval.endUtcOffset);
    if (!inRange(localDate)) continue;
    const stageMin = (t: GSleepStageType) => num(s.summary?.stagesSummary?.find((x) => x.type === t)?.minutes);
    const row: SleepSessionRow = {
      userId: ctx.userId,
      source: "google_health",
      externalId: id,
      start: s.interval.startTime,
      end: s.interval.endTime,
      localDate,
      isNap: s.metadata?.nap ?? false,
      durationAsleepMin: num(s.summary?.minutesAsleep),
      inBedMin: num(s.summary?.minutesInSleepPeriod),
      awakeMin: num(s.summary?.minutesAwake),
      lightMin: stageMin("LIGHT"),
      deepMin: stageMin("DEEP"),
      remMin: stageMin("REM"),
      efficiencyPct: null, // not provided by the Google Health API v4
      performancePct: null,
      respiratoryRate: null,
      stages: (s.stages ?? [])
        .map((st) => ({ stage: STAGE_MAP[st.type], start: st.startTime, end: st.endTime }))
        .filter((st): st is { stage: SleepStageType; start: string; end: string } => st.stage !== null),
      raw: null,
    };
    sleep.push(row);
    if (row.isNap || row.durationAsleepMin === null) continue;
    const main = s.metadata?.mainSleep === true;
    const current = mainByDate.get(localDate);
    if (!current || (main && !current.main) || (main === current.main && row.durationAsleepMin > (current.durationAsleepMin ?? 0))) {
      mainByDate.set(localDate, { ...row, main });
    }
  }
  for (const [localDate, s] of mainByDate) {
    put("sleep_duration", s.durationAsleepMin, localDate, { externalId: s.externalId, measuredAt: s.end, aggregation: "main_sleep" });
  }

  // ---- Exercise --------------------------------------------------------------
  const workouts: WorkoutRow[] = [];
  for (const p of raw.exercise) {
    const e = p.exercise;
    const id = dataPointId(p.name);
    if (!e || !id) continue;
    const localDate = sessionLocalDate(e.interval.civilStartTime, e.interval.startTime, e.interval.startUtcOffset);
    if (!inRange(localDate)) continue;
    const activeSec = parseGoogleDurationSeconds(e.activeDuration);
    const distanceMm = num(e.metricsSummary?.distanceMillimeters);
    const kcal = num(e.metricsSummary?.caloriesKcal);
    workouts.push({
      userId: ctx.userId,
      source: "google_health",
      externalId: id,
      sport: e.displayName || e.exerciseType || "unknown",
      start: e.interval.startTime,
      end: e.interval.endTime,
      localDate,
      durationMin: activeSec > 0 ? Math.round(activeSec / 60) : minutesBetween(e.interval.startTime, e.interval.endTime),
      calories: kcal === null ? null : Math.round(kcal),
      avgHeartRate: num(e.metricsSummary?.averageHeartRateBeatsPerMinute),
      maxHeartRate: null, // not part of the exercise metrics summary
      strain: null,
      distanceM: distanceMm === null ? null : distanceMm / 1000,
    });
  }
  addWorkoutAggregates(workouts, put);

  return { daily: [...daily.values()], sleep, workouts };
}
