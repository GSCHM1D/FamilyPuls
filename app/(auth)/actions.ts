"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { emailSchema, passwordSchema } from "@/lib/auth/invitations";
import { safeNextPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

async function limited(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin().rpc("check_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    return data !== true;
  } catch {
    return false; // Supabase Auth has its own rate limits as a second line of defence
  }
}

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function signInAction(_: FormState, formData: FormData): Promise<FormState> {
  if (publicEnv.demoMode) redirect("/dashboard");
  const parsed = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };
  if (await limited(`login:${await ip()}`, 10, 600)) return { error: "rate_limited" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "invalid" };
  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function magicLinkAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "invalid" };
  if (await limited(`magic:${await ip()}`, 5, 900)) return { error: "rate_limited" };
  const supabase = await createSupabaseServerClient();
  // shouldCreateUser:false keeps registration invitation-only.
  await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: false, emailRedirectTo: `${publicEnv.appUrl}/api/auth/callback` } });
  return { ok: true }; // same answer whether the account exists or not
}

export async function forgotPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "invalid" };
  if (await limited(`reset:${await ip()}`, 5, 900)) return { error: "rate_limited" };
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${publicEnv.appUrl}/api/auth/callback?next=/reset-password` });
  return { ok: true };
}

export async function resetPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { error: "password" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "failed" };
  redirect("/dashboard");
}
