import { formatDurationMinutes, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MetricKey } from "@/types/health";
import { METRICS } from "./catalog";

const DURATION_METRICS = new Set<MetricKey>(["sleep_duration", "workout_duration"]);

/** Returns value text and unit separately; "–" for missing values (never 0). */
export function formatMetric(metric: MetricKey, value: number | null | undefined, locale: Locale): { text: string; unit: string } {
  if (value === null || value === undefined || !Number.isFinite(value)) return { text: "–", unit: "" };
  if (DURATION_METRICS.has(metric)) return { text: formatDurationMinutes(value), unit: "" };
  const def = METRICS[metric];
  const text = metric === "skin_temperature_deviation" && value > 0 ? `+${formatNumber(value, locale, def.decimals)}` : formatNumber(value, locale, def.decimals);
  return { text, unit: def.unit };
}

export function formatDelta(metric: MetricKey, delta: number | null, locale: Locale): string | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const abs = Math.abs(delta);
  if (DURATION_METRICS.has(metric)) return `${sign}${formatDurationMinutes(abs)}`;
  return `${sign}${formatNumber(abs, locale, METRICS[metric].decimals)}`;
}

/** "positive" | "negative" | "neutral" – only for colour, never a health judgement. */
export function deltaTone(metric: MetricKey, delta: number | null): "positive" | "negative" | "neutral" {
  const hib = METRICS[metric].higherIsBetter;
  if (delta === null || delta === 0 || hib === null) return "neutral";
  return (delta > 0) === hib ? "positive" : "negative";
}
