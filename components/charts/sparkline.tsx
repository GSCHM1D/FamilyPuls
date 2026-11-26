"use client";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/data/types";

/** Tiny trend line; nulls are rendered as gaps (connectNulls=false). */
export function Sparkline({ data, color = "var(--chart-1)" }: { data: SeriesPoint[]; color?: string }) {
  if (!data.some((d) => d.value !== null)) return <div className="h-8" aria-hidden />;
  return (
    <div className="h-8 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
