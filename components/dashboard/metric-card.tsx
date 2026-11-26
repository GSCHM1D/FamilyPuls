import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { MetricSummary } from "@/lib/data/types";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { formatShortDate, formatTime } from "@/lib/i18n/format";
import { METRICS, PROVIDER_LABEL } from "@/lib/metrics/catalog";
import { deltaTone, formatDelta, formatMetric } from "@/lib/metrics/format";
import { cn } from "@/lib/utils";

const ACCENT: Record<string, string> = {
  recovery: "var(--chart-1)",
  sleep: "var(--chart-3)",
  activity: "var(--chart-2)",
  heart_rate: "var(--chart-5)",
  hrv: "var(--chart-1)",
  health_metrics: "var(--chart-4)",
  workouts: "var(--chart-2)",
};

export function MetricCard({ summary, t, locale, timeZone, today }: { summary: MetricSummary; t: Dictionary; locale: Locale; timeZone: string; today: string }) {
  const def = METRICS[summary.metric];
  const { text, unit } = formatMetric(summary.metric, summary.value, locale);
  const delta = formatDelta(summary.metric, summary.delta, locale);
  const tone = deltaTone(summary.metric, summary.delta);
  const avg = formatMetric(summary.metric, summary.average, locale);
  const vendor = def.comparability === "vendor" && summary.provider ? (def.vendorLabel?.[summary.provider] ?? PROVIDER_LABEL[summary.provider]) : null;
  const DeltaIcon = summary.delta === null || summary.delta === 0 ? Minus : summary.delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="flex flex-col gap-2" data-testid={`metric-${summary.metric}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-medium text-muted-foreground">{t.metrics[summary.metric]}</h3>
        {vendor ? <Badge variant="violet" title={t.common.vendorScore}>{vendor}</Badge> : null}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none tracking-tight tabular", summary.value === null && "text-muted-foreground")}>
          {summary.value === null ? <span title={t.common.notAvailable}>–</span> : text}
        </span>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </div>
      {summary.value === null ? (
        <p className="text-xs text-muted-foreground">{t.common.notAvailable}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {delta ? (
            <span className={cn("inline-flex items-center gap-0.5 tabular", tone === "positive" ? "text-green" : tone === "negative" ? "text-red" : "text-muted-foreground")}>
              <DeltaIcon className="size-3.5" /> {delta} <span className="text-muted-foreground">{t.common.vsYesterday}</span>
            </span>
          ) : null}
          {summary.average !== null ? (
            <span className="text-muted-foreground tabular">
              {t.common.average} {avg.text}
              {avg.unit ? ` ${avg.unit}` : ""}
            </span>
          ) : null}
        </div>
      )}
      <Sparkline data={summary.spark} color={ACCENT[def.category]} />
      <p className="text-[10px] text-muted-foreground/80">
        {summary.date && summary.date !== today ? `${formatShortDate(summary.date, locale)} · ` : ""}
        {summary.lastSyncedAt ? `${t.common.lastUpdated} ${formatTime(summary.lastSyncedAt, locale, timeZone)}` : t.common.noData}
      </p>
    </Card>
  );
}
