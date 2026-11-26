"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { displayNameSchema, hashInvitationToken, invitationTokenSchema, isInvitationUsable, passwordSchema, type InvitationRecord } from "@/lib/auth/invitations";
import { publicEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logSafe } from "@/lib/security/redact";
import type { FormState } from "@/app/(auth)/actions";

const schema = z.object({ token: invitationTokenSchema, displayName: displayNameSchema, password: passwordSchema });

/** Registration is only possible with a valid, unexpired, unrevoked invitation token. */
export async function acceptInvitationAction(_: FormState, formData: FormData): Promise<FormState> {
  if (publicEnv.demoMode) return { error: "failed" };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues.some((i) => i.path[0] === "password") ? "password" : "failed" };
  const db = supabaseAdmin();
  const { data: limit } = await db.rpc("check_rate_limit", { p_key: `invite:${hashInvitationToken(parsed.data.token).slice(0, 16)}`, p_max: 5, p_window_seconds: 3600 });
  if (limit !== true) return { error: "rate_limited" };

  const { data: inv } = await db.from("invitations").select("id, family_id, email, role, expires_at, accepted_at, revoked_at").eq("token_hash", hashInvitationToken(parsed.data.token)).maybeSingle();
  if (!isInvitationUsable(inv as InvitationRecord | null)) return { error: "invite" };
  const invitation = inv as InvitationRecord;

  const { data: created, error } = await db.auth.admin.createUser({
    email: invitation.email,
    password: parsed.data.password,
    email_confirm: true, // the invitation link proves access to the address
    user_metadata: { display_name: parsed.data.displayName },
  });
  if (error || !created.user) {
    logSafe.warn("invite: createUser failed", { code: error?.code });
    return { error: error?.code === "email_exists" || error?.status === 422 ? "exists" : "failed" };
  }
  const userId = created.user.id;
  const { error: memberError } = await db.from("family_members").insert({ family_id: invitation.family_id, user_id: userId, role: invitation.role });
  if (memberError) {
    await db.auth.admin.deleteUser(userId);
    return { error: "failed" };
  }
  await db.from("profiles").update({ display_name: parsed.data.displayName }).eq("id", userId);
  await db.from("invitations").update({ accepted_at: new Date().toISOString(), accepted_by: userId }).eq("id", invitation.id).is("accepted_at", null);

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signInWithPassword({ email: invitation.email, password: parsed.data.password });
  redirect("/settings?welcome=1#sharing");
}
