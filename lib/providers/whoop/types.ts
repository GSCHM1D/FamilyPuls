/**
 * WHOOP API v2 response types – taken from the official OpenAPI spec
 * (https://api.prod.whoop.com/developer/doc/openapi.json, checked 2026-11-26).
 */
export type ScoreState = "SCORED" | "PENDING_SCORE" | "UNSCORABLE";

export interface WhoopPage<T> {
  records: T[];
  next_token?: string | null;
}

export interface WhoopCycle {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end?: string | null;
  timezone_offset: string;
  score_state: ScoreState;
  score?: { strain: number; kilojoule: number; average_heart_rate: number; max_heart_rate: number } | null;
  step_count?: number | null;
}

export interface WhoopRecovery {
  cycle_id: number;
  sleep_id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: ScoreState;
  score?: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage?: number | null;
    skin_temp_celsius?: number | null;
  } | null;
}

export interface WhoopSleep {
  id: string;
  cycle_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: ScoreState;
  score?: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: Record<string, number>;
    respiratory_rate?: number | null;
    sleep_performance_percentage?: number | null;
    sleep_consistency_percentage?: number | null;
    sleep_efficiency_percentage?: number | null;
  } | null;
}

export interface WhoopWorkout {
  id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_name: string;
  score_state: ScoreState;
  score?: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    percent_recorded: number;
    distance_meter?: number | null;
    altitude_gain_meter?: number | null;
    altitude_change_meter?: number | null;
    zone_durations: Record<string, number>;
  } | null;
}

export interface WhoopBasicProfile {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface WhoopBodyMeasurement {
  height_meter: number;
  weight_kilogram: number;
  max_heart_rate: number;
}

export type WhoopWebhookType =
  | "workout.updated"
  | "workout.deleted"
  | "sleep.updated"
  | "sleep.deleted"
  | "recovery.updated"
  | "recovery.deleted";

export interface WhoopWebhookPayload {
  user_id: number;
  id: string | number;
  type: WhoopWebhookType;
  trace_id: string;
}
