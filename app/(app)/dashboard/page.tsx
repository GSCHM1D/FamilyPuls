import Link from "next/link";
import { Info, PlugZap } from "lucide-react";
import { ScoreRing } from "@/components/charts/recovery-ring";
import { ManualSyncButton } from "@/components/dashboard/manual-sync-button";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SyncStatus } from "@/components/dashboard/sync-status";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/session";
import { summarizeMetric } from "@/lib/data/summary";
import { formatDate, formatDurationMinutes } from "@/lib/i18n/format";
import { DASHBOARD_METRICS, METRICS } from "@/lib/metrics/catalog";
import { addDays, todayInZone } from "@/lib/normalization/time";
import type { MetricKey } from "@/types/health";

export const metadata = { title: "Übersicht" };

const SECTIONS: { key: "recovery" | "sleep" | "activity" | "health"; metrics: MetricKey[] }[] = [
  { key: "recovery", metrics: ["recovery_score", "hrv", "resting_heart_rate"] },
  { key: "sleep", metrics: ["sleep_duration", "sleep_performance", "sleep_efficiency"] },
  { key: "activity", metrics: ["strain", "steps", "calories", "active_minutes", "workout_count", "avg_heart_rate", "max_heart_rate"] },
  { key: "health", metrics: ["respiratory_rate", "spo2", "skin_temperature", "skin_temperature_deviation"] },
];

export default async function DashboardPage() {
  const { repo, viewer, t, locale } = await requirePageContext();
  const today = todayInZone(viewer.timezone);
  const [members, rows] = await Promise.all([
    repo.members(),
    repo.dailyValues([viewer.userId], DASHBOARD_METRICS, addDays(today, -45), today),
  ]);
  const me = members.find((m) => m.isSelf);
  const provider = me?.provider ?? null;
  const summaries = new Map(DASHBOARD_METRICS.map((m) => [m, summarizeMetric(m, rows, today)]));
  const recovery = summaries.get("recovery_score")!;
  const sleep = summaries.get("sleep_duration")!;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{formatDate(today, locale, { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          {t.dashboard.greeting} {viewer.displayName.split(" ")[0]}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <SyncStatus status={me?.connectionStatus ?? null} lastSyncedAt={me?.lastSyncedAt ?? null} t={t} locale={locale} timeZone={viewer.timezone} />
          {provider && !viewer.isDemo ? <ManualSyncButton labels={{ ...t.dashboard, error: t.common.error }} /> : null}
        </div>
      </header>

      {!provider ? (
        <Card className="flex flex-col items-start gap-3">
          <PlugZap className="size-6 text-primary" />
          <p className="text-sm text-muted-foreground">{t.dashboard.noTracker}</p>
          <Link href="/settings#trackers" className={buttonVariants()}>{t.dashboard.connectTracker}</Link>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col items-center gap-4 py-6 sm:flex-row sm:justify-around">
            {provider === "whoop" ? (
              <ScoreRing value={recovery.value} label={t.metrics.recovery_score} sublabel="WHOOP" />
            ) : (
              <div className="flex flex-col items-center gap-1 py-4">
                <span className="font-[family-name:var(--font-display)] text-5xl font-semibold tabular text-violet">{formatDurationMinutes(sleep.value)}</span>
                <span className="text-xs text-muted-foreground">{t.metrics.sleep_duration} · {t.detail.lastNight}</span>
              </div>
            )}
            <dl className="grid grid-cols-3 gap-6 text-center">
              {(["hrv", "resting_heart_rate", provider === "whoop" ? "strain" : "steps"] as MetricKey[]).map((m) => {
                const s = summaries.get(m)!;
                return (
                  <div key={m}>
                    <dt className="text-[11px] text-muted-foreground">{t.metrics[m]}</dt>
                    <dd className="text-xl font-semibold tabular">
                      {s.value === null ? "–" : m === "steps" ? new Intl.NumberFormat("de-CH").format(s.value) : Math.round(s.value * 10) / 10}
                      <span className="ml-0.5 text-xs font-normal text-muted-foreground">{METRICS[m].unit}</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Card>

          {SECTIONS.map((section) => {
            const metrics = section.metrics.filter((m) => METRICS[m].providers.includes(provider));
            if (!metrics.length) return null;
            return (
              <section key={section.key} aria-labelledby={`sec-${section.key}`} className="flex flex-col gap-3">
                <h2 id={`sec-${section.key}`} className="text-lg font-semibold tracking-tight">{t.dashboard.sections[section.key]}</h2>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {metrics.map((m) => (
                    <MetricCard key={m} summary={summaries.get(m)!} t={t} locale={locale} timeZone={viewer.timezone} today={today} />
                  ))}
                </div>
              </section>
            );
          })}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" /> {t.dashboard.liveHint}
          </p>
        </>
      )}
    </div>
  );
}
