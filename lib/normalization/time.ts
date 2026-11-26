/** Time helpers. Technical timestamps are UTC ISO strings; display uses an IANA zone (default Europe/Zurich). */
export const DEFAULT_TIMEZONE = "Europe/Zurich";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Parses a TZD offset "+hh:mm" | "-hh:mm" | "Z" into minutes. */
export function parseOffsetMinutes(offset: string | null | undefined): number {
  if (!offset || offset === "Z") return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim());
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/** Parses a protobuf JSON duration ("7200s", "-3600s", "3.5s") into seconds. */
export function parseGoogleDurationSeconds(duration: string | null | undefined): number {
  if (!duration) return 0;
  const m = /^(-?\d+(?:\.\d+)?)s$/.exec(duration.trim());
  return m ? Number(m[1]) : 0;
}

/** Local calendar date for an instant shifted by a fixed UTC offset (in minutes). */
export function localDateWithOffset(isoUtc: string, offsetMinutes: number): string {
  const t = new Date(isoUtc).getTime() + offsetMinutes * 60_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Local calendar date for an instant in an IANA timezone. */
export function localDateInZone(isoUtc: string | Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const d = typeof isoUtc === "string" ? new Date(isoUtc) : isoUtc;
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function todayInZone(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return localDateInZone(now, timeZone);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function civilDateToString(d: { year?: number; month?: number; day?: number } | null | undefined): string | null {
  if (!d?.year || !d.month || !d.day) return null;
  return `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

export function stringToCivilDate(date: string): { year: number; month: number; day: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { year: y!, month: m!, day: d! };
}

/** Splits [start, end] (inclusive dates) into chunks of at most `size` days. */
export function chunkDateRange(start: string, end: string, size: number): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  let cursor = start;
  while (cursor <= end) {
    const chunkEnd = addDays(cursor, size - 1) < end ? addDays(cursor, size - 1) : end;
    chunks.push({ start: cursor, end: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

export function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000));
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
