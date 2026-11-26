import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROVIDER_LABEL } from "@/lib/metrics/catalog";
import { DEFAULT_TIMEZONE } from "@/lib/normalization/time";
import { isLocale } from "@/lib/i18n/dictionaries";
import type { ConnectionStatus, MemberSummary, MetricKey, ProviderId, SharingCategory, SleepStageType } from "@/types/health";
import type { DailyValue, HealthRepository, SleepSessionView, ViewerContext, WorkoutView } from "./types";

/**
 * Live repository. Every query runs with the signed-in user's JWT, so Row
 * Level Security (public.can_view) decides which health rows are returned.
 * Demo rows are always excluded in live mode.
 */
export class SupabaseRepository implements HealthRepository {
  readonly isDemo = false;
  private viewerCache: ViewerContext | null | undefined;

  constructor(private readonly db: SupabaseClient, private readonly userId: string, private readonly email: string | null) {}

  async viewer(): Promise<ViewerContext | null> {
    if (this.viewerCache !== undefined) return this.viewerCache;
    const [{ data: profile }, { data: membership }] = await Promise.all([
      this.db.from("profiles").select("display_name, avatar_path, locale, timezone, theme, is_demo, created_at").eq("id", this.userId).maybeSingle(),
      this.db.from("family_members").select("family_id, role, families(name)").eq("user_id", this.userId).maybeSingle(),
    ]);
    if (!profile) return (this.viewerCache = null);
    const fam = membership as { family_id: string; role: "admin" | "member"; families: { name: string } | { name: string }[] | null } | null;
    const familyName = Array.isArray(fam?.families) ? fam?.families[0]?.name : fam?.families?.name;
    this.viewerCache = {
      userId: this.userId,
      email: this.email,
      displayName: profile.display_name,
      avatarUrl: await this.avatarUrl(profile.avatar_path),
      role: fam?.role ?? "member",
      familyId: fam?.family_id ?? null,
      familyName: familyName ?? null,
      locale: isLocale(profile.locale) ? profile.locale : "de",
      timezone: profile.timezone ?? DEFAULT_TIMEZONE,
      theme: profile.theme ?? "dark",
      isDemo: profile.is_demo,
      createdAt: profile.created_at,
    };
    return this.viewerCache;
  }

  private async avatarUrl(path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data } = await this.db.storage.from("avatars").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  async members(): Promise<MemberSummary[]> {
    const viewer = await this.viewer();
    if (!viewer?.familyId) {
      return viewer
        ? [{ userId: this.userId, displayName: viewer.displayName, avatarUrl: viewer.avatarUrl, role: viewer.role, provider: null, providerLabel: null, connectionStatus: null, lastSyncedAt: null, isSelf: true, isDemo: viewer.isDemo }]
        : [];
    }
    const { data: members } = await this.db.from("family_members").select("user_id, role, joined_at").eq("family_id", viewer.familyId).order("joined_at");
    const ids = (members ?? []).map((m) => m.user_id as string);
    const [{ data: profiles }, { data: conns }] = await Promise.all([
      this.db.from("profiles").select("id, display_name, avatar_path, is_demo").in("id", ids),
      this.db.from("provider_connections").select("user_id, provider, status, last_synced_at").in("user_id", ids).neq("status", "disconnected"),
    ]);
    const out: MemberSummary[] = [];
    for (const m of members ?? []) {
      const p = profiles?.find((x) => x.id === m.user_id);
      const c = conns?.find((x) => x.user_id === m.user_id);
      out.push({
        userId: m.user_id,
        displayName: p?.display_name ?? "–",
        avatarUrl: await this.avatarUrl(p?.avatar_path ?? null),
        role: m.role,
        provider: (c?.provider as ProviderId | undefined) ?? null,
        providerLabel: c ? PROVIDER_LABEL[c.provider as ProviderId] : null,
        connectionStatus: (c?.status as ConnectionStatus | undefined) ?? null,
        lastSyncedAt: c?.last_synced_at ?? null,
        isSelf: m.user_id === this.userId,
        isDemo: p?.is_demo ?? false,
      });
    }
    return out.sort((a, b) => Number(b.isSelf) - Number(a.isSelf));
  }

  async visibleCategories(memberId: string): Promise<SharingCategory[]> {
    const { data, error } = await this.db.rpc("visible_categories", { p_owner: memberId });
    if (error) return [];
    return (data ?? []) as SharingCategory[];
  }

  async dailyValues(memberIds: string[], metrics: MetricKey[], start: string, end: string): Promise<DailyValue[]> {
    if (!memberIds.length || !metrics.length) return [];
    const { data, error } = await this.db
      .from("daily_metrics")
      .select("user_id, metric, source, value, unit, local_date, synced_at")
      .in("user_id", memberIds)
      .in("metric", metrics)
      .neq("source", "demo")
      .gte("local_date", start)
      .lte("local_date", end)
      .order("local_date")
      .limit(20000);
    if (error) throw new Error(`daily_metrics query failed: ${error.code}`);
    return (data ?? []).map((r) => ({
      userId: r.user_id,
      metric: r.metric as MetricKey,
      source: r.source,
      provider: r.source as ProviderId,
      value: Number(r.value),
      unit: r.unit,
      localDate: r.local_date,
      syncedAt: r.synced_at,
    }));
  }

  async sleepSessions(memberId: string, start: string, end: string): Promise<SleepSessionView[]> {
    const { data } = await this.db
      .from("sleep_sessions")
      .select("id, source, start_at, end_at, local_date, is_nap, duration_asleep_min, in_bed_min, awake_min, light_min, deep_min, rem_min, efficiency_pct, performance_pct, sleep_stages(stage, start_at, end_at)")
      .eq("user_id", memberId)
      .neq("source", "demo")
      .gte("local_date", start)
      .lte("local_date", end)
      .order("start_at", { ascending: false })
      .limit(400);
    return (data ?? []).map((s) => ({
      id: s.id,
      source: s.source,
      start: s.start_at,
      end: s.end_at,
      localDate: s.local_date,
      isNap: s.is_nap,
      asleepMin: s.duration_asleep_min,
      inBedMin: s.in_bed_min,
      awakeMin: s.awake_min,
      lightMin: s.light_min,
      deepMin: s.deep_min,
      remMin: s.rem_min,
      efficiencyPct: s.efficiency_pct,
      performancePct: s.performance_pct,
      stages: ((s.sleep_stages ?? []) as { stage: SleepStageType; start_at: string; end_at: string }[])
        .map((st) => ({ stage: st.stage, start: st.start_at, end: st.end_at }))
        .sort((a, b) => (a.start < b.start ? -1 : 1)),
    }));
  }

  async workouts(memberId: string, start: string, end: string): Promise<WorkoutView[]> {
    const { data } = await this.db
      .from("workouts")
      .select("id, source, sport, start_at, end_at, local_date, duration_min, calories, avg_heart_rate, max_heart_rate, strain, distance_m")
      .eq("user_id", memberId)
      .neq("source", "demo")
      .gte("local_date", start)
      .lte("local_date", end)
      .order("start_at", { ascending: false })
      .limit(500);
    return (data ?? []).map((w) => ({
      id: w.id,
      source: w.source,
      sport: w.sport,
      start: w.start_at,
      end: w.end_at,
      localDate: w.local_date,
      durationMin: w.duration_min,
      calories: w.calories,
      avgHeartRate: w.avg_heart_rate,
      maxHeartRate: w.max_heart_rate,
      strain: w.strain,
      distanceM: w.distance_m,
    }));
  }

  async sharingPreferences() {
    const { data } = await this.db.from("sharing_preferences").select("category, grantee_id, enabled").eq("owner_id", this.userId);
    return (data ?? []).map((p) => ({ category: p.category as SharingCategory, granteeId: p.grantee_id, enabled: p.enabled }));
  }

  async connections() {
    const { data } = await this.db
      .from("provider_connections")
      .select("id, provider, status, last_synced_at, last_error, missing_scopes, history_start")
      .eq("user_id", this.userId)
      .neq("status", "disconnected");
    return (data ?? []).map((c) => ({
      id: c.id,
      provider: c.provider as ProviderId,
      status: c.status as ConnectionStatus,
      lastSyncedAt: c.last_synced_at,
      lastError: c.last_error,
      missingScopes: c.missing_scopes ?? [],
      historyStart: c.history_start,
    }));
  }

  async invitations() {
    const viewer = await this.viewer();
    if (viewer?.role !== "admin" || !viewer.familyId) return [];
    const { data } = await this.db
      .from("invitations")
      .select("id, email, role, expires_at, created_at")
      .eq("family_id", viewer.familyId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    return (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at, createdAt: i.created_at }));
  }

  async syncLogs(limit = 10) {
    const { data } = await this.db.from("sync_logs").select("id, level, message, records, created_at").eq("user_id", this.userId).order("created_at", { ascending: false }).limit(limit);
    return (data ?? []).map((l) => ({ id: l.id, level: l.level, message: l.message, records: l.records, createdAt: l.created_at }));
  }
}
