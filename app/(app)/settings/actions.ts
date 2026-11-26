"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { LOCALE_COOKIE, THEME_COOKIE } from "@/lib/auth/session";
import { displayNameSchema, emailSchema, generateInvitationToken, INVITATION_TTL_DAYS, passwordSchema } from "@/lib/auth/invitations";
import { isValidTimeZone } from "@/lib/normalization/time";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SHARING_CATEGORIES, type SharingCategory } from "@/types/health";

export interface ActionState {
  ok?: boolean;
  error?: string;
  inviteLink?: string;
}

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, secure: publicEnv.appUrl.startsWith("https://"), path: "/", maxAge: 60 * 60 * 24 * 365 };

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}

const prefsSchema = z.object({
  displayName: displayNameSchema,
  locale: z.enum(["de", "en"]),
  theme: z.enum(["dark", "light", "system"]),
  timezone: z.string().max(64).refine(isValidTimeZone),
});

export async function updateProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = prefsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };
  const store = await cookies();
  store.set(LOCALE_COOKIE, parsed.data.locale, COOKIE_OPTS);
  store.set(THEME_COOKIE, parsed.data.theme, COOKIE_OPTS);
  if (publicEnv.demoMode) {
    revalidatePath("/", "layout");
    return { ok: true };
  }
  const session = await currentUser();
  if (!session) return { error: "unauthorized" };
  const { error } = await session.supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, locale: parsed.data.locale, theme: parsed.data.theme, timezone: parsed.data.timezone })
    .eq("id", session.user.id);
  if (error) return { error: "failed" };
  revalidatePath("/", "layout");
  return { ok: true };
}

const AVATAR_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Validates type by magic bytes, not only by the client-supplied MIME type. */
function sniffImage(buf: Uint8Array): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  return null;
}

export async function uploadAvatarAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (publicEnv.demoMode) return { error: "demo" };
  const session = await currentUser();
  if (!session) return { error: "unauthorized" };
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024) return { error: "invalid" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type || !AVATAR_TYPES[type]) return { error: "invalid" };
  const path = `${session.user.id}/avatar-${Date.now()}.${AVATAR_TYPES[type]}`;
  const { error } = await session.supabase.storage.from("avatars").upload(path, bytes, { contentType: type, upsert: false, cacheControl: "3600" });
  if (error) return { error: "failed" };
  const { data: old } = await session.supabase.from("profiles").select("avatar_path").eq("id", session.user.id).maybeSingle();
  await session.supabase.from("profiles").update({ avatar_path: path }).eq("id", session.user.id);
  if (old?.avatar_path && old.avatar_path !== path) await session.supabase.storage.from("avatars").remove([old.avatar_path]);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (publicEnv.demoMode) return { error: "demo" };
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { error: "password" };
  const session = await currentUser();
  if (!session) return { error: "unauthorized" };
  const { error } = await session.supabase.auth.updateUser({ password: parsed.data });
  return error ? { error: "failed" } : { ok: true };
}

/**
 * Saves sharing toggles. Writes go through the user's own client, so RLS
 * guarantees users can only change their own preferences and grant only to
 * members of their own family.
 */
export async function saveSharingAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (publicEnv.demoMode) return { error: "demo" };
  const session = await currentUser();
  if (!session) return { error: "unauthorized" };
  const uid = session.user.id;
  const rows: { owner_id: string; category: SharingCategory; grantee_id: string | null; enabled: boolean }[] = [];
  for (const category of SHARING_CATEGORIES) {
    rows.push({ owner_id: uid, category, grantee_id: null, enabled: formData.get(`all:${category}`) === "on" });
  }
  for (const [key, value] of formData.entries()) {
    const m = /^member:([0-9a-f-]{36}):([a-z_]+)$/.exec(key);
    if (!m || !(SHARING_CATEGORIES as readonly string[]).includes(m[2]!)) continue;
    rows.push({ owner_id: uid, category: m[2] as SharingCategory, grantee_id: m[1]!, enabled: value === "on" });
  }
  const { error } = await session.supabase.from("sharing_preferences").upsert(rows, { onConflict: "owner_id,category,grantee_id" });
  if (error) return { error: "failed" };
  revalidatePath("/", "layout");
  return { ok: true };
}

async function requireAdmin() {
  const session = await currentUser();
  if (!session) return null;
  const { data } = await session.supabase.from("family_members").select("family_id, role").eq("user_id", session.user.id).maybeSingle();
  if (!data || data.role !== "admin") return null;
  return { ...session, familyId: data.family_id as string };
}

export async function createInvitationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (publicEnv.demoMode) return { error: "demo" };
  const admin = await requireAdmin();
  if (!admin) return { error: "forbidden" };
  const parsed = z.object({ email: emailSchema, role: z.enum(["admin", "member"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };
  const db = supabaseAdmin();
  const { data: limit } = await db.rpc("check_rate_limit", { p_key: `invite-create:${admin.user.id}`, p_max: 10, p_window_seconds: 3600 });
  if (limit !== true) return { error: "rate_limited" };
  // Revoke an older open invitation for the same address, then create a new one.
  await db.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("family_id", admin.familyId).eq("email", parsed.data.email).is("accepted_at", null).is("revoked_at", null);
  const { token, hash } = generateInvitationToken();
  const { error } = await db.from("invitations").insert({
    family_id: admin.familyId,
    email: parsed.data.email,
    role: parsed.data.role,
    token_hash: hash,
    invited_by: admin.user.id,
    expires_at: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000).toISOString(),
  });
  if (error) return { error: "failed" };
  revalidatePath("/settings");
  return { ok: true, inviteLink: `${publicEnv.appUrl}/invite/${token}` };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!admin || !id.success) return;
  await supabaseAdmin().from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id.data).eq("family_id", admin.familyId);
  revalidatePath("/settings");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse(formData.get("userId"));
  if (!admin || !id.success || id.data === admin.user.id) return;
  const db = supabaseAdmin();
  // Membership removal immediately ends all access in both directions (shares_family becomes false).
  await db.from("family_members").delete().eq("family_id", admin.familyId).eq("user_id", id.data);
  await db.from("sharing_preferences").delete().or(`grantee_id.eq.${id.data},and(owner_id.eq.${id.data},grantee_id.not.is.null)`);
  revalidatePath("/settings");
  revalidatePath("/family");
}
