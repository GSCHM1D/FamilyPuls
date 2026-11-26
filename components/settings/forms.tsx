"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { clearClientCaches } from "@/components/navigation/service-worker";
import type { ActionState } from "@/app/(app)/settings/actions";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { SHARING_CATEGORIES, type SharingCategory } from "@/types/health";

type Action = (s: ActionState, f: FormData) => Promise<ActionState>;

function Feedback({ state, t }: { state: ActionState; t: Dictionary }) {
  if (state.ok) return <p role="status" className="text-sm text-green">{t.common.saved}</p>;
  if (state.error === "demo") return <p role="status" className="text-sm text-violet">{t.common.demoBadge}: –</p>;
  if (state.error === "password") return <p role="alert" className="text-sm text-red">{t.auth.passwordRules}</p>;
  if (state.error) return <p role="alert" className="text-sm text-red">{t.common.error}</p>;
  return null;
}

const ZONES = ["Europe/Zurich", "Europe/Berlin", "Europe/Vienna", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney", "UTC"];

export function ProfileForm({ t, action: a, defaults }: { t: Dictionary; action: Action; defaults: { displayName: string; locale: string; theme: string; timezone: string } }) {
  const [state, action, pending] = useActionState(a, {});
  const zones = ZONES.includes(defaults.timezone) ? ZONES : [defaults.timezone, ...ZONES];
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="displayName">{t.auth.displayName}</Label>
        <Input id="displayName" name="displayName" defaultValue={defaults.displayName} maxLength={60} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="locale">{t.settings.language}</Label>
        <Select id="locale" name="locale" defaultValue={defaults.locale}>
          <option value="de">Deutsch (Schweiz)</option>
          <option value="en">English</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme">{t.settings.appearance}</Label>
        <Select id="theme" name="theme" defaultValue={defaults.theme}>
          <option value="dark">{t.settings.theme.dark}</option>
          <option value="light">{t.settings.theme.light}</option>
          <option value="system">{t.settings.theme.system}</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="timezone">{t.settings.timezone}</Label>
        <Select id="timezone" name="timezone" defaultValue={defaults.timezone}>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </Select>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>{t.common.save}</Button>
        <Feedback state={state} t={t} />
      </div>
    </form>
  );
}

export function AvatarForm({ t, action: a }: { t: Dictionary; action: Action }) {
  const [state, action, pending] = useActionState(a, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Label htmlFor="avatar" className="sr-only">{t.settings.changeAvatar}</Label>
      <input id="avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-foreground" />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>{t.settings.changeAvatar}</Button>
      <Feedback state={state} t={t} />
    </form>
  );
}

export function PasswordChangeForm({ t, action: a }: { t: Dictionary; action: Action }) {
  const [state, action, pending] = useActionState(a, {});
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="new-password">{t.auth.newPassword}</Label>
        <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>{t.settings.changePassword}</Button>
      <Feedback state={state} t={t} />
    </form>
  );
}

export function SharingForm({
  t,
  action: a,
  initial,
  members,
}: {
  t: Dictionary;
  action: Action;
  initial: { all: SharingCategory[]; perMember: Record<string, SharingCategory[]> };
  members: { userId: string; displayName: string }[];
}) {
  const [state, action, pending] = useActionState(a, {});
  const [all, setAll] = useState(new Set(initial.all));
  const [per, setPer] = useState<Record<string, Set<SharingCategory>>>(Object.fromEntries(members.map((m) => [m.userId, new Set(initial.perMember[m.userId] ?? [])])));
  const toggle = (set: Set<SharingCategory>, c: SharingCategory) => {
    const next = new Set(set);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    return next;
  };
  return (
    <form action={action} className="flex flex-col gap-5" data-testid="sharing-form">
      <fieldset className="flex flex-col divide-y divide-border/60">
        <legend className="mb-2 text-sm font-medium">{t.settings.sharingAllMembers}</legend>
        {SHARING_CATEGORIES.map((c) => (
          <div key={c} className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm">{t.settings.categories[c]}</span>
            <Switch name={`all:${c}`} checked={all.has(c)} onCheckedChange={() => setAll(toggle(all, c))} label={t.settings.categories[c]} />
          </div>
        ))}
      </fieldset>
      {members.length ? (
        <details className="rounded-2xl bg-muted/40 p-3">
          <summary className="cursor-pointer text-sm font-medium">{t.settings.sharingPerMember}</summary>
          {members.map((m) => (
            <fieldset key={m.userId} className="mt-3 flex flex-col gap-2">
              <legend className="text-sm text-muted-foreground">{m.displayName}</legend>
              <div className="flex flex-wrap gap-2">
                {SHARING_CATEGORIES.map((c) => (
                  <label key={c} className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs">
                    <input type="checkbox" className="accent-[var(--primary)]" checked={all.has(c) || per[m.userId]!.has(c)} disabled={all.has(c)} onChange={() => setPer({ ...per, [m.userId]: toggle(per[m.userId]!, c) })} />
                    {t.settings.categories[c].replace(/ teilen$| *Share /i, "")}
                    <input type="hidden" name={`member:${m.userId}:${c}`} value={per[m.userId]!.has(c) ? "on" : "off"} />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </details>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{t.common.save}</Button>
        <Feedback state={state} t={t} />
      </div>
    </form>
  );
}

export function InviteCreateForm({ t, action: a }: { t: Dictionary; action: Action }) {
  const [state, action, pending] = useActionState(a, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-email">{t.settings.inviteEmail}</Label>
          <Input id="invite-email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">{t.settings.inviteRole}</Label>
          <Select id="invite-role" name="role" defaultValue="member">
            <option value="member">{t.profile.member}</option>
            <option value="admin">{t.profile.admin}</option>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>{t.settings.inviteCreate}</Button>
      </div>
      {state.inviteLink ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-green/10 p-3 text-sm">
          <span>{t.settings.inviteLink}</span>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-2 py-1 text-xs">{state.inviteLink}</code>
            <Button size="icon" variant="ghost" aria-label="Copy" onClick={() => navigator.clipboard.writeText(state.inviteLink!)}><Copy /></Button>
          </div>
        </div>
      ) : state.error ? <Feedback state={state} t={t} /> : null}
    </form>
  );
}

export function TrackerButtons({ provider, connected, t, demo }: { provider: "whoop" | "google_health"; connected: boolean; t: Dictionary; demo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const base = provider === "whoop" ? "whoop" : "google-health";
  if (demo) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/${base}/connect`} className="inline-flex h-9 items-center rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground">
        {connected ? t.settings.reconnect : provider === "whoop" ? t.settings.connectWhoop : t.settings.connectGoogle}
      </a>
      {connected ? (
        <>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => {
            const res = await fetch("/api/sync/backfill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, days: 365 }) });
            setMsg(res.ok ? t.settings.backfillQueued : res.status === 429 ? t.dashboard.syncRateLimited : t.common.error);
          })}>{t.settings.backfill}</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => {
            if (!window.confirm(t.settings.disconnectConfirm)) return;
            const deleteData = window.confirm(`${t.common.delete}: ${t.settings.trackers} – Daten ebenfalls löschen? / Also delete synced data?`);
            start(async () => {
              await fetch(`/api/${base}/disconnect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleteData }) });
              router.refresh();
            });
          }}>{t.settings.disconnect}</Button>
        </>
      ) : null}
      {msg ? <span role="status" className="text-xs text-muted-foreground">{msg}</span> : null}
    </div>
  );
}

export function LogoutButton({ label }: { label: string }) {
  return (
    <form action="/api/auth/logout" method="post" onSubmit={() => void clearClientCaches()}>
      <Button type="submit" variant="outline"><LogOut /> {label}</Button>
    </form>
  );
}

export function DeleteAccount({ t, demo }: { t: Dictionary; demo: boolean }) {
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t.settings.deleteAccountWarning}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input aria-label={t.settings.deleteConfirmWord} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t.settings.deleteConfirmWord} />
        <Button variant="destructive" disabled={demo || pending || confirm !== t.settings.deleteConfirmWord} onClick={() => start(async () => {
          const res = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
          if (!res.ok) return setError(true);
          await clearClientCaches();
          // full reload on purpose: drops all in-memory client state after account deletion
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/login";
        })}><Trash2 /> {t.settings.deleteAccount}</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-red">{t.common.error}</p> : null}
    </div>
  );
}
