import { createHash, randomBytes } from "node:crypto";
import { fetchWithRetry, ProviderHttpError, type RetryOptions } from "@/lib/http/fetch-with-retry";

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** ISO timestamp */
  expiresAt: string | null;
  scope: string | null;
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(`OAuth error: ${code}`);
    this.name = "OAuthError";
  }
  /** The grant is no longer valid – the user must authorize again. */
  get isInvalidGrant() {
    return this.code === "invalid_grant" || this.code === "invalid_token" || this.code === "unauthorized_client";
  }
}

export function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
}

/** POSTs an application/x-www-form-urlencoded token request (RFC 6749 §4.1.3 / §6). */
export async function requestToken(
  tokenUrl: string,
  params: Record<string, string>,
  opts: RetryOptions & { now?: () => number } = {},
): Promise<TokenSet> {
  const now = opts.now ?? Date.now;
  let res: Response;
  try {
    res = await fetchWithRetry(
      tokenUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams(params).toString(),
        cache: "no-store",
      },
      { maxRetries: 2, ...opts },
    );
  } catch (err) {
    if (err instanceof ProviderHttpError) {
      let code = "token_request_failed";
      try {
        code = (JSON.parse(err.body) as RawTokenResponse).error ?? code;
      } catch {
        /* non-JSON error body */
      }
      throw new OAuthError(code, err.status);
    }
    throw err;
  }
  const json = (await res.json()) as RawTokenResponse;
  if (!json.access_token) throw new OAuthError(json.error ?? "missing_access_token", res.status);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: typeof json.expires_in === "number" ? new Date(now() + json.expires_in * 1000).toISOString() : null,
    scope: json.scope ?? null,
  };
}
