import { describe, expect, it } from "vitest";
import { emptyGoogleRaw, normalizeGoogle } from "@/lib/providers/google-health/normalize";

const ctx = { userId: "u4", syncedAt: "2026-11-25T23:00:00.000Z", range: { start: "2026-11-20", end: "2026-11-26" } };
const d = { year: 2026, month: 11, day: 25 };

function raw() {
  const r = emptyGoogleRaw();
  r.restingHeartRate = [{ dailyRestingHeartRate: { date: d, beatsPerMinute: "58" } }];
  r.hrv = [{ dailyHeartRateVariability: { date: d, averageHeartRateVariabilityMilliseconds: 56.2 } }];
  r.oxygenSaturation = [{ dailyOxygenSaturation: { date: d, averagePercentage: 95.9 } }];
  r.respiratoryRate = [{ dailyRespiratoryRate: { date: d, breathsPerMinute: 14.6 } }];
  r.sleepTemperature = [{ dailySleepTemperatureDerivations: { date: d, nightlyTemperatureCelsius: 34.07, baselineTemperatureCelsius: 33.95 } }];
  r.stepsRollup = [{ civilStartTime: { date: d }, steps: { countSum: "9410" } }, { civilStartTime: { date: { year: 2026, month: 11, day: 24 } }, steps: {} }];
  r.caloriesRollup = [{ civilStartTime: { date: d }, totalCalories: { kcalSum: 2210.6 } }];
  r.heartRateRollup = [{ civilStartTime: { date: d }, heartRate: { beatsPerMinuteAvg: 71.4, beatsPerMinuteMax: 164 } }];
  r.activeMinutesRollup = [{ civilStartTime: { date: d }, activeMinutes: { activeMinutesRollupByActivityLevel: [{ activityLevel: "LIGHT", activeMinutesSum: "120" }, { activityLevel: "MODERATE", activeMinutesSum: "25" }, { activityLevel: "VIGOROUS", activeMinutesSum: "18" }] } }];
  r.sleep = [
    {
      name: "users/me/dataTypes/sleep/dataPoints/9875412",
      sleep: {
        interval: { startTime: "2026-11-24T22:10:00Z", endTime: "2026-11-25T06:20:00Z", civilEndTime: { date: d } },
        type: "STAGES",
        stages: [
          { type: "LIGHT", startTime: "2026-11-24T22:10:00Z", endTime: "2026-11-24T23:00:00Z" },
          { type: "DEEP", startTime: "2026-11-24T23:00:00Z", endTime: "2026-11-24T23:40:00Z" },
          { type: "SLEEP_STAGE_TYPE_UNSPECIFIED", startTime: "2026-11-24T23:40:00Z", endTime: "2026-11-24T23:41:00Z" },
        ],
        summary: { minutesAsleep: "458", minutesAwake: "32", minutesInSleepPeriod: "490", stagesSummary: [{ type: "DEEP", minutes: "80" }, { type: "REM", minutes: "100" }, { type: "LIGHT", minutes: "278" }, { type: "AWAKE", minutes: "32" }] },
        metadata: { mainSleep: true, nap: false },
      },
    },
    {
      name: "users/me/dataTypes/sleep/dataPoints/111",
      sleep: { interval: { startTime: "2026-11-25T13:00:00Z", endTime: "2026-11-25T13:40:00Z", civilEndTime: { date: d } }, summary: { minutesAsleep: "35" }, metadata: { nap: true } },
    },
  ];
  r.exercise = [
    {
      name: "users/me/dataTypes/exercise/dataPoints/555",
      exercise: {
        interval: { startTime: "2026-11-25T16:00:00Z", endTime: "2026-11-25T16:50:00Z", civilStartTime: { date: d } },
        exerciseType: "RUNNING",
        displayName: "Running",
        activeDuration: "2700s",
        metricsSummary: { caloriesKcal: 431.2, averageHeartRateBeatsPerMinute: "148", distanceMillimeters: 7_200_000 },
      },
    },
  ];
  return r;
}

const value = (b: ReturnType<typeof normalizeGoogle>, metric: string, date = "2026-11-25") => b.daily.find((x) => x.metric === metric && x.localDate === date)?.value;

describe("Google Health normalization", () => {
  const batch = normalizeGoogle(raw(), ctx);

  it("parses int64 strings and maps daily vitals", () => {
    expect(value(batch, "resting_heart_rate")).toBe(58);
    expect(value(batch, "hrv")).toBe(56.2);
    expect(value(batch, "spo2")).toBe(95.9);
    expect(value(batch, "respiratory_rate")).toBe(14.6);
  });

  it("reports skin temperature as deviation from the personal baseline (Google guidance)", () => {
    expect(value(batch, "skin_temperature_deviation")).toBe(0.12);
    expect(value(batch, "skin_temperature")).toBeUndefined();
  });

  it("maps rollups and does not create a value when the rollup is empty", () => {
    expect(value(batch, "steps")).toBe(9410);
    expect(value(batch, "steps", "2026-11-24")).toBeUndefined();
    expect(value(batch, "calories")).toBe(2211);
    expect(value(batch, "avg_heart_rate")).toBe(71);
    expect(value(batch, "max_heart_rate")).toBe(164);
    expect(value(batch, "active_minutes")).toBe(43); // moderate + vigorous
  });

  it("uses the main sleep for daily duration and keeps stage segments", () => {
    expect(value(batch, "sleep_duration")).toBe(458);
    const main = batch.sleep.find((s) => s.externalId === "9875412")!;
    expect(main).toMatchObject({ deepMin: 80, remMin: 100, lightMin: 278, inBedMin: 490, efficiencyPct: null });
    expect(main.stages.map((s) => s.stage)).toEqual(["light", "deep"]);
    expect(batch.sleep.find((s) => s.externalId === "111")?.isNap).toBe(true);
  });

  it("does not provide vendor scores that the API does not have", () => {
    expect(value(batch, "recovery_score")).toBeUndefined();
    expect(value(batch, "sleep_performance")).toBeUndefined();
    expect(value(batch, "sleep_efficiency")).toBeUndefined();
  });

  it("maps exercises using active duration", () => {
    expect(batch.workouts[0]).toMatchObject({ externalId: "555", sport: "Running", durationMin: 45, calories: 431, avgHeartRate: 148, distanceM: 7200, maxHeartRate: null });
    expect(value(batch, "workout_count")).toBe(1);
  });

  it("returns nothing for empty responses", () => {
    expect(normalizeGoogle(emptyGoogleRaw(), ctx)).toEqual({ daily: [], sleep: [], workouts: [] });
  });
});
