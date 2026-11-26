import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireUser } from "@/lib/auth/api";
import { revokeConnection } from "@/lib/providers/oauth-routes";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ProviderId } from "@/types/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Full account deletion: revokes provider access, removes avatars, hands over
 * the admin role if needed and deletes the auth user – all health data is
 * removed via ON DELETE CASCADE.
 */
export async function DELETE(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const body = z.object({ confirm: z.literal("DELETE") }).safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "confirmation_required");
  const db = supabaseAdmin();
  const userId = auth.user.id;

  const { data: conns } = await db.from("provider_connections").select("id, provider").eq("user_id", userId);
  for (const c of conns ?? []) await revokeConnection(c.id, c.provider as ProviderId);

  const { data: files } = await db.storage.from("avatars").list(userId);
  if (files?.length) await db.storage.from("avatars").remove(files.map((f) => `${userId}/${f.name}`));

  await db.rpc("ensure_admin_succession", { p_user: userId });
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return jsonError(500, "delete_failed");

  await auth.supabase.auth.signOut().catch(() => undefined);
  const res = NextResponse.json({ ok: true });
  res.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
  return res;
}
