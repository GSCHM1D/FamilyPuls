"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { FormState } from "@/app/(auth)/actions";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export function InviteForm({ t, token, email, action: serverAction }: { t: Dictionary; token: string; email: string; action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const [state, action, pending] = useActionState(serverAction, {});
  const error =
    state.error === "password" ? t.auth.passwordRules : state.error === "invite" ? t.auth.inviteInvalid : state.error === "exists" ? t.auth.inviteOnly : state.error ? t.common.error : null;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input id="email" value={email} readOnly disabled />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">{t.auth.displayName}</Label>
        <Input id="displayName" name="displayName" autoComplete="nickname" maxLength={60} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t.auth.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        <p className="text-xs text-muted-foreground">{t.auth.passwordRules}</p>
      </div>
      {error ? <p role="alert" className="text-sm text-red">{error}</p> : null}
      <Button type="submit" size="lg" disabled={pending}>{t.auth.createAccount}</Button>
    </form>
  );
}
