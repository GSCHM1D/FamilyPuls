import { addDays } from "@/lib/normalization/time";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import { authedJson } from "../api-client";
import { requestToken, type TokenSet } from "../oauth";
import type { HealthProfile, HealthProvider, ProviderContext } from "../types";
import { normalizeWhoop } from "./normalize";
import type { WhoopBasicProfile, WhoopBodyMeasurement, WhoopCycle, WhoopPage, WhoopRecovery, WhoopSleep, WhoopWorkout } from "./types";

export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";

/** Read-only scopes + offline (needed for refresh tokens). */
export const WHOOP_SCOPES = [
  "offline",
  "read:recovery",
  "read:cycles",
  "read:workout",
  "read:sleep",
  "read:profile",
  "read:body_measurement",
] as const;

const PAGE_LIMIT = 25; // documented maximum

export interface WhoopConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class WhoopProvider implements HealthProvider {
  readonly id = "whoop" as const;
  readonly scopes = WHOOP_SCOPES;
  readonly maxRangeDays = 31;

  constructor(private readonly config: WhoopConfig) {}

  buildAuthorizationUrl({ state }: { state: string; codeChallenge: string }): string {
    // WHOOP documents `state` (min. 8 chars) for CSRF protection; PKCE is not documented, so we do not rely on it.
    const url = new URL(WHOOP_AUTH_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("scope", WHOOP_SCOPES.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  }

  exchangeCode({ code }: { code: string; codeVerifier: string }): Promise<TokenSet> {
    return requestToken(WHOOP_TOKEN_URL, {
      grant_type: "authorization_code",
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
    });
  }

  /** WHOOP rotates refresh tokens: the response contains a new refresh token and invalidates the old one. */
  refresh(refreshToken: string): Promise<TokenSet> {
    return requestToken(WHOOP_TOKEN_URL, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: "offline",
    });
  }

  /** DELETE /v2/user/access – revokes the token; webhooks stop for this user. */
  async revoke({ accessToken }: { accessToken: string; refreshToken: string | null }): Promise<void> {
    await fetchWithRetry(`${WHOOP_API_BASE}/v2/user/access`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }, { maxRetries: 1 });
  }

  async getProfile(ctx: ProviderContext): Promise<HealthProfile> {
    const p = await authedJson<WhoopBasicProfile>(ctx, `${WHOOP_API_BASE}/v2/user/profile/basic`);
    return { externalUserId: String(p.user_id), displayName: [p.first_name, p.last_name].filter(Boolean).join(" ") || null, email: p.email ?? null };
  }

  getBodyMeasurement(ctx: ProviderContext): Promise<WhoopBodyMeasurement> {
    return authedJson<WhoopBodyMeasurement>(ctx, `${WHOOP_API_BASE}/v2/user/measurement/body`);
  }

  getSleepById(ctx: ProviderContext, sleepId: string): Promise<WhoopSleep> {
    return authedJson<WhoopSleep>(ctx, `${WHOOP_API_BASE}/v2/activity/sleep/${encodeURIComponent(sleepId)}`);
  }

  getWorkoutById(ctx: ProviderContext, workoutId: string): Promise<WhoopWorkout> {
    return authedJson<WhoopWorkout>(ctx, `${WHOOP_API_BASE}/v2/activity/workout/${encodeURIComponent(workoutId)}`);
  }

  /** Follows `next_token` pagination for a v2 collection endpoint. */
  async collect<T>(ctx: ProviderContext, path: string, startIso: string, endIso: string, maxPages = 40): Promise<T[]> {
    const out: T[] = [];
    let nextToken: string | null | undefined;
    for (let page = 0; page < maxPages; page++) {
      const url = new URL(`${WHOOP_API_BASE}${path}`);
      url.searchParams.set("limit", String(PAGE_LIMIT));
      url.searchParams.set("start", startIso);
      url.searchParams.set("end", endIso);
      if (nextToken) url.searchParams.set("nextToken", nextToken);
      const res = await authedJson<WhoopPage<T>>(ctx, url.toString());
      out.push(...(res.records ?? []));
      nextToken = res.next_token;
      if (!nextToken) return out;
    }
    throw new Error(`WHOOP pagination exceeded ${maxPages} pages for ${path}`);
  }

  async fetchRange(ctx: ProviderContext, startDate: string, endDate: string) {
    // Query one extra day on each side: records are attributed to local dates
    // (sleep end, cycle midpoint) that can differ from their UTC start.
    const startIso = `${addDays(startDate, -1)}T00:00:00.000Z`;
    const endIso = `${addDays(endDate, 2)}T00:00:00.000Z`;
    const [cycles, recoveries, sleeps, workouts] = [
      await this.collect<WhoopCycle>(ctx, "/v2/cycle", startIso, endIso),
      await this.collect<WhoopRecovery>(ctx, "/v2/recovery", startIso, endIso),
      await this.collect<WhoopSleep>(ctx, "/v2/activity/sleep", startIso, endIso),
      await this.collect<WhoopWorkout>(ctx, "/v2/activity/workout", startIso, endIso),
    ];
    return normalizeWhoop(
      { cycles, recoveries, sleeps, workouts },
      { userId: ctx.userId, timeZone: ctx.timeZone, syncedAt: new Date().toISOString(), range: { start: startDate, end: endDate } },
    );
  }
}

export function whoopFromEnv(): WhoopProvider | null {
  const { WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI } = process.env;
  if (!WHOOP_CLIENT_ID || !WHOOP_CLIENT_SECRET || !WHOOP_REDIRECT_URI) return null;
  return new WhoopProvider({ clientId: WHOOP_CLIENT_ID, clientSecret: WHOOP_CLIENT_SECRET, redirectUri: WHOOP_REDIRECT_URI });
}
