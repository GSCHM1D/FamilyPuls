import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";
import { isSameOrigin } from "@/lib/auth/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Signs out and instructs the browser to drop caches and storage for this origin. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  if (!publicEnv.demoMode) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  const res = NextResponse.redirect(new URL("/login", publicEnv.appUrl), 303);
  res.headers.set("Clear-Site-Data", '"cache", "storage"');
  return res;
}
