import type { NormalizedBatch, ProviderId } from "@/types/health";
import type { TokenSet } from "./oauth";

export interface HealthProfile {
  externalUserId: string;
  displayName: string | null;
  email: string | null;
}

/** Runtime context for API calls on behalf of one connection. */
export interface ProviderContext {
  connectionId: string;
  userId: string;
  /** IANA timezone used as fallback when the provider gives no offset. */
  timeZone: string;
  /** Returns a valid access token; pass the stale token after a 401 to force a refresh. */
  getAccessToken(staleToken?: string): Promise<string>;
}

/**
 * Common interface of all tracker integrations. Adapted to the real APIs:
 * both WHOOP and Google Health are best queried by time range, so the core
 * method is `fetchRange`, which returns normalized daily metrics, sleep
 * sessions and workouts for [startDate, endDate] (inclusive local dates).
 */
export interface HealthProvider {
  readonly id: ProviderId;
  readonly scopes: readonly string[];
  buildAuthorizationUrl(params: { state: string; codeChallenge: string }): string;
  exchangeCode(params: { code: string; codeVerifier: string }): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  /** Revokes our access at the provider (best effort, used on disconnect/account deletion). */
  revoke(tokens: { accessToken: string; refreshToken: string | null }): Promise<void>;
  getProfile(ctx: ProviderContext): Promise<HealthProfile>;
  fetchRange(ctx: ProviderContext, startDate: string, endDate: string): Promise<NormalizedBatch>;
  /** Maximum days per fetchRange call (keeps serverless invocations short). */
  readonly maxRangeDays: number;
}
