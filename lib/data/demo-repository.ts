import { DEFAULT_TIMEZONE, todayInZone } from "@/lib/normalization/time";
import { metricCategory, PROVIDER_LABEL } from "@/lib/metrics/catalog";
import { DEMO_MEMBERS, DEMO_VIEWER_ID, demoCanView, demoDailyValues, demoSleepSessions, demoWorkouts } from "@/lib/demo/generator";
import type { Locale } from "@/lib/i18n/dictionaries";
import { SHARING_CATEGORIES, type MemberSummary, type MetricKey, type SharingCategory } from "@/types/health";
import type { HealthRepository, ViewerContext } from "./types";

/** Isolated demo repository: synthetic data, in memory, never touches Supabase. */
export class DemoRepository implements HealthRepository {
  readonly isDemo = true;
  constructor(private readonly prefs: { locale: Locale; theme: "dark" | "light" | "system"; timezone?: string }) {}

  private get today() {
    return todayInZone(this.prefs.timezone ?? DEFAULT_TIMEZONE);
  }

  async viewer(): Promise<ViewerContext> {
    const me = DEMO_MEMBERS.find((m) => m.userId === DEMO_VIEWER_ID)!;
    return {
      userId: me.userId,
      email: "demo@familypulse.invalid",
      displayName: me.displayName,
      avatarUrl: null,
      role: me.role,
      familyId: "demo-family",
      familyName: "Demo-Familie",
      locale: this.prefs.locale,
      timezone: this.prefs.timezone ?? DEFAULT_TIMEZONE,
      theme: this.prefs.theme,
      isDemo: true,
      createdAt: null,
    };
  }

  async members(): Promise<MemberSummary[]> {
    const lastSync = new Date(Date.now() - 23 * 60_000).toISOString();
    return DEMO_MEMBERS.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      avatarUrl: null,
      role: m.role,
      provider: m.provider,
      providerLabel: `${PROVIDER_LABEL[m.provider]} (Demo)`,
      connectionStatus: m.userId === "demo-0000-b" ? "syncing" : "active",
      lastSyncedAt: lastSync,
      isSelf: m.userId === DEMO_VIEWER_ID,
      isDemo: true,
    }));
  }

  async visibleCategories(memberId: string): Promise<SharingCategory[]> {
    return SHARING_CATEGORIES.filter((c) => demoCanView(DEMO_VIEWER_ID, memberId, c));
  }

  async dailyValues(memberIds: string[], metrics: MetricKey[], start: string, end: string) {
    const rows = demoDailyValues(memberIds, metrics, start, end, this.today);
    return rows.filter((r) => demoCanView(DEMO_VIEWER_ID, r.userId, metricCategory(r.metric)));
  }

  async sleepSessions(memberId: string, start: string, end: string) {
    return demoCanView(DEMO_VIEWER_ID, memberId, "sleep") ? demoSleepSessions(memberId, start, end, this.today) : [];
  }

  async workouts(memberId: string, start: string, end: string) {
    return demoCanView(DEMO_VIEWER_ID, memberId, "workouts") ? demoWorkouts(memberId, start, end, this.today) : [];
  }

  async sharingPreferences() {
    const me = DEMO_MEMBERS.find((m) => m.userId === DEMO_VIEWER_ID)!;
    return SHARING_CATEGORIES.map((category) => ({ category, granteeId: null, enabled: me.shares.includes(category) }));
  }

  async connections() {
    return [{ id: "demo-conn", provider: "whoop" as const, status: "active" as const, lastSyncedAt: new Date(Date.now() - 23 * 60_000).toISOString(), lastError: null, missingScopes: [], historyStart: null }];
  }

  async invitations() {
    return [];
  }

  async syncLogs() {
    return [{ id: "demo-log", level: "info" as const, message: "Demo: keine echte Synchronisation", records: null, createdAt: new Date().toISOString() }];
  }
}
