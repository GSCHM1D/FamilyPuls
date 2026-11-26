import { sleep } from "@/lib/utils";

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
  get isUnauthorized() {
    return this.status === 401;
  }
}

/** Thrown when the provider asks us to wait longer than we are willing to block. */
export class RateLimitedError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Rate limited – retry after ${Math.round(retryAfterMs / 1000)}s`);
    this.name = "RateLimitedError";
  }
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** If a provider asks to wait longer than this, give up and let the job be rescheduled. */
  maxBlockingWaitMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  random?: () => number;
  timeoutMs?: number;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/** Parses Retry-After (seconds or HTTP date) and WHOOP's X-RateLimit-Reset (seconds). */
export function retryAfterFromHeaders(headers: Headers, now = Date.now()): number | null {
  const ra = headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const date = Date.parse(ra);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }
  const reset = headers.get("x-ratelimit-reset");
  if (reset && Number.isFinite(Number(reset))) return Math.max(0, Number(reset) * 1000);
  return null;
}

export function backoffDelay(attempt: number, base: number, max: number, random: () => number): number {
  const exp = base * 2 ** attempt;
  return Math.min(max, exp + Math.floor(random() * base));
}

/**
 * fetch() with exponential backoff + jitter for transient errors and rate
 * limits. Non-retryable errors are thrown as ProviderHttpError. Response bodies
 * are truncated in errors and must never contain tokens (we never log requests).
 */
export async function fetchWithRetry(url: string, init: RequestInit = {}, opts: RetryOptions = {}): Promise<Response> {
  const {
    maxRetries = 4,
    baseDelayMs = 500,
    maxDelayMs = 20_000,
    maxBlockingWaitMs = 30_000,
    fetchImpl = fetch,
    sleepImpl = sleep,
    random = Math.random,
    timeoutMs = 20_000,
  } = opts;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      await sleepImpl(backoffDelay(attempt, baseDelayMs, maxDelayMs, random));
      continue;
    }

    if (res.ok) return res;

    const body = (await res.text().catch(() => "")).slice(0, 500);
    const retryAfter = retryAfterFromHeaders(res.headers);

    if (!RETRYABLE.has(res.status)) {
      throw new ProviderHttpError(`HTTP ${res.status}`, res.status, body, retryAfter);
    }
    if (res.status === 429 && retryAfter !== null && retryAfter > maxBlockingWaitMs) {
      throw new RateLimitedError(retryAfter);
    }
    lastError = new ProviderHttpError(`HTTP ${res.status}`, res.status, body, retryAfter);
    if (attempt === maxRetries) break;
    const delay = retryAfter !== null ? Math.min(retryAfter + 250, maxBlockingWaitMs) : backoffDelay(attempt, baseDelayMs, maxDelayMs, random);
    await sleepImpl(delay);
  }
  if (lastError instanceof ProviderHttpError && lastError.status === 429) {
    throw new RateLimitedError(lastError.retryAfterMs ?? 60_000);
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}
