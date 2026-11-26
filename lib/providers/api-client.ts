import { fetchWithRetry, ProviderHttpError, type RetryOptions } from "@/lib/http/fetch-with-retry";
import type { ProviderContext } from "./types";

/** Authenticated JSON request that transparently refreshes the token once on 401. */
export async function authedJson<T>(
  ctx: ProviderContext,
  url: string,
  init: RequestInit = {},
  retry: RetryOptions = {},
): Promise<T> {
  let token = await ctx.getAccessToken();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithRetry(
        url,
        { ...init, headers: { Accept: "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${token}` }, cache: "no-store" },
        retry,
      );
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 401 && attempt === 0) {
        token = await ctx.getAccessToken(token);
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}
