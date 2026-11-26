import { addDays, chunkDateRange, stringToCivilDate } from "@/lib/normalization/time";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import { authedJson } from "../api-client";
import { requestToken, type TokenSet } from "../oauth";
import type { HealthProfile, HealthProvider, ProviderContext } from "../types";
import { emptyGoogleRaw, normalizeGoogle, type GoogleRaw } from "./normalize";
import type { GDailyRollUpResponse, GDailyRollupDataPoint, GDataPoint, GIdentity, GListDataPointsResponse } from "./types";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_HEALTH_API = "https://health.googleapis.com/v4";

/** Read-only scopes required for the core features. No write, location, nutrition or ECG scopes. */
export const GOOGLE_HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.profile.readonly",
] as const;

/** Which data needs which scope (from the official data type table). */
export const SCOPE_FOR = {
  activity: GOOGLE_HEALTH_SCOPES[0],
  sleep: GOOGLE_HEALTH_SCOPES[1],
  health: GOOGLE_HEALTH_SCOPES[2],
  profile: GOOGLE_HEALTH_SCOPES[3],
} as const;

/** Daily data types queried via `list` with a `{snake}.date` filter. */
const DAILY_TYPES = {
  restingHeartRate: "daily-resting-heart-rate",
  hrv: "daily-heart-rate-variability",
  oxygenSaturation: "daily-oxygen-saturation",
  respiratoryRate: "daily-respiratory-rate",
  sleepTemperature: "daily-sleep-temperature-derivations",
} as const;

/** Rollup types and their documented maximum range (days) for dailyRollUp. */
const ROLLUPS = {
  stepsRollup: { type: "steps", maxDays: 90 },
  activeZoneMinutesRollup: { type: "active-zone-minutes", maxDays: 90 },
  caloriesRollup: { type: "total-calories", maxDays: 14 },
  heartRateRollup: { type: "heart-rate", maxDays: 14 },
  activeMinutesRollup: { type: "active-minutes", maxDays: 14 },
} as const;

const snake = (dataType: string) => dataType.replace(/-/g, "_");

export interface GoogleHealthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function grantedScopes(scope: string | null): string[] {
  return (scope ?? "").split(/\s+/).filter(Boolean);
}

export function missingScopes(scope: string | null): string[] {
  const granted = new Set(grantedScopes(scope));
  return GOOGLE_HEALTH_SCOPES.filter((s) => !granted.has(s));
}

export class GoogleHealthProvider implements HealthProvider {
  readonly id = "google_health" as const;
  readonly scopes = GOOGLE_HEALTH_SCOPES;
  readonly maxRangeDays = 28;
  /** Scopes granted by the user (partial consent is possible). Set before fetchRange. */
  granted: Set<string> = new Set(GOOGLE_HEALTH_SCOPES);

  constructor(private readonly config: GoogleHealthConfig) {}

  buildAuthorizationUrl({ state, codeChallenge }: { state: string; codeChallenge: string }): string {
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_HEALTH_SCOPES.join(" "));
    url.searchParams.set("access_type", "offline"); // refresh token
    url.searchParams.set("prompt", "consent"); // ensures a refresh token is issued on re-authorization
    url.searchParams.set("include_granted_scopes", "false");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  exchangeCode({ code, codeVerifier }: { code: string; codeVerifier: string }): Promise<TokenSet> {
    return requestToken(GOOGLE_TOKEN_URL, {
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
    });
  }

  refresh(refreshToken: string): Promise<TokenSet> {
    return requestToken(GOOGLE_TOKEN_URL, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
  }

  async revoke({ accessToken, refreshToken }: { accessToken: string; refreshToken: string | null }): Promise<void> {
    // Revoking the refresh token also revokes all access tokens of the grant.
    await fetchWithRetry(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken ?? accessToken }).toString(),
      cache: "no-store",
    }, { maxRetries: 1 });
  }

  /** GET /v4/users/me/identity – confirms the Google account is linked to Google Health. */
  getIdentity(ctx: ProviderContext): Promise<GIdentity> {
    return authedJson<GIdentity>(ctx, `${GOOGLE_HEALTH_API}/users/me/identity`);
  }

  async getProfile(ctx: ProviderContext): Promise<HealthProfile> {
    const identity = await this.getIdentity(ctx);
    if (!identity.healthUserId) throw new Error("Google account is not linked to Google Health (no healthUserId)");
    return { externalUserId: identity.healthUserId, displayName: null, email: null };
  }

  async listAll(ctx: ProviderContext, dataType: string, filter: string, pageSize?: number, maxPages = 40): Promise<GDataPoint[]> {
    const out: GDataPoint[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const url = new URL(`${GOOGLE_HEALTH_API}/users/me/dataTypes/${dataType}/dataPoints`);
      url.searchParams.set("filter", filter);
      if (pageSize) url.searchParams.set("pageSize", String(pageSize));
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await authedJson<GListDataPointsResponse>(ctx, url.toString());
      out.push(...(res.dataPoints ?? []));
      pageToken = res.nextPageToken || undefined;
      if (!pageToken) return out;
    }
    throw new Error(`Google Health pagination exceeded ${maxPages} pages for ${dataType}`);
  }

  /** POST …/dataPoints:dailyRollUp over [start, endExclusive), chunked to the documented maximum range. */
  async dailyRollUp(ctx: ProviderContext, dataType: string, start: string, end: string, maxDays: number): Promise<GDailyRollupDataPoint[]> {
    const out: GDailyRollupDataPoint[] = [];
    for (const chunk of chunkDateRange(start, end, maxDays)) {
      let pageToken: string | undefined;
      for (let page = 0; page < 10; page++) {
        const body = {
          range: { start: { date: stringToCivilDate(chunk.start) }, end: { date: stringToCivilDate(addDays(chunk.end, 1)) } },
          windowSizeDays: 1,
          pageSize: maxDays,
          ...(pageToken ? { pageToken } : {}),
        };
        const res = await authedJson<GDailyRollUpResponse>(
          ctx,
          `${GOOGLE_HEALTH_API}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        );
        out.push(...(res.rollupDataPoints ?? []));
        pageToken = res.nextPageToken || undefined;
        if (!pageToken) break;
      }
    }
    return out;
  }

  async fetchRange(ctx: ProviderContext, startDate: string, endDate: string) {
    const raw: GoogleRaw = emptyGoogleRaw();
    const endExclusive = addDays(endDate, 1);
    const has = (scope: string) => this.granted.has(scope);

    if (has(SCOPE_FOR.health)) {
      for (const [key, type] of Object.entries(DAILY_TYPES) as [keyof typeof DAILY_TYPES, string][]) {
        const f = `${snake(type)}.date >= "${startDate}" AND ${snake(type)}.date < "${endExclusive}"`;
        raw[key] = await this.listAll(ctx, type, f);
      }
    }
    if (has(SCOPE_FOR.health)) {
      raw.heartRateRollup = await this.dailyRollUp(ctx, ROLLUPS.heartRateRollup.type, startDate, endDate, ROLLUPS.heartRateRollup.maxDays);
    }
    if (has(SCOPE_FOR.sleep)) {
      raw.sleep = await this.listAll(
        ctx,
        "sleep",
        `sleep.interval.civil_end_time >= "${startDate}" AND sleep.interval.civil_end_time < "${endExclusive}"`,
        25,
      );
    }
    if (has(SCOPE_FOR.activity)) {
      raw.exercise = await this.listAll(
        ctx,
        "exercise",
        `exercise.interval.civil_start_time >= "${startDate}" AND exercise.interval.civil_start_time < "${endExclusive}"`,
        25,
      );
      for (const key of ["stepsRollup", "activeZoneMinutesRollup", "caloriesRollup", "activeMinutesRollup"] as const) {
        raw[key] = await this.dailyRollUp(ctx, ROLLUPS[key].type, startDate, endDate, ROLLUPS[key].maxDays);
      }
    }
    return normalizeGoogle(raw, { userId: ctx.userId, syncedAt: new Date().toISOString(), range: { start: startDate, end: endDate } });
  }
}

export function googleHealthFromEnv(): GoogleHealthProvider | null {
  const { GOOGLE_HEALTH_CLIENT_ID, GOOGLE_HEALTH_CLIENT_SECRET, GOOGLE_HEALTH_REDIRECT_URI } = process.env;
  if (!GOOGLE_HEALTH_CLIENT_ID || !GOOGLE_HEALTH_CLIENT_SECRET || !GOOGLE_HEALTH_REDIRECT_URI) return null;
  return new GoogleHealthProvider({ clientId: GOOGLE_HEALTH_CLIENT_ID, clientSecret: GOOGLE_HEALTH_CLIENT_SECRET, redirectUri: GOOGLE_HEALTH_REDIRECT_URI });
}
