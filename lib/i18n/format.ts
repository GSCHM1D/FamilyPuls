import type { Locale } from "./dictionaries";
import { DEFAULT_TIMEZONE } from "@/lib/normalization/time";

const intlLocale = (locale: Locale) => (locale === "de" ? "de-CH" : "en-CH");

export function formatNumber(value: number | null | undefined, locale: Locale, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** 492 → "8 h 12" (Swiss style used in the spec). */
export function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "–";
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function formatTime(iso: string | null | undefined, locale: Locale, timeZone = DEFAULT_TIMEZONE): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

export function formatDate(date: string | null | undefined, locale: Locale, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }): string {
  if (!date) return "–";
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function formatShortDate(date: string, locale: Locale): string {
  return formatDate(date, locale, { day: "2-digit", month: "2-digit" });
}

export function formatDateTime(iso: string | null | undefined, locale: Locale, timeZone = DEFAULT_TIMEZONE): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}
