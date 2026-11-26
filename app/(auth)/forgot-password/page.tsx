import { AuthShell } from "@/components/auth/auth-shell";
import { EmailOnlyForm } from "@/components/auth/forms";
import { getDictionary } from "@/lib/auth/session";
import { forgotPasswordAction } from "../actions";

export const metadata = { title: "Passwort zurücksetzen" };

export default async function ForgotPasswordPage() {
  const { t } = await getDictionary();
  return (
    <AuthShell title={t.auth.resetTitle}>
      <EmailOnlyForm t={t} action={forgotPasswordAction} submitLabel={t.auth.resetSend} successText={t.auth.resetSent} />
    </AuthShell>
  );
}
