import { addDays, dateRange } from "@/lib/normalization/time";
import type { MetricKey } from "@/types/health";
import type { DailyValue, MetricSummary, SeriesPoint } from "./types";

/** If a member has data from several sources for one metric, prefer the most recently synced source. */
export function pickPrimarySource(rows: DailyValue[]): DailyValue[] {
  const latest = new Map<string, string>();
  for (const r of rows) {
    const cur = latest.get(r.source);
    if (!cur || (r.syncedAt ?? "") > cur) latest.set(r.source, r.syncedAt ?? "");
  }
  if (latest.size <= 1) return rows;
  const best = [...latest.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1))[0]![0];
  return rows.filter((r) => r.source === best);
}

/** Dense series with explicit nulls for missing days (rendered as visible gaps). */
export function toSeries(rows: DailyValue[], start: string, end: string): SeriesPoint[] {
  const byDate = new Map(rows.map((r) => [r.localDate, r.value]));
  return dateRange(start, end).map((date) => ({ date, value: byDate.get(date) ?? null }));
}

export function average(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/**
 * Builds the dashboard card data for one metric of one member.
 * - value: most recent value within the last `freshnessDays` (never invented)
 * - delta: difference to the previous calendar day, only if both values exist
 * - average: personal mean over the previous 30 days (excluding the current value)
 */
export function summarizeMetric(metric: MetricKey, allRows: DailyValue[], today: string, freshnessDays = 2): MetricSummary {
  const rows = pickPrimarySource(allRows.filter((r) => r.metric === metric));
  const byDate = new Map(rows.map((r) => [r.localDate, r]));
  let current: DailyValue | undefined;
  for (let i = 0; i <= freshnessDays && !current; i++) current = byDate.get(addDays(today, -i));
  const prev = current ? byDate.get(addDays(current.localDate, -1)) : undefined;
  const refDate = current?.localDate ?? today;
  const avgRows = rows.filter((r) => r.localDate < refDate && r.localDate >= addDays(refDate, -30));
  return {
    metric,
    provider: current?.provider ?? rows[0]?.provider ?? null,
    source: current?.source ?? rows[0]?.source ?? null,
    value: current?.value ?? null,
    date: current?.localDate ?? null,
    delta: current && prev ? current.value - prev.value : null,
    average: average(avgRows.map((r) => r.value)),
    spark: toSeries(rows, addDays(today, -13), today),
    lastSyncedAt: rows.reduce<string | null>((m, r) => (r.syncedAt && (!m || r.syncedAt > m) ? r.syncedAt : m), null),
  };
}
