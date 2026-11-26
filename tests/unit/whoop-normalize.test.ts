import { describe, expect, it } from "vitest";
import { normalizeWhoop, whoopCycleLocalDate } from "@/lib/providers/whoop/normalize";
import { whoopCycle, whoopNap, whoopRecovery, whoopSleep, whoopWorkout } from "./fixtures/whoop";

const ctx = { userId: "u1", timeZone: "Europe/Zurich", syncedAt: "2026-11-25T23:00:00.000Z", range: { start: "2026-11-20", end: "2026-11-26" } };
const value = (batch: ReturnType<typeof normalizeWhoop>, metric: string, date = "2026-11-25") => batch.daily.find((d) => d.metric === metric && d.localDate === date)?.value;

describe("WHOOP normalization", () => {
  const batch = normalizeWhoop({ cycles: [whoopCycle], recoveries: [whoopRecovery], sleeps: [whoopSleep, whoopNap], workouts: [whoopWorkout] }, ctx);

  it("maps recovery fields (vendor score, RHR, HRV RMSSD, SpO2, skin temp) to the wake-up date", () => {
    expect(value(batch, "recovery_score")).toBe(72);
    expect(value(batch, "resting_heart_rate")).toBe(53);
    expect(value(batch, "hrv")).toBe(81.4);
    expect(value(batch, "spo2")).toBe(96.8);
    expect(value(batch, "skin_temperature")).toBe(33.7);
  });

  it("derives sleep duration from light + SWS + REM (excluding awake time) and ignores naps for the daily value", () => {
    expect(value(batch, "sleep_duration")).toBe(480); // 250 + 100 + 130 min
    expect(value(batch, "sleep_performance")).toBe(91);
    expect(value(batch, "sleep_efficiency")).toBe(94.1);
    expect(value(batch, "respiratory_rate")).toBe(15.2);
    expect(batch.sleep).toHaveLength(2);
    expect(batch.sleep.find((s) => s.isNap)?.externalId).toBe("nap-1");
  });

  it("converts kilojoules to kcal and takes steps from the cycle", () => {
    expect(value(batch, "calories")).toBe(2200);
    expect(value(batch, "strain")).toBe(12.4);
    expect(value(batch, "steps")).toBe(10420);
    expect(value(batch, "max_heart_rate")).toBe(171);
  });

  it("aggregates workouts per day", () => {
    expect(batch.workouts[0]).toMatchObject({ externalId: "1043-workout-uuid", durationMin: 45, calories: 500, distanceM: 7400 });
    expect(value(batch, "workout_count")).toBe(1);
    expect(value(batch, "workout_duration")).toBe(45);
  });

  it("never invents values: unscored records and null step counts produce no rows", () => {
    const b = normalizeWhoop(
      {
        cycles: [{ ...whoopCycle, score_state: "PENDING_SCORE", score: null, step_count: null }],
        recoveries: [{ ...whoopRecovery, score_state: "UNSCORABLE", score: null }],
        sleeps: [{ ...whoopSleep, score_state: "PENDING_SCORE", score: null }],
        workouts: [],
      },
      ctx,
    );
    expect(b.daily).toEqual([]);
    expect(b.sleep[0]?.durationAsleepMin).toBeNull();
  });

  it("omits optional fields that are missing (e.g. SpO2 not measured) instead of writing 0", () => {
    const b = normalizeWhoop({ cycles: [], recoveries: [{ ...whoopRecovery, score: { ...whoopRecovery.score!, spo2_percentage: null } }], sleeps: [whoopSleep], workouts: [] }, ctx);
    expect(value(b, "spo2")).toBeUndefined();
    expect(value(b, "hrv")).toBe(81.4);
  });

  it("filters rows outside the requested range", () => {
    const b = normalizeWhoop({ cycles: [whoopCycle], recoveries: [whoopRecovery], sleeps: [whoopSleep], workouts: [whoopWorkout] }, { ...ctx, range: { start: "2026-11-26", end: "2026-11-30" } });
    expect(b.daily).toEqual([]);
  });

  it("attributes cycles to the local date of their midpoint", () => {
    expect(whoopCycleLocalDate(whoopCycle)).toBe("2026-11-25");
    // ongoing cycle started late evening → counts for the next day once past midnight
    expect(whoopCycleLocalDate({ start: "2026-11-25T22:30:00Z", end: null, timezone_offset: "+01:00" }, new Date("2026-11-26T09:00:00Z"))).toBe("2026-11-26");
  });
});
