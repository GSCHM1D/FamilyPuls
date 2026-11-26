import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { z } from "zod";
import { TrendChart } from "@/components/charts/trend-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { requirePageContext } from "@/lib/auth/session";
import { average, pickPrimarySource, toSeries } from "@/lib/data/summary";
import { formatNumber } from "@/lib/i18n/format";
import { METRICS, PROVIDER_LABEL, TREND_METRICS, metricCategory } from "@/lib/metrics/catalog";
import { formatMetric } from "@/lib/metrics/format";
import { addDays, diffDays, isIsoDate, todayInZone } from "@/lib/normalization/time";
import { cn } from "@/lib/utils";
import type { MetricKey } from "@/types/health";

export const metadata = { title: "Trends" };

const RANGES = ["1", "7", "14", "30", "90", "365"] as const;
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const paramsSchema = z.object({
  metric: z.enum(TREND_METRICS as [MetricKey, ...MetricKey[]]).catch("sleep_duration"),
  range: z.enum([...RANGES, "custom"]).catch("30"),
  from: z.string().optional(),
  to: z.string().optional(),
  members: z.string().max(2000).optional(),
  type: z.enum(["line", "bar", "area"]).catch("line"),
});

export default async function TrendsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { repo, viewer, t, locale } = await requirePageContext();
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]));
  const p = paramsSchema.parse(flat);
  const today = todayInZone(viewer.timezone);

  let start = addDays(today, -(Number(p.range === "custom" ? 30 : p.range) - 1));
  let end = today;
  if (p.range === "custom" && p.from && p.to && isIsoDate(p.from) && isIsoDate(p.to) && p.from <= p.to) {
    start = p.from;
    end = p.to > today ? today : p.to;
    if (diffDays(start, end) > 730) start = addDays(end, -730);
  }

  const members = await repo.members();
  const requested = (p.members ?? viewer.userId).split(",").filter(Boolean);
  const selected = members.filter((m) => requested.includes(m.userId));
  if (!selected.length) selected.push(members.find((m) => m.isSelf)!);

  const def = METRICS[p.metric];
  // Vendor-specific scores are only shown for members whose tracker provides them.
  const eligible = selected.filter((m) => !m.provider || def.providers.includes(m.provider));
  const excluded = selected.filter((m) => !eligible.includes(m));
  const providers = new Set(eligible.map((m) => m.provider).filter(Boolean));

  const visibility = new Map(await Promise.all(eligible.map(async (m) => [m.userId, m.isSelf ? null : await repo.visibleCategories(m.userId)] as const)));
  const shown = eligible.filter((m) => m.isSelf || (visibility.get(m.userId) ?? []).includes(metricCategory(p.metric)));
  const hidden = eligible.filter((m) => !shown.includes(m));

  const rows = await repo.dailyValues(shown.map((m) => m.userId), [p.metric], start, end);
  const seriesBy = new Map(shown.map((m) => [m.userId, toSeries(pickPrimarySource(rows.filter((r) => r.userId === m.userId)), start, end)]));
  const dates = seriesBy.values().next().value?.map((x) => x.date) ?? [];
  const data = dates.map((date, i) => ({ date, ...Object.fromEntries(shown.map((m) => [m.userId, seriesBy.get(m.userId)![i]?.value ?? null])) }));
  const intl = locale === "de" ? "de-CH" : "en-CH";

  const query = (overrides: Record<string, string>) => {
    const q = new URLSearchParams({ metric: p.metric, range: p.range, type: p.type, members: selected.map((m) => m.userId).join(","), ...overrides });
    return `/trends?${q.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">{t.trends.title}</h1>
      </header>

      <nav aria-label={t.trends.range} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {RANGES.map((r) => (
          <Link key={r} href={query({ range: r })} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium", p.range === r ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
            {t.trends.ranges[r]}
          </Link>
        ))}
      </nav>

      <Card>
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="metric">{t.trends.metric}</Label>
            <Select id="metric" name="metric" defaultValue={p.metric}>
              {TREND_METRICS.map((m) => <option key={m} value={m}>{t.metrics[m]}</option>)}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">{t.trends.chartType}</Label>
            <Select id="type" name="type" defaultValue={p.type}>
              {(["line", "bar", "area"] as const).map((ty) => <option key={ty} value={ty}>{t.trends.types[ty]}</option>)}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">{t.trends.from}</Label>
            <Input id="from" name="from" type="date" defaultValue={start} max={today} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">{t.trends.to}</Label>
            <Input id="to" name="to" type="date" defaultValue={end} max={today} />
          </div>
          <fieldset className="sm:col-span-2 lg:col-span-3">
            <legend className="mb-1.5 text-sm font-medium">{t.trends.members}</legend>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <label key={m.userId} className="flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:text-primary">
                  <input type="checkbox" name="members" value={m.userId} defaultChecked={selected.some((s) => s.userId === m.userId)} className="accent-[var(--primary)]" />
                  {m.displayName}
                </label>
              ))}
            </div>
          </fieldset>
          <input type="hidden" name="range" value="custom" />
          <div className="flex items-end">
            <Button type="submit" className="w-full">{t.trends.apply}</Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{t.metrics[p.metric]}</h2>
          <span className="text-xs text-muted-foreground">{def.comparability === "vendor" ? t.common.vendorScore : def.comparability === "limited" && providers.size > 1 ? t.common.limitedComparability : ""}</span>
        </div>
        {shown.length ? (
          <TrendChart
            data={data}
            type={p.type}
            unit={def.unit}
            locale={intl}
            valueFormat={p.metric === "sleep_duration" || p.metric === "workout_duration" ? "duration" : "number"}
            series={shown.map((m, i) => ({ key: m.userId, label: `${m.displayName}${m.provider ? ` · ${PROVIDER_LABEL[m.provider]}` : ""}`, color: COLORS[i % COLORS.length]! }))}
          />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">{t.common.noData}</p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {shown.map((m, i) => {
            const avg = average(seriesBy.get(m.userId)!.map((x) => x.value));
            const f = formatMetric(p.metric, avg, locale);
            const n = seriesBy.get(m.userId)!.filter((x) => x.value !== null).length;
            return (
              <div key={m.userId} className="rounded-2xl bg-muted/40 p-3">
                <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="size-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{m.displayName}</dt>
                <dd className="text-lg font-semibold tabular">{t.common.average} {f.text}{f.unit && avg !== null ? <span className="ml-0.5 text-xs font-normal text-muted-foreground">{f.unit}</span> : null}</dd>
                <dd className="text-[11px] text-muted-foreground">{formatNumber(n, locale)} / {dates.length}</dd>
              </div>
            );
          })}
        </dl>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" /> {t.trends.gapsHint}</p>
        {excluded.length ? (
          <p className="mt-2 flex items-start gap-2 text-xs text-amber"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {t.trends.notComparable} ({excluded.map((m) => m.displayName).join(", ")})</p>
        ) : null}
        {hidden.length ? (
          <p className="mt-2 text-xs text-muted-foreground">{t.common.notShared}: {hidden.map((m) => m.displayName).join(", ")}</p>
        ) : null}
      </Card>
    </div>
  );
}
