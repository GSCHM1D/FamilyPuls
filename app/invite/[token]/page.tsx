import { AuthShell } from "@/components/auth/auth-shell";
import { InviteForm } from "@/components/auth/invite-form";
import { getDictionary } from "@/lib/auth/session";
import { hashInvitationToken, invitationTokenSchema, isInvitationUsable, type InvitationRecord } from "@/lib/auth/invitations";
import { isDemoMode } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { acceptInvitationAction } from "../actions";

export const metadata = { title: "Einladung" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { t } = await getDictionary();
  const { token } = await params;
  const parsed = invitationTokenSchema.safeParse(token);
  let invitation: InvitationRecord | null = null;
  if (parsed.success && !isDemoMode()) {
    const { data } = await supabaseAdmin().from("invitations").select("id, family_id, email, role, expires_at, accepted_at, revoked_at").eq("token_hash", hashInvitationToken(parsed.data)).maybeSingle();
    invitation = data as InvitationRecord | null;
  }
  if (!isInvitationUsable(invitation)) {
    return <AuthShell title={t.auth.acceptInviteTitle} subtitle={t.auth.inviteInvalid}><span /></AuthShell>;
  }
  return (
    <AuthShell title={t.auth.acceptInviteTitle} subtitle={t.auth.acceptInviteSubtitle}>
      <InviteForm t={t} token={token} email={invitation.email} action={acceptInvitationAction} />
    </AuthShell>
  );
}
