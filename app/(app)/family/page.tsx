import Link from "next/link";
import { FAMILY_METRICS, FamilyMetricValue, MemberCard } from "@/components/family/member-card";
import { Card } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/session";
import { summarizeMetric } from "@/lib/data/summary";
import { metricCategory } from "@/lib/metrics/catalog";
import { addDays, todayInZone } from "@/lib/normalization/time";
import type { MetricKey } from "@/types/health";

export const metadata = { title: "Familie" };

export default async function FamilyPage() {
  const { repo, viewer, t, locale } = await requirePageContext();
  const today = todayInZone(viewer.timezone);
  const members = await repo.members();
  const ids = members.map((m) => m.userId);
  // RLS (live) / demoCanView (demo) already removed everything that is not shared.
  const [rows, visibility] = await Promise.all([
    repo.dailyValues(ids, FAMILY_METRICS, addDays(today, -35), today),
    Promise.all(members.map(async (m) => [m.userId, await repo.visibleCategories(m.userId)] as const)),
  ]);
  const visibleBy = new Map(visibility);
  const summariesBy = new Map(
    members.map((m) => [m.userId, new Map(FAMILY_METRICS.map((k) => [k, summarizeMetric(k, rows.filter((r) => r.userId === m.userId), today)] as [MetricKey, ReturnType<typeof summarizeMetric>]))]),
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">{t.family.title}</h1>
        <p className="text-sm text-muted-foreground">{viewer.familyName ?? t.family.noFamily} · {t.family.subtitle}</p>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        {members.map((m) => (
          <MemberCard key={m.userId} member={m} summaries={summariesBy.get(m.userId)!} visible={visibleBy.get(m.userId) ?? []} t={t} locale={locale} timeZone={viewer.timezone} />
        ))}
      </div>

      <section className="hidden md:block" aria-labelledby="compare-title">
        <h2 id="compare-title" className="mb-3 text-lg font-semibold tracking-tight">{t.family.compareTable}</h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t.trends.metric}</th>
                {members.map((m) => (
                  <th key={m.userId} className="px-4 py-3 font-medium">
                    <Link href={`/family/${m.userId}`} className="hover:text-foreground">{m.displayName}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60">
                <td className="px-4 py-3 text-muted-foreground">{t.family.tracker}</td>
                {members.map((m) => <td key={m.userId} className="px-4 py-3">{m.providerLabel ?? "–"}</td>)}
              </tr>
              {FAMILY_METRICS.map((k) => (
                <tr key={k} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">{t.metrics[k]}</td>
                  {members.map((m) => (
                    <td key={m.userId} className="px-4 py-3">
                      <FamilyMetricValue metric={k} summary={summariesBy.get(m.userId)!.get(k)} visible={m.isSelf || (visibleBy.get(m.userId) ?? []).includes(metricCategory(k))} t={t} locale={locale} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">{t.common.vendorScore}: {t.metrics.recovery_score} (WHOOP). {t.common.limitedComparability}: {t.metrics.hrv}.</p>
      </section>
    </div>
  );
}
