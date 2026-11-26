/** Provider identifiers stored in the database. "demo" is only used for synthetic data. */
export type ProviderId = "whoop" | "google_health";
export type DataSource = ProviderId | "demo";

/** Categories a member can share individually (see sharing_preferences). */
export const SHARING_CATEGORIES = ["recovery", "sleep", "activity", "heart_rate", "hrv", "health_metrics", "workouts"] as const;
export type SharingCategory = (typeof SHARING_CATEGORIES)[number];

export const METRIC_KEYS = [
  "recovery_score",
  "strain",
  "sleep_duration",
  "sleep_performance",
  "sleep_consistency",
  "sleep_efficiency",
  "resting_heart_rate",
  "hrv",
  "steps",
  "calories",
  "avg_heart_rate",
  "max_heart_rate",
  "active_minutes",
  "active_zone_minutes",
  "workout_count",
  "workout_duration",
  "respiratory_rate",
  "spo2",
  "skin_temperature",
  "skin_temperature_deviation",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** comparable: similar definition across vendors; limited: compare with care; vendor: proprietary score. */
export type Comparability = "comparable" | "limited" | "vendor";

export interface DailyMetricRow {
  userId: string;
  source: DataSource;
  metric: MetricKey;
  value: number;
  unit: string;
  localDate: string; // YYYY-MM-DD in the user's timezone
  measuredAt: string | null; // ISO UTC
  externalId: string | null;
  aggregation: string | null;
  syncedAt: string; // ISO UTC
}

export type SleepStageType = "awake" | "light" | "deep" | "rem" | "asleep" | "restless";

export interface SleepStageSegment {
  stage: SleepStageType;
  start: string;
  end: string;
}

export interface SleepSessionRow {
  userId: string;
  source: DataSource;
  externalId: string;
  start: string;
  end: string;
  localDate: string; // date of wake-up
  isNap: boolean;
  durationAsleepMin: number | null;
  inBedMin: number | null;
  awakeMin: number | null;
  lightMin: number | null;
  deepMin: number | null;
  remMin: number | null;
  efficiencyPct: number | null;
  performancePct: number | null;
  respiratoryRate: number | null;
  stages: SleepStageSegment[];
  raw: Record<string, unknown> | null;
}

export interface WorkoutRow {
  userId: string;
  source: DataSource;
  externalId: string;
  sport: string;
  start: string;
  end: string;
  localDate: string;
  durationMin: number;
  calories: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  strain: number | null;
  distanceM: number | null;
}

export interface NormalizedBatch {
  daily: DailyMetricRow[];
  sleep: SleepSessionRow[];
  workouts: WorkoutRow[];
}

export type ConnectionStatus = "active" | "syncing" | "error" | "reauth_required" | "disconnected";

export interface MemberSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: "admin" | "member";
  provider: ProviderId | null;
  providerLabel: string | null;
  connectionStatus: ConnectionStatus | null;
  lastSyncedAt: string | null;
  isSelf: boolean;
  isDemo: boolean;
}
