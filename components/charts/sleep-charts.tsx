"use client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface StageRow {
  date: string;
  deep: number | null;
  rem: number | null;
  light: number | null;
  awake: number | null;
}

const fmtDate = (d: string, locale: string) => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Stacked sleep stage durations per night (minutes). */
export function SleepStagesChart({ data, labels, locale = "de-CH" }: { data: StageRow[]; labels: { deep: string; rem: string; light: string; awake: string }; locale?: string }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d, locale)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v: number) => `${Math.round(v / 60)}h`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={{ background: "var(--card-elevated)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
            labelFormatter={(d) => fmtDate(String(d), locale)}
            formatter={(v, n) => [typeof v === "number" ? `${Math.floor(v / 60)} h ${String(Math.round(v % 60)).padStart(2, "0")}` : "–", n]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="deep" name={labels.deep} stackId="s" fill="var(--chart-3)" />
          <Bar dataKey="rem" name={labels.rem} stackId="s" fill="var(--chart-2)" />
          <Bar dataKey="light" name={labels.light} stackId="s" fill="var(--chart-1)" fillOpacity={0.6} />
          <Bar dataKey="awake" name={labels.awake} stackId="s" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const LEVEL: Record<string, number> = { awake: 3, rem: 2, light: 1, asleep: 1, restless: 2, deep: 0 };

/** Hypnogram from stage segments (only providers that deliver segments, e.g. Google Health). */
export function Hypnogram({ stages, labels, timeZone, locale = "de-CH" }: { stages: { stage: string; start: string; end: string }[]; labels: Record<string, string>; timeZone: string; locale?: string }) {
  const data = stages.flatMap((s) => [
    { t: Date.parse(s.start), level: LEVEL[s.stage] ?? 1 },
    { t: Date.parse(s.end), level: LEVEL[s.stage] ?? 1 },
  ]);
  const tickLabel = (v: number) => ["deep", "light", "rem", "awake"][v] ?? "";
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(v: number) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(v))} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis dataKey="level" domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={(v: number) => labels[tickLabel(v)] ?? ""} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} width={72} />
          <Line type="stepAfter" dataKey="level" stroke="var(--chart-3)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
