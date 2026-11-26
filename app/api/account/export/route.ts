import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

/** Data portability: exports everything stored about the signed-in user (never tokens). */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  const own = (table: string, cols = "*", key = "user_id") => supabase.from(table).select(cols).eq(key, user.id).limit(100_000);
  const [profile, membership, connections, daily, sleep, stages, workouts, measurements, sharing, logs] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    own("family_members"),
    own("provider_connections", "id, provider, status, granted_scopes, last_synced_at, created_at"),
    own("daily_metrics"),
    own("sleep_sessions"),
    own("sleep_stages"),
    own("workouts"),
    own("health_measurements"),
    own("sharing_preferences", "*", "owner_id"),
    own("sync_logs"),
  ]);
  const body = {
    exportedAt: new Date().toISOString(),
    user: { id: user.id, email: user.email },
    profile: profile.data,
    familyMembership: membership.data,
    trackerConnections: connections.data,
    dailyMetrics: daily.data,
    sleepSessions: sleep.data,
    sleepStages: stages.data,
    workouts: workouts.data,
    healthMeasurements: measurements.data,
    sharingPreferences: sharing.data,
    syncLogs: logs.data,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="familypulse-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
