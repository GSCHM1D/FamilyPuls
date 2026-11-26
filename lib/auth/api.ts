import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * CSRF protection for cookie-authenticated, state-changing requests:
 * the Origin (or Referer) must match our own origin. SameSite=Lax cookies
 * provide a second layer.
 */
export function isSameOrigin(request: Request): boolean {
  const allowed = new Set([new URL(publicEnv.appUrl).origin, new URL(request.url).origin]);
  const origin = request.headers.get("origin");
  if (origin) return allowed.has(origin);
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return allowed.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}

export type AuthResult = { ok: true; user: User; supabase: SupabaseClient } | { ok: false; response: NextResponse };

/** Verifies the session server-side (getUser validates the JWT with Supabase Auth). */
export async function requireUser(request?: Request, opts: { csrf?: boolean } = {}): Promise<AuthResult> {
  if (publicEnv.demoMode) return { ok: false, response: jsonError(403, "demo_mode") };
  if (request && opts.csrf !== false && request.method !== "GET" && !isSameOrigin(request)) {
    return { ok: false, response: jsonError(403, "invalid_origin") };
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, response: jsonError(401, "unauthorized") };
  return { ok: true, user: data.user, supabase };
}

/** DB-backed fixed-window rate limit (works across serverless instances). */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("check_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) return false; // fail closed
  return data === true;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
