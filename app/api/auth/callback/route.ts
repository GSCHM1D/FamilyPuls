import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const OTP_TYPES: EmailOtpType[] = ["magiclink", "recovery", "email", "invite", "email_change"];

/** Handles Supabase email links (magic link, password recovery). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createSupabaseServerClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  let next = safeNextPath(url.searchParams.get("next"));

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
    if (type === "recovery") next = "/reset-password";
  }
  return NextResponse.redirect(new URL(ok ? next : "/login?error=link_invalid", publicEnv.appUrl));
}
