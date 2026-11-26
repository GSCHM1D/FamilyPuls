import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { buttonVariants } from "@/components/ui/button";
import { getDictionary, getRepository } from "@/lib/auth/session";
import { isDemoMode, publicEnv } from "@/lib/env";
import { magicLinkAction, signInAction } from "../actions";

export const metadata = { title: "Anmelden" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { t } = await getDictionary();
  const { next, error } = await searchParams;
  if (isDemoMode()) {
    return (
      <AuthShell title={t.appName} subtitle={t.common.demoBanner}>
        <Link href="/dashboard" className={buttonVariants({ size: "lg", className: "w-full" })}>{t.auth.demoLogin}</Link>
      </AuthShell>
    );
  }
  if (!publicEnv.supabaseUrl) {
    return (
      <AuthShell title={t.appName} subtitle="Server not configured: set NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_DEMO_MODE=true (see README).">
        <span />
      </AuthShell>
    );
  }
  if (await getRepository()) redirect("/dashboard");
  return (
    <AuthShell title={t.auth.loginTitle} subtitle={t.auth.loginSubtitle}>
      {error ? <p role="alert" className="mb-4 text-center text-sm text-red">{t.common.error}</p> : null}
      <LoginForm t={t} next={next} signIn={signInAction} magicLink={magicLinkAction} />
    </AuthShell>
  );
}
