"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export type ChartRow = { date: string } & Record<string, number | null | string>;

function fmtDate(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * Line / bar / area chart for daily series. Missing values stay `null`
 * and are drawn as gaps – never interpolated or replaced by zero.
 */
export function TrendChart({
  data,
  series,
  type = "line",
  unit = "",
  locale = "de-CH",
  height = 260,
  valueFormat = "number",
}: {
  data: ChartRow[];
  series: ChartSeries[];
  type?: "line" | "bar" | "area";
  unit?: string;
  locale?: string;
  height?: number;
  valueFormat?: "number" | "duration";
}) {
  const fmtValue = (v: unknown) => {
    if (typeof v !== "number") return "–";
    if (valueFormat === "duration") return `${Math.floor(v / 60)} h ${String(Math.round(v % 60)).padStart(2, "0")}`;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v)}${unit ? ` ${unit}` : ""}`;
  };
  const common = {
    data,
    margin: { top: 8, right: 8, bottom: 0, left: -12 },
  };
  const axes = (
    <>
      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d, locale)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
      <YAxis
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        width={48}
        domain={["auto", "auto"]}
        tickFormatter={(v: number) => (valueFormat === "duration" ? `${Math.round(v / 60)}h` : new Intl.NumberFormat(locale, { notation: "compact" }).format(v))}
      />
      <Tooltip
        contentStyle={{ background: "var(--card-elevated)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
        labelStyle={{ color: "var(--muted-foreground)" }}
        labelFormatter={(d) => fmtDate(String(d), locale)}
        formatter={(v, name) => [fmtValue(v), name]}
      />
      {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
    </>
  );
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {type === "bar" ? (
          <BarChart {...common}>
            {axes}
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
            ))}
          </BarChart>
        ) : type === "area" ? (
          <AreaChart {...common}>
            {axes}
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2} connectNulls={false} dot={false} />
            ))}
          </AreaChart>
        ) : (
          <LineChart {...common}>
            {axes}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} connectNulls={false} dot={data.length <= 14 ? { r: 3 } : false} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
