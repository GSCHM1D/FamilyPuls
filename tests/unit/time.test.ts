import { describe, expect, it } from "vitest";
import { addDays, chunkDateRange, civilDateToString, dateRange, isIsoDate, localDateInZone, localDateWithOffset, parseGoogleDurationSeconds, parseOffsetMinutes, todayInZone } from "@/lib/normalization/time";

describe("time helpers", () => {
  it("parses TZD offsets", () => {
    expect(parseOffsetMinutes("+02:00")).toBe(120);
    expect(parseOffsetMinutes("-05:30")).toBe(-330);
    expect(parseOffsetMinutes("Z")).toBe(0);
  });

  it("parses protobuf durations", () => {
    expect(parseGoogleDurationSeconds("3600s")).toBe(3600);
    expect(parseGoogleDurationSeconds("-7200s")).toBe(-7200);
    expect(parseGoogleDurationSeconds(undefined)).toBe(0);
  });

  it("computes local dates with an offset across midnight", () => {
    expect(localDateWithOffset("2026-11-25T23:30:00Z", 60)).toBe("2026-11-26");
    expect(localDateWithOffset("2026-11-26T03:00:00Z", -300)).toBe("2026-11-25");
  });

  it("uses Europe/Zurich incl. daylight saving time", () => {
    expect(localDateInZone("2026-07-01T22:30:00Z", "Europe/Zurich")).toBe("2026-07-02"); // CEST +2
    expect(localDateInZone("2026-12-01T22:30:00Z", "Europe/Zurich")).toBe("2026-12-01"); // CET +1
    expect(todayInZone("Europe/Zurich", new Date("2026-03-29T22:30:00Z"))).toBe("2026-03-30");
  });

  it("handles date arithmetic and ranges", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(dateRange("2026-11-01", "2026-11-03")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(chunkDateRange("2026-01-01", "2026-01-10", 4)).toEqual([
      { start: "2026-01-01", end: "2026-01-04" },
      { start: "2026-01-05", end: "2026-01-08" },
      { start: "2026-01-09", end: "2026-01-10" },
    ]);
  });

  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-11-26")).toBe(true);
    expect(isIsoDate("26.11.2026")).toBe(false);
    expect(civilDateToString({ year: 2026, month: 3, day: 7 })).toBe("2026-03-07");
    expect(civilDateToString({ year: 2026 })).toBeNull();
  });
});
