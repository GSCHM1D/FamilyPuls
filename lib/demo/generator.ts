/**
 * Deterministic, fully SYNTHETIC demo data (no real person, no real measurement).
 * Used only when NEXT_PUBLIC_DEMO_MODE=true. Nothing is ever written to the database.
 */
import { METRICS } from "@/lib/metrics/catalog";
import { addDays, dateRange } from "@/lib/normalization/time";
import type { MetricKey, ProviderId, SharingCategory, SleepStageSegment, SleepStageType } from "@/types/health";
import type { DailyValue, SleepSessionView, WorkoutView } from "@/lib/data/types";

export const DEMO_DAYS = 120;

export interface DemoMember {
  userId: string;
  displayName: string;
  provider: ProviderId;
  role: "admin" | "member";
  /** categories shared with all family members */
  shares: SharingCategory[];
  /** extra per-member grants: grantee → categories */
  grants?: Record<string, SharingCategory[]>;
  base: { rhr: number; hrv: number; steps: number; sleep: number; kcal: number; recovery: number };
}

const ALL: SharingCategory[] = ["recovery", "sleep", "activity", "heart_rate", "hrv", "health_metrics", "workouts"];

export const DEMO_MEMBERS: DemoMember[] = [
  { userId: "demo-0000-a", displayName: "Person A", provider: "whoop", role: "admin", shares: ALL, base: { rhr: 54, hrv: 82, steps: 10400, sleep: 492, kcal: 2450, recovery: 78 } },
  { userId: "demo-0000-b", displayName: "Person B", provider: "whoop", role: "member", shares: ["sleep", "activity", "recovery", "heart_rate", "hrv"], base: { rhr: 62, hrv: 43, steps: 8300, sleep: 455, kcal: 2150, recovery: 62 } },
  { userId: "demo-0000-c", displayName: "Person C", provider: "whoop", role: "member", shares: ALL, base: { rhr: 51, hrv: 91, steps: 12300, sleep: 522, kcal: 2700, recovery: 84 } },
  { userId: "demo-0000-d", displayName: "Person D", provider: "google_health", role: "member", shares: ["sleep", "activity", "heart_rate", "hrv", "workouts"], grants: { "demo-0000-a": ["health_metrics"] }, base: { rhr: 58, hrv: 56, steps: 9400, sleep: 478, kcal: 2250, recovery: 0 } },
];

export const DEMO_VIEWER_ID = "demo-0000-a";

/** mulberry32 PRNG */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

interface DayState {
  sleep: number;
  hrv: number;
  rhr: number;
  steps: number;
  kcal: number;
  recovery: number;
  strain: number;
  workout: boolean;
  missing: boolean;
}

function dayState(m: DemoMember, date: string): DayState {
  const r = rng(hash(`${m.userId}|${date}`));
  const dayIndex = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const weekly = Math.sin((dayIndex / 7) * 2 * Math.PI);
  const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const sleep = clamp(m.base.sleep + (r() - 0.5) * 80 + (weekend ? 30 : 0), 300, 640);
  const hrv = clamp(m.base.hrv * (0.85 + r() * 0.3) + weekly * 4, 15, 160);
  const rhr = clamp(m.base.rhr + (r() - 0.5) * 6 - weekly, 38, 90);
  const workout = r() < 0.5;
  const steps = clamp(m.base.steps * (0.6 + r() * 0.8) + (workout ? 2500 : 0), 1200, 30000);
  const kcal = clamp(m.base.kcal + (r() - 0.5) * 500 + (workout ? 300 : 0), 1500, 4200);
  const recovery = clamp(m.base.recovery + (hrv - m.base.hrv) * 0.6 + (sleep - m.base.sleep) * 0.08 + (r() - 0.5) * 20, 3, 99);
  const strain = clamp(8 + r() * 8 + (workout ? 3 : 0), 2, 21);
  return { sleep, hrv, rhr, steps, kcal, recovery, strain, workout, missing: r() < 0.05 };
}

function metricValue(m: DemoMember, metric: MetricKey, s: DayState, date: string): number | null {
  const r = rng(hash(`${m.userId}|${metric}|${date}`));
  switch (metric) {
    case "recovery_score": return round(s.recovery);
    case "strain": return round(s.strain, 1);
    case "sleep_duration": return round(s.sleep);
    case "sleep_performance": return round(clamp((s.sleep / 480) * 92 + (r() - 0.5) * 8, 35, 100));
    case "sleep_consistency": return round(clamp(80 + (r() - 0.5) * 20, 40, 100));
    case "sleep_efficiency": return round(clamp(88 + (r() - 0.5) * 10, 70, 99));
    case "resting_heart_rate": return round(s.rhr);
    case "hrv": return round(s.hrv);
    case "steps": return round(s.steps);
    case "calories": return round(s.kcal);
    case "avg_heart_rate": return round(s.rhr + 14 + r() * 8);
    case "max_heart_rate": return round(clamp(150 + r() * 35 + (s.workout ? 10 : 0), 120, 200));
    case "active_minutes": return round(clamp(25 + r() * 50 + (s.workout ? 30 : 0), 0, 240));
    case "active_zone_minutes": return round(clamp(15 + r() * 40 + (s.workout ? 35 : 0), 0, 240));
    case "workout_count": return s.workout ? 1 : null;
    case "workout_duration": return s.workout ? round(35 + r() * 50) : null;
    case "respiratory_rate": return round(14.5 + (r() - 0.5) * 1.6, 1);
    case "spo2": return round(96.5 + (r() - 0.5) * 2.4, 1);
    case "skin_temperature": return round(33.6 + (r() - 0.5) * 0.6, 1);
    case "skin_temperature_deviation": return round((r() - 0.5) * 0.4, 2);
  }
}

export function demoDailyValues(memberIds: string[], metrics: MetricKey[], start: string, end: string, today: string): DailyValue[] {
  const out: DailyValue[] = [];
  const first = addDays(today, -(DEMO_DAYS - 1));
  const from = start < first ? first : start;
  const to = end > today ? today : end;
  if (from > to) return out;
  const syncedAt = new Date().toISOString();
  for (const m of DEMO_MEMBERS.filter((x) => memberIds.includes(x.userId))) {
    for (const date of dateRange(from, to)) {
      const state = dayState(m, date);
      for (const metric of metrics) {
        if (!METRICS[metric].providers.includes(m.provider)) continue;
        if (state.missing && metric !== "steps") continue; // simulate a night without tracker
        const value = metricValue(m, metric, state, date);
        if (value === null) continue;
        out.push({ userId: m.userId, metric, source: "demo", provider: m.provider, value, unit: METRICS[metric].unit, localDate: date, syncedAt });
      }
    }
  }
  return out;
}

export function demoSleepSessions(memberId: string, start: string, end: string, today: string): SleepSessionView[] {
  const m = DEMO_MEMBERS.find((x) => x.userId === memberId);
  if (!m) return [];
  const first = addDays(today, -(DEMO_DAYS - 1));
  const out: SleepSessionView[] = [];
  for (const date of dateRange(start < first ? first : start, end > today ? today : end)) {
    const s = dayState(m, date);
    if (s.missing) continue;
    const r = rng(hash(`${m.userId}|sleep|${date}`));
    const awake = round(20 + r() * 30);
    const deep = round(s.sleep * (0.15 + r() * 0.08));
    const rem = round(s.sleep * (0.2 + r() * 0.06));
    const light = round(s.sleep - deep - rem);
    // bedtime ~22:30 Europe/Zurich (≈ 21:30 UTC in winter); fine for synthetic data
    const startMs = Date.parse(`${addDays(date, -1)}T21:00:00Z`) + Math.floor(r() * 90) * 60_000;
    const endMs = startMs + (s.sleep + awake) * 60_000;
    const stages: SleepStageSegment[] = [];
    if (m.provider === "google_health") {
      // synthetic hypnogram: repeating ~90 minute cycles
      const pattern: [SleepStageType, number][] = [["light", 0.35], ["deep", 0.25], ["light", 0.15], ["rem", 0.2], ["awake", 0.05]];
      let t = startMs;
      while (t < endMs) {
        for (const [stage, frac] of pattern) {
          const len = Math.max(5, Math.round(90 * frac * (0.7 + r() * 0.6))) * 60_000;
          const e = Math.min(endMs, t + len);
          stages.push({ stage, start: new Date(t).toISOString(), end: new Date(e).toISOString() });
          t = e;
          if (t >= endMs) break;
        }
      }
    }
    out.push({
      id: `demo-sleep-${m.userId}-${date}`,
      source: "demo",
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      localDate: date,
      isNap: false,
      asleepMin: round(s.sleep),
      inBedMin: round(s.sleep + awake),
      awakeMin: awake,
      lightMin: light,
      deepMin: deep,
      remMin: rem,
      efficiencyPct: m.provider === "whoop" ? round((s.sleep / (s.sleep + awake)) * 100) : null,
      performancePct: m.provider === "whoop" ? round(clamp((s.sleep / 480) * 92, 35, 100)) : null,
      stages,
    });
  }
  return out;
}

const SPORTS = ["Laufen", "Velofahren", "Krafttraining", "Wandern", "Schwimmen", "Yoga"];

export function demoWorkouts(memberId: string, start: string, end: string, today: string): WorkoutView[] {
  const m = DEMO_MEMBERS.find((x) => x.userId === memberId);
  if (!m) return [];
  const first = addDays(today, -(DEMO_DAYS - 1));
  const out: WorkoutView[] = [];
  for (const date of dateRange(start < first ? first : start, end > today ? today : end)) {
    const s = dayState(m, date);
    if (!s.workout) continue;
    const duration = metricValue(m, "workout_duration", s, date) ?? 45;
    const r = rng(hash(`${m.userId}|workout|${date}`));
    const startMs = Date.parse(`${date}T16:00:00Z`) + Math.floor(r() * 120) * 60_000;
    out.push({
      id: `demo-workout-${m.userId}-${date}`,
      source: "demo",
      sport: SPORTS[Math.floor(r() * SPORTS.length)]!,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + duration * 60_000).toISOString(),
      localDate: date,
      durationMin: duration,
      calories: round(duration * (7 + r() * 5)),
      avgHeartRate: round(125 + r() * 30),
      maxHeartRate: m.provider === "whoop" ? round(160 + r() * 25) : null,
      strain: m.provider === "whoop" ? round(8 + r() * 8, 1) : null,
      distanceM: r() > 0.4 ? round(3000 + r() * 12000) : null,
    });
  }
  return out;
}

/** Pure sharing rule (mirrors public.can_view in SQL). */
export function demoCanView(viewerId: string, ownerId: string, category: SharingCategory): boolean {
  if (viewerId === ownerId) return true;
  const owner = DEMO_MEMBERS.find((m) => m.userId === ownerId);
  if (!owner || !DEMO_MEMBERS.some((m) => m.userId === viewerId)) return false;
  return owner.shares.includes(category) || (owner.grants?.[viewerId]?.includes(category) ?? false);
}
