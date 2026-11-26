"use client";
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

export function recoveryColor(score: number | null): string {
  if (score === null) return "var(--muted-foreground)";
  if (score >= 67) return "var(--accent-green)";
  if (score >= 34) return "var(--accent-amber)";
  return "var(--accent-red)";
}

/** Radial chart for 0–100 % scores. Shows "–" when no value exists. */
export function ScoreRing({ value, label, sublabel, size = 168 }: { value: number | null; label: string; sublabel?: string; size?: number }) {
  const color = recoveryColor(value);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="80%" outerRadius="100%" data={[{ value: value ?? 0 }]} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "var(--muted)" }} fill={color} isAnimationActive />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-[family-name:var(--font-display)] text-4xl font-semibold tabular" style={{ color }}>
          {value === null ? "–" : `${Math.round(value)}%`}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
        {sublabel ? <span className="mt-0.5 text-[10px] text-muted-foreground/80">{sublabel}</span> : null}
      </div>
    </div>
  );
}
