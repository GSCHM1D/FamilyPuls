import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordForm } from "@/components/auth/forms";
import { requirePageContext } from "@/lib/auth/session";
import { resetPasswordAction } from "../actions";

export const metadata = { title: "Neues Passwort" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const { t } = await requirePageContext();
  return (
    <AuthShell title={t.auth.setPassword}>
      <PasswordForm t={t} action={resetPasswordAction} submitLabel={t.auth.setPassword} />
    </AuthShell>
  );
}
