/**
 * Google Health API v4 types – taken from the official discovery document
 * (https://health.googleapis.com/$discovery/rest?version=v4, checked 2026-11-26).
 * int64 values are serialized as JSON strings.
 */
export interface GDate { year?: number; month?: number; day?: number }
export interface GTimeOfDay { hours?: number; minutes?: number; seconds?: number; nanos?: number }
export interface GCivilDateTime { date?: GDate; time?: GTimeOfDay }

export interface GSessionTimeInterval {
  startTime: string;
  endTime: string;
  startUtcOffset?: string;
  endUtcOffset?: string;
  civilStartTime?: GCivilDateTime;
  civilEndTime?: GCivilDateTime;
}

export type GSleepStageType = "SLEEP_STAGE_TYPE_UNSPECIFIED" | "AWAKE" | "LIGHT" | "DEEP" | "REM" | "ASLEEP" | "RESTLESS";

export interface GSleep {
  interval: GSessionTimeInterval;
  type?: "SLEEP_TYPE_UNSPECIFIED" | "CLASSIC" | "STAGES";
  stages?: { type: GSleepStageType; startTime: string; endTime: string }[];
  summary?: {
    minutesInSleepPeriod?: string;
    minutesAfterWakeUp?: string;
    minutesAwake?: string;
    minutesAsleep?: string;
    minutesToFallAsleep?: string;
    stagesSummary?: { type: GSleepStageType; minutes?: string; count?: string }[];
  };
  metadata?: { externalId?: string; nap?: boolean; mainSleep?: boolean; processed?: boolean; manuallyEdited?: boolean };
}

export interface GExercise {
  interval: GSessionTimeInterval;
  exerciseType: string;
  displayName: string;
  activeDuration?: string;
  metricsSummary?: {
    caloriesKcal?: number;
    averageHeartRateBeatsPerMinute?: string;
    distanceMillimeters?: number;
    activeZoneMinutes?: string;
    steps?: string;
  };
}

export interface GDataPoint {
  name?: string;
  sleep?: GSleep;
  exercise?: GExercise;
  dailyRestingHeartRate?: { date: GDate; beatsPerMinute: string };
  dailyHeartRateVariability?: { date: GDate; averageHeartRateVariabilityMilliseconds?: number; deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds?: number };
  dailyOxygenSaturation?: { date: GDate; averagePercentage: number; lowerBoundPercentage?: number; upperBoundPercentage?: number };
  dailyRespiratoryRate?: { date: GDate; breathsPerMinute: number };
  dailySleepTemperatureDerivations?: { date: GDate; nightlyTemperatureCelsius: number; baselineTemperatureCelsius?: number };
}

export interface GListDataPointsResponse {
  dataPoints?: GDataPoint[];
  nextPageToken?: string;
}

export interface GDailyRollupDataPoint {
  civilStartTime?: GCivilDateTime;
  civilEndTime?: GCivilDateTime;
  steps?: { countSum?: string };
  totalCalories?: { kcalSum?: number };
  heartRate?: { beatsPerMinuteAvg?: number; beatsPerMinuteMin?: number; beatsPerMinuteMax?: number };
  activeMinutes?: { activeMinutesRollupByActivityLevel?: { activityLevel?: "ACTIVITY_LEVEL_UNSPECIFIED" | "LIGHT" | "MODERATE" | "VIGOROUS"; activeMinutesSum?: string }[] };
  activeZoneMinutes?: { sumInFatBurnHeartZone?: string; sumInCardioHeartZone?: string; sumInPeakHeartZone?: string };
}

export interface GDailyRollUpResponse {
  rollupDataPoints?: GDailyRollupDataPoint[];
  nextPageToken?: string;
}

export interface GIdentity {
  name?: string;
  healthUserId?: string;
  legacyUserId?: string;
}

export interface GProfile {
  name?: string;
  age?: number;
}

export interface GWebhookNotification {
  data: {
    version?: string;
    clientProvidedSubscriptionName?: string;
    healthUserId: string;
    operation: "UPSERT" | "DELETE";
    dataType: string;
    intervals?: {
      physicalTimeInterval?: { startTime?: string; endTime?: string };
      civilIso8601TimeInterval?: { startTime?: string; endTime?: string };
    }[];
    recordId?: string;
  };
}
