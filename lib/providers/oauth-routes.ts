import "server-only";
import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { createOAuthState, OAUTH_STATE_TTL_SECONDS, oauthCookieName, verifyOAuthState } from "@/lib/auth/oauth-state";
import { jsonError, rateLimit, requireUser } from "@/lib/auth/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SupabaseCredentialStore } from "@/lib/sync/credential-store";
import { enqueueInitialImport, processDueJobs } from "@/lib/sync/queue";
import { logSafe } from "@/lib/security/redact";
import { DEFAULT_TIMEZONE } from "@/lib/normalization/time";
import type { ProviderId } from "@/types/health";
import { grantedScopes, missingScopes, GOOGLE_HEALTH_SCOPES } from "./google-health/provider";
import { ProviderHttpError } from "@/lib/http/fetch-with-retry";
import { OAuthError } from "./oauth";
import { getProvider } from "./registry";
import { TokenManager } from "./token-manager";
import type { ProviderContext } from "./types";

const settingsUrl = (params: Record<string, string>) => {
  const url = new URL("/settings", publicEnv.appUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.hash = "trackers";
  return url;
};

/** GET /api/<provider>/connect – starts the OAuth authorization code flow. */
export async function handleConnect(request: Request, providerId: ProviderId) {
  const auth = await requireUser(request, { csrf: false });
  if (!auth.ok) return auth.response.status === 401 ? NextResponse.redirect(new URL("/login", publicEnv.appUrl)) : auth.response;
  const provider = getProvider(providerId);
  if (!provider) return NextResponse.redirect(settingsUrl({ error: "provider_not_configured" }));
  if (!(await rateLimit(`oauth:${auth.user.id}`, 10, 600))) return NextResponse.redirect(settingsUrl({ error: "rate_limited" }));

  const { state, challenge, cookie } = createOAuthState(auth.user.id, providerId);
  const store = await cookies();
  store.set(oauthCookieName(providerId), cookie, {
    httpOnly: true,
    secure: publicEnv.appUrl.startsWith("https://"),
    sameSite: "lax", // must survive the top-level redirect back from the provider
    path: `/api/${providerId === "whoop" ? "whoop" : "google-health"}`,
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return NextResponse.redirect(provider.buildAuthorizationUrl({ state, codeChallenge: challenge }));
}

/** GET /api/<provider>/callback – exchanges the code, stores encrypted tokens, schedules the initial import. */
export async function handleCallback(request: Request, providerId: ProviderId) {
  const auth = await requireUser(request, { csrf: false });
  if (!auth.ok) return NextResponse.redirect(new URL("/login", publicEnv.appUrl));
  const url = new URL(request.url);
  const store = await cookies();
  const cookieName = oauthCookieName(providerId);
  const cookieValue = store.get(cookieName)?.value;
  store.delete({ name: cookieName, path: `/api/${providerId === "whoop" ? "whoop" : "google-health"}` });

  if (url.searchParams.get("error")) return NextResponse.redirect(settingsUrl({ error: "access_denied" }));
  const check = verifyOAuthState({ cookie: cookieValue, state: url.searchParams.get("state"), userId: auth.user.id, provider: providerId });
  if (!check.ok) return NextResponse.redirect(settingsUrl({ error: `state_${check.reason}` }));
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) return NextResponse.redirect(settingsUrl({ error: "missing_code" }));

  const provider = getProvider(providerId);
  if (!provider) return NextResponse.redirect(settingsUrl({ error: "provider_not_configured" }));

  const db = supabaseAdmin();
  // Which step failed is reported back (no secrets) to make setup problems diagnosable.
  let stage = "token";
  try {
    const tokens = await provider.exchangeCode({ code, codeVerifier: check.verifier });
    stage = "profile";
    const scopes = providerId === "google_health" ? grantedScopes(tokens.scope) : grantedScopes(tokens.scope ?? provider.scopes.join(" "));
    const missing = providerId === "google_health" ? missingScopes(tokens.scope) : [];
    if (providerId === "google_health" && missing.length === GOOGLE_HEALTH_SCOPES.length) {
      return NextResponse.redirect(settingsUrl({ error: "no_scopes_granted" }));
    }

    const tempCtx: ProviderContext = { connectionId: "pending", userId: auth.user.id, timeZone: DEFAULT_TIMEZONE, getAccessToken: async () => tokens.accessToken };
    let profile;
    try {
      // Google: GET /v4/users/me/identity proves the account is linked to Google Health.
      profile = await provider.getProfile(tempCtx);
    } catch (err) {
      logSafe.warn(`${providerId} profile/identity check failed`, err);
      await provider.revoke({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }).catch(() => undefined);
      return NextResponse.redirect(settingsUrl({ error: providerId === "google_health" ? "google_health_not_linked" : "profile_failed" }));
    }

    stage = "db";
    // A tracker account may only be linked to one FamilyPulse user.
    const { data: other } = await db.from("provider_connections").select("user_id").eq("provider", providerId).eq("external_user_id", profile.externalUserId).neq("user_id", auth.user.id).maybeSingle();
    if (other) {
      await provider.revoke({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }).catch(() => undefined);
      return NextResponse.redirect(settingsUrl({ error: "account_already_linked" }));
    }

    const { data: conn, error } = await db
      .from("provider_connections")
      .upsert(
        { user_id: auth.user.id, provider: providerId, external_user_id: profile.externalUserId, status: "active", granted_scopes: scopes, missing_scopes: missing, last_error: null },
        { onConflict: "user_id,provider" },
      )
      .select("id")
      .single();
    if (error || !conn) throw new Error(`connection upsert failed: ${error?.code}`);

    stage = "credentials";
    await new SupabaseCredentialStore(db).save(conn.id, { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, scope: tokens.scope });

    stage = "queue";
    const { data: profileRow } = await db.from("profiles").select("timezone").eq("id", auth.user.id).maybeSingle();
    await enqueueInitialImport(conn.id, auth.user.id, profileRow?.timezone ?? DEFAULT_TIMEZONE);
    // Run the import after the response so onboarding is not blocked.
    after(() => processDueJobs({ limit: 3, timeBudgetMs: 50_000 }).catch((e) => logSafe.error("background import failed", e)));

    return NextResponse.redirect(settingsUrl({ connected: providerId, ...(missing.length ? { partial: "1" } : {}) }));
  } catch (err) {
    logSafe.error(`${providerId} oauth callback failed at ${stage}`, err);
    const dbCode = err instanceof Error ? /failed: ([A-Z0-9]{3,8})/.exec(err.message)?.[1] : undefined;
    const detail = err instanceof OAuthError ? `_${err.code}_${err.status}` : err instanceof ProviderHttpError ? `_http_${err.status}` : dbCode ? `_${dbCode}` : "";
    return NextResponse.redirect(settingsUrl({ error: `connect_failed_${stage}${detail}`.replace(/[^a-z0-9_]/gi, "_").slice(0, 80) }));
  }
}

/** POST /api/<provider>/disconnect – revokes at the provider, deletes tokens, optionally deletes data. */
export async function handleDisconnect(request: Request, providerId: ProviderId) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { deleteData?: unknown };
  const deleteData = body.deleteData === true;
  const db = supabaseAdmin();
  const { data: conn } = await db.from("provider_connections").select("id").eq("user_id", auth.user.id).eq("provider", providerId).maybeSingle();
  if (!conn) return jsonError(404, "not_connected");

  await revokeConnection(conn.id, providerId);
  await db.from("sync_jobs").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("connection_id", conn.id).in("status", ["queued", "running"]);
  await db.from("provider_connections").update({ status: "disconnected", external_user_id: null, last_error: null }).eq("id", conn.id);
  if (deleteData) {
    for (const table of ["daily_metrics", "sleep_sessions", "workouts", "health_measurements"]) {
      await db.from(table).delete().eq("user_id", auth.user.id).eq("source", providerId);
    }
  }
  return NextResponse.json({ ok: true });
}

/** Best-effort revocation at the provider + deletion of stored tokens. */
export async function revokeConnection(connectionId: string, providerId: ProviderId) {
  const db = supabaseAdmin();
  const credentials = new SupabaseCredentialStore(db);
  const provider = getProvider(providerId);
  try {
    const creds = await credentials.load(connectionId);
    if (creds && provider) {
      // WHOOP revokes via an authenticated call, so make sure the access token is still valid.
      const accessToken = await new TokenManager(credentials, (rt) => provider.refresh(rt)).getAccessToken(connectionId).catch(() => creds.accessToken);
      const latest = (await credentials.load(connectionId)) ?? creds;
      await provider.revoke({ accessToken, refreshToken: latest.refreshToken });
    }
  } catch (err) {
    logSafe.warn(`${providerId} revoke failed (continuing)`, err);
  }
  await credentials.delete(connectionId);
}
