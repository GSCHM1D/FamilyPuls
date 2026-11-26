import { Download, ShieldCheck, Smartphone } from "lucide-react";
import { SyncStatus } from "@/components/dashboard/sync-status";
import { AvatarForm, DeleteAccount, InviteCreateForm, LogoutButton, PasswordChangeForm, ProfileForm, SharingForm, TrackerButtons } from "@/components/settings/forms";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/session";
import { googleHealthConfigured, whoopConfigured } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { PROVIDER_LABEL } from "@/lib/metrics/catalog";
import type { ProviderId, SharingCategory } from "@/types/health";
import {
  changePasswordAction,
  createInvitationAction,
  removeMemberAction,
  revokeInvitationAction,
  saveSharingAction,
  updateProfileAction,
  uploadAvatarAction,
} from "./actions";

export const metadata = { title: "Einstellungen" };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <h2 id={`${id}-title`} className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      <Card className="flex flex-col gap-4">{children}</Card>
    </section>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string; partial?: string; welcome?: string }> }) {
  const { repo, viewer, t, locale } = await requirePageContext();
  const sp = await searchParams;
  const [connections, prefs, members, invitations, logs] = await Promise.all([repo.connections(), repo.sharingPreferences(), repo.members(), repo.invitations(), repo.syncLogs(8)]);
  const others = members.filter((m) => !m.isSelf);
  const perMember: Record<string, SharingCategory[]> = {};
  for (const p of prefs) if (p.granteeId && p.enabled) (perMember[p.granteeId] ??= []).push(p.category);
  const providers: { id: ProviderId; configured: boolean }[] = [
    { id: "whoop", configured: viewer.isDemo || whoopConfigured() },
    { id: "google_health", configured: viewer.isDemo || googleHealthConfigured() },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">{t.settings.title}</h1>
        {sp.connected ? <p role="status" className="mt-2 text-sm text-green">{PROVIDER_LABEL[sp.connected as ProviderId] ?? ""} ✓{sp.partial ? ` – ${t.common.limitedComparability}` : ""}</p> : null}
        {sp.error ? <p role="alert" className="mt-2 text-sm text-red">{t.common.error} ({sp.error.replace(/[^a-z_]/g, "")})</p> : null}
      </header>

      <Section id="profile" title={t.settings.profile}>
        <div className="flex items-center gap-4">
          <Avatar name={viewer.displayName} url={viewer.avatarUrl} size={64} />
          <AvatarForm t={t} action={uploadAvatarAction} />
        </div>
        <ProfileForm t={t} action={updateProfileAction} defaults={{ displayName: viewer.displayName, locale: viewer.locale, theme: viewer.theme, timezone: viewer.timezone }} />
        <PasswordChangeForm t={t} action={changePasswordAction} />
      </Section>

      <Section id="trackers" title={t.settings.trackers}>
        {providers.map(({ id, configured }) => {
          const conn = connections.find((c) => c.provider === id);
          return (
            <div key={id} className="flex flex-col gap-2 border-b border-border/60 pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{PROVIDER_LABEL[id]}</span>
                {conn ? <SyncStatus status={conn.status} lastSyncedAt={conn.lastSyncedAt} t={t} locale={locale} timeZone={viewer.timezone} /> : <Badge>{t.common.notConnected}</Badge>}
              </div>
              {conn?.missingScopes.length ? <p className="text-xs text-amber">{t.common.limitedComparability}: {conn.missingScopes.map((s) => s.split(".").slice(-2).join(".")).join(", ")}</p> : null}
              {conn?.lastError && conn.status !== "active" ? <p className="text-xs text-muted-foreground">{conn.lastError}</p> : null}
              {configured ? <TrackerButtons provider={id} connected={!!conn} t={t} demo={viewer.isDemo} /> : <p className="text-xs text-muted-foreground">{t.settings.providerNotConfigured}</p>}
            </div>
          );
        })}
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">{t.settings.syncStatus}</summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            {logs.map((l) => (
              <li key={l.id} className={l.level === "error" ? "text-red" : l.level === "warn" ? "text-amber" : ""}>
                {formatDateTime(l.createdAt, locale, viewer.timezone)} · {l.message}{l.records !== null ? ` (${l.records})` : ""}
              </li>
            ))}
          </ul>
        </details>
      </Section>

      <Section id="sharing" title={t.settings.sharing}>
        <p className="flex items-start gap-2 rounded-2xl bg-blue/10 p-3 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue" /> {t.settings.sharingDisclosure}</p>
        <p className="text-sm text-muted-foreground">{t.settings.sharingIntro}</p>
        <SharingForm
          t={t}
          action={saveSharingAction}
          initial={{ all: prefs.filter((p) => !p.granteeId && p.enabled).map((p) => p.category), perMember }}
          members={others.map((m) => ({ userId: m.userId, displayName: m.displayName }))}
        />
      </Section>

      {viewer.role === "admin" ? (
        <Section id="family-admin" title={t.settings.familyAdmin}>
          <h3 className="text-sm font-medium">{t.settings.invite}</h3>
          <InviteCreateForm t={t} action={createInvitationAction} />
          {invitations.length ? (
            <div>
              <h3 className="mb-2 text-sm font-medium">{t.settings.pendingInvites}</h3>
              <ul className="flex flex-col gap-2">
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{i.email} <span className="text-xs text-muted-foreground">· {formatDate(i.expiresAt.slice(0, 10), locale)}</span></span>
                    <form action={revokeInvitationAction}><input type="hidden" name="id" value={i.id} /><Button type="submit" size="sm" variant="ghost">{t.settings.revoke}</Button></form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="flex flex-col gap-2">
            {others.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2"><Avatar name={m.displayName} url={m.avatarUrl} size={28} /> {m.displayName} <Badge>{m.role === "admin" ? t.profile.admin : t.profile.member}</Badge></span>
                {!viewer.isDemo ? (
                  <form action={removeMemberAction}><input type="hidden" name="userId" value={m.userId} /><Button type="submit" size="sm" variant="ghost">{t.settings.removeMember}</Button></form>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section id="install" title={t.settings.install}>
        <p className="flex items-start gap-2 text-sm"><Smartphone className="mt-0.5 size-4 shrink-0" /> {t.settings.installIos}</p>
        <p className="flex items-start gap-2 text-sm"><Smartphone className="mt-0.5 size-4 shrink-0" /> {t.settings.installAndroid}</p>
      </Section>

      <Section id="data" title={t.settings.privacy}>
        <a href="/api/account/export" className="inline-flex w-fit items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm hover:bg-muted"><Download className="size-4" /> {t.settings.export}</a>
        <LogoutButton label={t.auth.logout} />
        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-sm font-semibold text-red">{t.settings.deleteAccount}</h3>
          <DeleteAccount t={t} demo={viewer.isDemo} />
        </div>
      </Section>
    </div>
  );
}
