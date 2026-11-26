import { describe, expect, it } from "vitest";
import { summarizeMetric, toSeries } from "@/lib/data/summary";
import type { DailyValue } from "@/lib/data/types";
import { DemoRepository } from "@/lib/data/demo-repository";
import { DEMO_MEMBERS, demoCanView, demoDailyValues } from "@/lib/demo/generator";
import { formatDelta, formatMetric } from "@/lib/metrics/format";
import { formatDurationMinutes, formatNumber } from "@/lib/i18n/format";

const row = (localDate: string, value: number, metric: DailyValue["metric"] = "hrv"): DailyValue => ({ userId: "u", metric, source: "whoop", provider: "whoop", value, unit: "ms", localDate, syncedAt: "2026-11-26T06:00:00Z" });

describe("metric summaries", () => {
  it("computes value, delta to the previous day and personal average", () => {
    const s = summarizeMetric("hrv", [row("2026-11-24", 60), row("2026-11-25", 70), row("2026-11-26", 80)], "2026-11-26");
    expect(s).toMatchObject({ value: 80, delta: 10, average: 65, date: "2026-11-26" });
  });
  it("never invents a value or a zero when data is missing", () => {
    const s = summarizeMetric("hrv", [], "2026-11-26");
    expect(s.value).toBeNull();
    expect(s.delta).toBeNull();
    expect(s.average).toBeNull();
    expect(formatMetric("hrv", s.value, "de").text).toBe("–");
  });
  it("has no delta if the previous day is missing", () => {
    expect(summarizeMetric("hrv", [row("2026-11-24", 60), row("2026-11-26", 80)], "2026-11-26").delta).toBeNull();
  });
  it("ignores values older than the freshness window", () => {
    expect(summarizeMetric("hrv", [row("2026-11-20", 60)], "2026-11-26").value).toBeNull();
  });
  it("keeps gaps as null in series", () => {
    expect(toSeries([row("2026-11-24", 1), row("2026-11-26", 3)], "2026-11-24", "2026-11-26").map((p) => p.value)).toEqual([1, null, 3]);
  });
});

describe("Swiss formatting", () => {
  it("uses Swiss number formatting and h/min durations", () => {
    expect(formatNumber(10420, "de")).toBe("10’420");
    expect(formatDurationMinutes(492)).toBe("8 h 12");
    expect(formatMetric("sleep_duration", 455, "de").text).toBe("7 h 35");
    expect(formatDelta("resting_heart_rate", -2, "de")).toBe("−2");
  });
});

describe("demo mode", () => {
  it("is deterministic and fully synthetic (source = demo)", () => {
    const a = demoDailyValues(["demo-0000-a"], ["hrv"], "2026-09-01", "2026-11-26", "2026-11-26");
    const b = demoDailyValues(["demo-0000-a"], ["hrv"], "2026-09-01", "2026-11-26", "2026-11-26");
    expect(a).toEqual(b.map((r) => ({ ...r, syncedAt: a.find((x) => x.localDate === r.localDate)!.syncedAt })));
    expect(a.every((r) => r.source === "demo")).toBe(true);
    expect(a.length).toBeGreaterThan(70); // ≥ 90 days with occasional gaps
  });
  it("only generates metrics the simulated tracker really provides", () => {
    const rows = demoDailyValues(["demo-0000-d"], ["recovery_score", "steps"], "2026-11-01", "2026-11-26", "2026-11-26");
    expect(rows.some((r) => r.metric === "recovery_score")).toBe(false);
  });
  it("applies sharing rules in the demo repository as well", async () => {
    const repo = new DemoRepository({ locale: "de", theme: "dark" });
    const b = DEMO_MEMBERS.find((m) => m.userId === "demo-0000-b")!;
    expect(b.shares).not.toContain("health_metrics");
    const rows = await repo.dailyValues(["demo-0000-b"], ["spo2", "steps"], "2026-11-01", "2026-11-26");
    expect(rows.some((r) => r.metric === "spo2")).toBe(false);
    expect(rows.some((r) => r.metric === "steps")).toBe(true);
    expect(demoCanView("demo-0000-a", "demo-0000-d", "health_metrics")).toBe(true); // per-member grant
    expect(demoCanView("demo-0000-b", "demo-0000-d", "health_metrics")).toBe(false);
  });
});
