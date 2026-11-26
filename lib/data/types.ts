import type { ConnectionStatus, DataSource, MemberSummary, MetricKey, ProviderId, SharingCategory, SleepStageSegment } from "@/types/health";
import type { Locale } from "@/lib/i18n/dictionaries";

export interface ViewerContext {
  userId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: "admin" | "member";
  familyId: string | null;
  familyName: string | null;
  locale: Locale;
  timezone: string;
  theme: "dark" | "light" | "system";
  isDemo: boolean;
  createdAt: string | null;
}

export interface DailyValue {
  userId: string;
  metric: MetricKey;
  source: DataSource;
  /** Effective vendor (for demo rows: the simulated vendor). */
  provider: ProviderId;
  value: number;
  unit: string;
  localDate: string;
  syncedAt: string | null;
}

export interface SeriesPoint {
  date: string;
  value: number | null;
}

export interface MetricSummary {
  metric: MetricKey;
  provider: ProviderId | null;
  source: DataSource | null;
  value: number | null;
  date: string | null;
  delta: number | null;
  average: number | null;
  spark: SeriesPoint[];
  lastSyncedAt: string | null;
}

export interface SleepSessionView {
  id: string;
  source: DataSource;
  start: string;
  end: string;
  localDate: string;
  isNap: boolean;
  asleepMin: number | null;
  inBedMin: number | null;
  awakeMin: number | null;
  lightMin: number | null;
  deepMin: number | null;
  remMin: number | null;
  efficiencyPct: number | null;
  performancePct: number | null;
  stages: SleepStageSegment[];
}

export interface WorkoutView {
  id: string;
  source: DataSource;
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

export interface ConnectionView {
  id: string;
  provider: ProviderId;
  status: ConnectionStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  missingScopes: string[];
  historyStart: string | null;
}

export interface SharingPreferenceView {
  category: SharingCategory;
  granteeId: string | null;
  enabled: boolean;
}

export interface InvitationView {
  id: string;
  email: string;
  role: "admin" | "member";
  expiresAt: string;
  createdAt: string;
}

export interface SyncLogView {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  records: number | null;
  createdAt: string;
}

export interface HealthRepository {
  readonly isDemo: boolean;
  viewer(): Promise<ViewerContext | null>;
  members(): Promise<MemberSummary[]>;
  visibleCategories(memberId: string): Promise<SharingCategory[]>;
  dailyValues(memberIds: string[], metrics: MetricKey[], start: string, end: string): Promise<DailyValue[]>;
  sleepSessions(memberId: string, start: string, end: string): Promise<SleepSessionView[]>;
  workouts(memberId: string, start: string, end: string): Promise<WorkoutView[]>;
  sharingPreferences(): Promise<SharingPreferenceView[]>;
  connections(): Promise<ConnectionView[]>;
  invitations(): Promise<InvitationView[]>;
  syncLogs(limit?: number): Promise<SyncLogView[]>;
}
