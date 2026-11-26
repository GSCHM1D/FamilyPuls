/** Fictional WHOOP API v2 responses shaped exactly like the official OpenAPI schemas. */
import type { WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout } from "@/lib/providers/whoop/types";

export const whoopSleep: WhoopSleep = {
  id: "ecfc6a15-4661-442f-a9a4-f160dd7afae8",
  cycle_id: 93845,
  user_id: 10129,
  created_at: "2026-11-25T06:31:00.000Z",
  updated_at: "2026-11-25T06:40:00.000Z",
  start: "2026-11-24T21:45:00.000Z",
  end: "2026-11-25T06:15:00.000Z",
  timezone_offset: "+01:00",
  nap: false,
  score_state: "SCORED",
  score: {
    stage_summary: {
      total_in_bed_time_milli: 30_600_000,
      total_awake_time_milli: 1_800_000,
      total_no_data_time_milli: 0,
      total_light_sleep_time_milli: 15_000_000,
      total_slow_wave_sleep_time_milli: 6_000_000,
      total_rem_sleep_time_milli: 7_800_000,
      sleep_cycle_count: 4,
      disturbance_count: 9,
    },
    sleep_needed: { baseline_milli: 27_000_000, need_from_sleep_debt_milli: 0, need_from_recent_strain_milli: 0, need_from_recent_nap_milli: 0 },
    respiratory_rate: 15.2,
    sleep_performance_percentage: 91,
    sleep_consistency_percentage: 84,
    sleep_efficiency_percentage: 94.1,
  },
};

export const whoopNap: WhoopSleep = { ...whoopSleep, id: "nap-1", nap: true, start: "2026-11-25T13:00:00.000Z", end: "2026-11-25T13:30:00.000Z" };

export const whoopRecovery: WhoopRecovery = {
  cycle_id: 93845,
  sleep_id: whoopSleep.id,
  user_id: 10129,
  created_at: "2026-11-25T06:35:00.000Z",
  updated_at: "2026-11-25T06:35:00.000Z",
  score_state: "SCORED",
  score: { user_calibrating: false, recovery_score: 72, resting_heart_rate: 53, hrv_rmssd_milli: 81.4, spo2_percentage: 96.8, skin_temp_celsius: 33.7 },
};

export const whoopCycle: WhoopCycle = {
  id: 93845,
  user_id: 10129,
  created_at: "2026-11-24T21:45:00.000Z",
  updated_at: "2026-11-25T22:00:00.000Z",
  start: "2026-11-24T21:45:00.000Z",
  end: "2026-11-25T22:10:00.000Z",
  timezone_offset: "+01:00",
  score_state: "SCORED",
  score: { strain: 12.4, kilojoule: 9204.8, average_heart_rate: 68, max_heart_rate: 171 },
  step_count: 10420,
};

export const whoopWorkout: WhoopWorkout = {
  id: "1043-workout-uuid",
  user_id: 10129,
  created_at: "2026-11-25T17:00:00.000Z",
  updated_at: "2026-11-25T17:05:00.000Z",
  start: "2026-11-25T16:00:00.000Z",
  end: "2026-11-25T16:45:00.000Z",
  timezone_offset: "+01:00",
  sport_name: "running",
  score_state: "SCORED",
  score: { strain: 9.1, average_heart_rate: 151, max_heart_rate: 178, kilojoule: 2092, percent_recorded: 100, distance_meter: 7400, altitude_gain_meter: 40, altitude_change_meter: 2, zone_durations: {} },
};
