import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info, Lock } from "lucide-react";
import { z } from "zod";
import { Hypnogram, SleepStagesChart } from "@/components/charts/sleep-charts";
import { TrendChart } from "@/components/charts/trend-chart";
import { SyncStatus } from "@/components/dashboard/sync-status";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/session";
import { summarizeMetric, toSeries } from "@/lib/data/summary";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { formatDurationMinutes, formatNumber, formatShortDate, formatTime } from "@/lib/i18n/format";
import { METRICS, PROVIDER_LABEL } from "@/lib/metrics/catalog";
import { formatMetric } from "@/lib/metrics/format";
import { addDays, dateRange, todayInZone } from "@/lib/normalization/time";
import { cn } from "@/lib/utils";
import type { MetricKey, ProviderId, SharingCategory } from "@/types/health";
import type { DailyValue } from "@/lib/data/types";

export const metadata = { title: "Details" };

const memberIdSchema = z.union([z.uuid(), z.string().regex(/^demo-[a-z0-9-]{1,20}$/)]);
const rangeSchema = z.enum(["7", "30", "90"]).catch("30");

function Stat({ metric, rows, today, t, locale, provider }: { metric: MetricKey; rows: DailyValue[]; today: string; t: Dictionary; locale: Locale; provider: ProviderId | null }) {
  if (provider && !METRICS[metric].providers.includes(provider)) return null;
  const s = summarizeMetric(metric, rows, today);
  const v = formatMetric(metric, s.value, locale);
  const avg = formatMetric(metric, s.average, locale);
  const vendor = METRICS[metric].comparability === "vendor" && provider ? METRICS[metric].vendorLabel?.[provider] : null;
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl bg-muted/40 p-3">
      <span className="text-[11px] text-muted-foreground">{t.metrics[metric]}</span>
      <span className="text-xl font-semibold tabular">
        {v.text}
        {v.unit && s.value !== null ? <span className="ml-0.5 text-xs font-normal text-muted-foreground">{v.unit}</span> : null}
      </span>
      <span className="text-[11px] text-muted-foreground tabular">
        {s.average !== null ? `${t.common.average} ${avg.text}${avg.unit ? ` ${avg.unit}` : ""}` : t.common.notAvailable}
      </span>
      {vendor ? <span className="text-[10px] text-violet">{vendor}</span> : null}
    </div>
  );
}

function Section({ title, visible, t, children }: { title: string; visible: boolean; t: Dictionary; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {visible ? children : (
        <Card className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" /> {t.common.notShared}</Card>
      )}
    </section>
  );
}

export default async function MemberDetailPage({ params, searchParams }: { params: Promise<{ memberId: string }>; searchParams: Promise<{ range?: string }> }) {
  const { repo, viewer, t, locale } = await requirePageContext();
  const { memberId: rawId } = await params;
  const parsedId = memberIdSchema.safeParse(rawId);
  if (!parsedId.success) notFound();
  const memberId = parsedId.data;
  const range = Number(rangeSchema.parse((await searchParams).range));

  // Authorization: the member must be in the viewer's family (server-side), data visibility is enforced by RLS.
  const members = await repo.members();
  const member = members.find((m) => m.userId === memberId);
  if (!member) notFound();

  const today = todayInZone(viewer.timezone);
  const start = addDays(today, -(range - 1));
  const metrics = Object.keys(METRICS) as MetricKey[];
  const [visibleCats, rows, sleeps, workouts] = await Promise.all([
    repo.visibleCategories(memberId),
    repo.dailyValues([memberId], metrics, addDays(start, -30), today),
    repo.sleepSessions(memberId, start, today),
    repo.workouts(memberId, start, today),
  ]);
  const visible = (c: SharingCategory) => member.isSelf || visibleCats.includes(c);
  const provider = member.provider;
  const series = (m: MetricKey) => toSeries(rows.filter((r) => r.metric === m), start, today).map((p) => ({ date: p.date, value: p.value }));
  const lastSleep = sleeps.filter((s) => !s.isNap).sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  const stageRows = dateRange(start, today).map((date) => {
    const s = sleeps.find((x) => x.localDate === date && !x.isNap);
    return { date, deep: s?.deepMin ?? null, rem: s?.remMin ?? null, light: s?.lightMin ?? null, awake: s?.awakeMin ?? null };
  });
  const intl = locale === "de" ? "de-CH" : "en-CH";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/family" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {t.family.title}</Link>
      <header className="flex items-center gap-4">
        <Avatar name={member.displayName} url={member.avatarUrl} size={56} />
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">{member.displayName}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {member.providerLabel ? <Badge variant={provider === "whoop" ? "green" : "blue"}>{member.providerLabel}</Badge> : null}
            <SyncStatus status={member.connectionStatus} lastSyncedAt={member.lastSyncedAt} t={t} locale={locale} timeZone={viewer.timezone} compact />
          </div>
        </div>
      </header>

      <nav aria-label={t.trends.range} className="flex gap-2">
        {(["7", "30", "90"] as const).map((r) => (
          <Link key={r} href={`/family/${memberId}?range=${r}`} className={cn("rounded-full px-3 py-1.5 text-xs font-medium", String(range) === r ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
            {t.trends.ranges[r]}
          </Link>
        ))}
      </nav>

      <Section title={t.detail.recovery} visible={visible("recovery") || visible("hrv") || visible("heart_rate")} t={t}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {visible("recovery") ? <Stat metric="recovery_score" rows={rows} today={today} t={t} locale={locale} provider={provider} /> : null}
          {visible("hrv") ? <Stat metric="hrv" rows={rows} today={today} t={t} locale={locale} provider={provider} /> : null}
          {visible("heart_rate") ? <Stat metric="resting_heart_rate" rows={rows} today={today} t={t} locale={locale} provider={provider} /> : null}
        </div>
        {provider === "google_health" ? <p className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" /> {t.detail.readinessUnavailable}</p> : null}
        <Card>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t.detail.history}</h3>
          <TrendChart
            locale={intl}
            data={dateRange(start, today).map((date, i) => ({
              date,
              ...(visible("hrv") ? { hrv: series("hrv")[i]?.value ?? null } : {}),
              ...(visible("heart_rate") ? { rhr: series("resting_heart_rate")[i]?.value ?? null } : {}),
              ...(visible("recovery") && provider === "whoop" ? { recovery: series("recovery_score")[i]?.value ?? null } : {}),
            }))}
            series={[
              ...(visible("recovery") && provider === "whoop" ? [{ key: "recovery", label: `${t.metrics.recovery_score} (%)`, color: "var(--chart-1)" }] : []),
              ...(visible("hrv") ? [{ key: "hrv", label: `${t.metrics.hrv} (ms)`, color: "var(--chart-3)" }] : []),
              ...(visible("heart_rate") ? [{ key: "rhr", label: `${t.metrics.resting_heart_rate} (bpm)`, color: "var(--chart-5)" }] : []),
            ]}
          />
        </Card>
      </Section>

      <Section title={t.detail.sleep} visible={visible("sleep")} t={t}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat metric="sleep_duration" rows={rows} today={today} t={t} locale={locale} provider={provider} />
          <Stat metric="sleep_performance" rows={rows} today={today} t={t} locale={locale} provider={provider} />
          <Stat metric="sleep_efficiency" rows={rows} today={today} t={t} locale={locale} provider={provider} />
          <Stat metric="sleep_consistency" rows={rows} today={today} t={t} locale={locale} provider={provider} />
        </div>
        {lastSleep ? (
          <Card className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-muted-foreground">{t.detail.lastNight} · {formatShortDate(lastSleep.localDate, locale)}</h3>
            <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
              {[
                [t.detail.bedtime, formatTime(lastSleep.start, locale, viewer.timezone)],
                [t.detail.wakeTime, formatTime(lastSleep.end, locale, viewer.timezone)],
                [t.detail.deep, formatDurationMinutes(lastSleep.deepMin)],
                [t.detail.rem, formatDurationMinutes(lastSleep.remMin)],
                [t.detail.light, formatDurationMinutes(lastSleep.lightMin)],
                [t.detail.awake, formatDurationMinutes(lastSleep.awakeMin)],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="font-semibold tabular">{v}</dd></div>
              ))}
            </dl>
            {lastSleep.stages.length ? (
              <Hypnogram stages={lastSleep.stages} timeZone={viewer.timezone} locale={intl} labels={{ deep: t.detail.deep, light: t.detail.light, rem: t.detail.rem, awake: t.detail.awake }} />
            ) : null}
          </Card>
        ) : null}
        <Card>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t.trends.sleepStages}</h3>
          <SleepStagesChart data={stageRows} locale={intl} labels={{ deep: t.detail.deep, rem: t.detail.rem, light: t.detail.light, awake: t.detail.awake }} />
          <p className="mt-2 text-xs text-muted-foreground">{t.common.limitedComparability}</p>
        </Card>
      </Section>

      <Section title={t.detail.activity} visible={visible("activity") || visible("workouts")} t={t}>
        {visible("activity") ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat metric="steps" rows={rows} today={today} t={t} locale={locale} provider={provider} />
              <Stat metric="calories" rows={rows} today={today} t={t} locale={locale} provider={provider} />
              <Stat metric="strain" rows={rows} today={today} t={t} locale={locale} provider={provider} />
              <Stat metric="active_minutes" rows={rows} today={today} t={t} locale={locale} provider={provider} />
            </div>
            <Card>
              <TrendChart type="bar" locale={intl} data={series("steps").map((p) => ({ date: p.date, steps: p.value }))} series={[{ key: "steps", label: t.metrics.steps, color: "var(--chart-2)" }]} />
            </Card>
          </>
        ) : null}
        {visible("workouts") ? (
          <Card>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">{t.detail.workouts}</h3>
            {workouts.length === 0 ? <p className="text-sm text-muted-foreground">{t.detail.noWorkouts}</p> : (
              <ul className="divide-y divide-border/60">
                {workouts.slice(0, 20).map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{w.sport}</p>
                      <p className="text-xs text-muted-foreground">{formatShortDate(w.localDate, locale)} · {formatTime(w.start, locale, viewer.timezone)}</p>
                    </div>
                    <div className="flex shrink-0 gap-4 text-right tabular">
                      <span>{formatDurationMinutes(w.durationMin)}</span>
                      <span className="text-muted-foreground">{w.calories !== null ? `${formatNumber(w.calories, locale)} kcal` : "–"}</span>
                      {w.strain !== null ? <span className="text-violet">{formatNumber(w.strain, locale, 1)}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </Section>

      <Section title={t.detail.health} visible={visible("health_metrics") || visible("heart_rate")} t={t}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {visible("health_metrics") ? (
            <>
              <Stat metric="respiratory_rate" rows={rows} today={today} t={t} locale={locale} provider={provider} />
              <Stat metric="spo2" rows={rows} today={today} t={t} locale={locale} provider={provider} />
              <Stat metric="skin_temperature" rows={rows} today={today} t={t} locale={locale} provider={provider} />
              <Stat metric="skin_temperature_deviation" rows={rows} today={today} t={t} locale={locale} provider={provider} />
            </>
          ) : null}
          {visible("heart_rate") ? (
            <>
              <Stat metric="avg_heart_rate" rows={rows} today={today} t={t} locale={locale} provider={provider} />
              <Stat metric="max_heart_rate" rows={rows} today={today} t={t} locale={locale} provider={provider} />
            </>
          ) : null}
        </div>
        {provider ? <p className="text-xs text-muted-foreground">{t.common.source}: {PROVIDER_LABEL[provider]}</p> : null}
      </Section>
    </div>
  );
}
