"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { FormState } from "@/app/(auth)/actions";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function ErrorText({ state, t }: { state: FormState; t: Dictionary }) {
  if (!state.error) return null;
  const msg = state.error === "invalid" ? t.auth.invalidCredentials : state.error === "password" ? t.auth.passwordRules : state.error === "rate_limited" ? t.dashboard.syncRateLimited : t.common.error;
  return <p role="alert" className="text-sm text-red">{msg}</p>;
}

export function LoginForm({ t, next, signIn, magicLink }: { t: Dictionary; next?: string; signIn: Action; magicLink: Action }) {
  const [state, action, pending] = useActionState(signIn, {});
  const [mlState, mlAction, mlPending] = useActionState(magicLink, {});
  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">{t.auth.email}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">{t.auth.password}</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <ErrorText state={state} t={t} />
        <Button type="submit" size="lg" disabled={pending}>{t.auth.login}</Button>
        <Link href="/forgot-password" className="text-center text-sm text-muted-foreground hover:text-foreground">{t.auth.forgotPassword}</Link>
      </form>
      <form action={mlAction} className="flex flex-col gap-3 border-t border-border pt-6">
        <Label htmlFor="ml-email" className="sr-only">{t.auth.email}</Label>
        <Input id="ml-email" name="email" type="email" autoComplete="email" placeholder={t.auth.email} required />
        <Button type="submit" variant="secondary" disabled={mlPending}>{t.auth.magicLink}</Button>
        {mlState.ok ? <p role="status" className="text-sm text-green">{t.auth.magicLinkSent}</p> : null}
      </form>
      <p className="text-center text-xs text-muted-foreground">{t.auth.inviteOnly}</p>
    </div>
  );
}

export function EmailOnlyForm({ t, action: serverAction, submitLabel, successText }: { t: Dictionary; action: Action; submitLabel: string; successText: string }) {
  const [state, action, pending] = useActionState(serverAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <ErrorText state={state} t={t} />
      {state.ok ? <p role="status" className="text-sm text-green">{successText}</p> : null}
      <Button type="submit" size="lg" disabled={pending}>{submitLabel}</Button>
      <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">{t.common.back}</Link>
    </form>
  );
}

export function PasswordForm({ t, action: serverAction, submitLabel, extraFields }: { t: Dictionary; action: Action; submitLabel: string; extraFields?: React.ReactNode }) {
  const [state, action, pending] = useActionState(serverAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {extraFields}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t.auth.newPassword}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        <p className="text-xs text-muted-foreground">{t.auth.passwordRules}</p>
      </div>
      <ErrorText state={state} t={t} />
      <Button type="submit" size="lg" disabled={pending}>{submitLabel}</Button>
    </form>
  );
}
