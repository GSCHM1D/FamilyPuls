import type { Comparability, MetricKey, ProviderId, SharingCategory } from "@/types/health";

export interface MetricDefinition {
  key: MetricKey;
  category: SharingCategory;
  unit: string;
  comparability: Comparability;
  /** Providers that deliver this metric through their official API. */
  providers: ProviderId[];
  /** Higher is better? Used for colouring deltas only (never for health advice). */
  higherIsBetter: boolean | null;
  decimals: number;
  /** Vendor-specific scores must always show their source. */
  vendorLabel?: Partial<Record<ProviderId, string>>;
}

const def = (d: MetricDefinition) => d;

export const METRICS: Record<MetricKey, MetricDefinition> = {
  recovery_score: def({ key: "recovery_score", category: "recovery", unit: "%", comparability: "vendor", providers: ["whoop"], higherIsBetter: true, decimals: 0, vendorLabel: { whoop: "WHOOP Recovery" } }),
  strain: def({ key: "strain", category: "activity", unit: "", comparability: "vendor", providers: ["whoop"], higherIsBetter: null, decimals: 1, vendorLabel: { whoop: "WHOOP Strain" } }),
  sleep_duration: def({ key: "sleep_duration", category: "sleep", unit: "min", comparability: "comparable", providers: ["whoop", "google_health"], higherIsBetter: true, decimals: 0 }),
  sleep_performance: def({ key: "sleep_performance", category: "sleep", unit: "%", comparability: "vendor", providers: ["whoop"], higherIsBetter: true, decimals: 0, vendorLabel: { whoop: "WHOOP Sleep Performance" } }),
  sleep_consistency: def({ key: "sleep_consistency", category: "sleep", unit: "%", comparability: "vendor", providers: ["whoop"], higherIsBetter: true, decimals: 0, vendorLabel: { whoop: "WHOOP Sleep Consistency" } }),
  sleep_efficiency: def({ key: "sleep_efficiency", category: "sleep", unit: "%", comparability: "limited", providers: ["whoop"], higherIsBetter: true, decimals: 0 }),
  resting_heart_rate: def({ key: "resting_heart_rate", category: "heart_rate", unit: "bpm", comparability: "comparable", providers: ["whoop", "google_health"], higherIsBetter: false, decimals: 0 }),
  hrv: def({ key: "hrv", category: "hrv", unit: "ms", comparability: "limited", providers: ["whoop", "google_health"], higherIsBetter: true, decimals: 0 }),
  steps: def({ key: "steps", category: "activity", unit: "", comparability: "comparable", providers: ["whoop", "google_health"], higherIsBetter: true, decimals: 0 }),
  calories: def({ key: "calories", category: "activity", unit: "kcal", comparability: "limited", providers: ["whoop", "google_health"], higherIsBetter: null, decimals: 0 }),
  avg_heart_rate: def({ key: "avg_heart_rate", category: "heart_rate", unit: "bpm", comparability: "limited", providers: ["whoop", "google_health"], higherIsBetter: null, decimals: 0 }),
  max_heart_rate: def({ key: "max_heart_rate", category: "heart_rate", unit: "bpm", comparability: "limited", providers: ["whoop", "google_health"], higherIsBetter: null, decimals: 0 }),
  active_minutes: def({ key: "active_minutes", category: "activity", unit: "min", comparability: "limited", providers: ["google_health"], higherIsBetter: true, decimals: 0 }),
  active_zone_minutes: def({ key: "active_zone_minutes", category: "activity", unit: "min", comparability: "vendor", providers: ["google_health"], higherIsBetter: true, decimals: 0, vendorLabel: { google_health: "Fitbit Active Zone Minutes" } }),
  workout_count: def({ key: "workout_count", category: "workouts", unit: "", comparability: "comparable", providers: ["whoop", "google_health"], higherIsBetter: null, decimals: 0 }),
  workout_duration: def({ key: "workout_duration", category: "workouts", unit: "min", comparability: "comparable", providers: ["whoop", "google_health"], higherIsBetter: null, decimals: 0 }),
  respiratory_rate: def({ key: "respiratory_rate", category: "health_metrics", unit: "/min", comparability: "limited", providers: ["whoop", "google_health"], higherIsBetter: null, decimals: 1 }),
  spo2: def({ key: "spo2", category: "health_metrics", unit: "%", comparability: "limited", providers: ["whoop", "google_health"], higherIsBetter: null, decimals: 1 }),
  skin_temperature: def({ key: "skin_temperature", category: "health_metrics", unit: "°C", comparability: "vendor", providers: ["whoop"], higherIsBetter: null, decimals: 1, vendorLabel: { whoop: "WHOOP Hauttemperatur" } }),
  skin_temperature_deviation: def({ key: "skin_temperature_deviation", category: "health_metrics", unit: "°C", comparability: "vendor", providers: ["google_health"], higherIsBetter: null, decimals: 2, vendorLabel: { google_health: "Google Health Δ Baseline" } }),
};

export function metricCategory(metric: MetricKey): SharingCategory {
  return METRICS[metric].category;
}

/** Metrics that may be drawn on the same chart for several members. */
export function isCrossVendorComparable(metric: MetricKey): boolean {
  return METRICS[metric].comparability !== "vendor";
}

export const PROVIDER_LABEL: Record<ProviderId | "demo", string> = {
  whoop: "WHOOP",
  google_health: "Fitbit (Google Health)",
  demo: "Demo",
};

export const DASHBOARD_METRICS: MetricKey[] = [
  "recovery_score",
  "strain",
  "sleep_duration",
  "sleep_performance",
  "sleep_efficiency",
  "resting_heart_rate",
  "hrv",
  "steps",
  "calories",
  "avg_heart_rate",
  "max_heart_rate",
  "active_minutes",
  "workout_count",
  "respiratory_rate",
  "spo2",
  "skin_temperature",
  "skin_temperature_deviation",
];

export const TREND_METRICS: MetricKey[] = [
  "sleep_duration",
  "resting_heart_rate",
  "hrv",
  "steps",
  "calories",
  "workout_duration",
  "respiratory_rate",
  "spo2",
  "recovery_score",
  "strain",
  "sleep_performance",
  "sleep_efficiency",
  "active_minutes",
];
