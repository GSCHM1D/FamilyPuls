import { sleep } from "@/lib/utils";
import { OAuthError, type TokenSet } from "./oauth";

export interface StoredCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
}

/** Persistence for decrypted credentials. The Supabase implementation encrypts at rest. */
export interface CredentialStore {
  load(connectionId: string): Promise<StoredCredentials | null>;
  save(connectionId: string, creds: StoredCredentials): Promise<void>;
  acquireRefreshLock(connectionId: string, leaseSeconds: number): Promise<boolean>;
  releaseRefreshLock(connectionId: string): Promise<void>;
  markReauthRequired(connectionId: string, reason: string): Promise<void>;
}

export class ReauthRequiredError extends Error {
  constructor(message = "Re-authorization required") {
    super(message);
    this.name = "ReauthRequiredError";
  }
}

export class TokenBusyError extends Error {
  constructor() {
    super("Token refresh in progress by another worker");
    this.name = "TokenBusyError";
  }
}

export interface TokenManagerOptions {
  /** Refresh this many seconds before expiry. */
  skewSeconds?: number;
  lockLeaseSeconds?: number;
  waitForOtherRefreshMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Hands out valid access tokens and refreshes them *on demand only*.
 * A database lease (acquireRefreshLock) guarantees that only one worker refreshes
 * a connection at a time – important for WHOOP, which rotates refresh tokens and
 * invalidates the old one on use.
 */
export class TokenManager {
  private readonly o: Required<TokenManagerOptions>;

  constructor(
    private readonly store: CredentialStore,
    private readonly refreshFn: (refreshToken: string) => Promise<TokenSet>,
    opts: TokenManagerOptions = {},
  ) {
    this.o = {
      skewSeconds: opts.skewSeconds ?? 120,
      lockLeaseSeconds: opts.lockLeaseSeconds ?? 30,
      waitForOtherRefreshMs: opts.waitForOtherRefreshMs ?? 10_000,
      pollIntervalMs: opts.pollIntervalMs ?? 500,
      now: opts.now ?? Date.now,
      sleepImpl: opts.sleepImpl ?? sleep,
    };
  }

  isFresh(creds: StoredCredentials): boolean {
    if (!creds.expiresAt) return true; // provider did not send expiry; rely on 401 handling
    return Date.parse(creds.expiresAt) - this.o.skewSeconds * 1000 > this.o.now();
  }

  /**
   * @param staleAccessToken pass the token that just got a 401 to force a refresh
   *        unless another worker already replaced it.
   */
  async getAccessToken(connectionId: string, staleAccessToken?: string): Promise<string> {
    const creds = await this.store.load(connectionId);
    if (!creds) throw new ReauthRequiredError("No credentials stored");
    const needsRefresh = staleAccessToken ? creds.accessToken === staleAccessToken : !this.isFresh(creds);
    if (!needsRefresh) return creds.accessToken;
    if (!creds.refreshToken) {
      await this.store.markReauthRequired(connectionId, "Access token expired and no refresh token available");
      throw new ReauthRequiredError();
    }

    const locked = await this.store.acquireRefreshLock(connectionId, this.o.lockLeaseSeconds);
    if (!locked) return this.waitForOtherWorker(connectionId, creds.accessToken);

    try {
      // Re-read inside the lock: another worker may have refreshed meanwhile.
      const current = (await this.store.load(connectionId)) ?? creds;
      if (current.accessToken !== creds.accessToken && this.isFresh(current)) return current.accessToken;
      if (!current.refreshToken) throw new ReauthRequiredError();

      let next: TokenSet;
      try {
        next = await this.refreshFn(current.refreshToken);
      } catch (err) {
        if (err instanceof OAuthError && (err.isInvalidGrant || err.status === 400 || err.status === 401)) {
          await this.store.markReauthRequired(connectionId, `Refresh rejected: ${err.code}`);
          throw new ReauthRequiredError();
        }
        throw err;
      }
      await this.store.save(connectionId, {
        accessToken: next.accessToken,
        // Rotating providers (WHOOP) return a new refresh token; others (Google) usually do not.
        refreshToken: next.refreshToken ?? current.refreshToken,
        expiresAt: next.expiresAt,
        scope: next.scope ?? current.scope,
      });
      return next.accessToken;
    } finally {
      await this.store.releaseRefreshLock(connectionId);
    }
  }

  private async waitForOtherWorker(connectionId: string, oldAccessToken: string): Promise<string> {
    const deadline = this.o.now() + this.o.waitForOtherRefreshMs;
    while (this.o.now() < deadline) {
      await this.o.sleepImpl(this.o.pollIntervalMs);
      const creds = await this.store.load(connectionId);
      if (creds && creds.accessToken !== oldAccessToken && this.isFresh(creds)) return creds.accessToken;
    }
    throw new TokenBusyError();
  }
}
