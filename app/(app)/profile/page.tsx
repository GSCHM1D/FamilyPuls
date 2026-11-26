import Link from "next/link";
import { SyncStatus } from "@/components/dashboard/sync-status";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/session";
import { formatDate } from "@/lib/i18n/format";
import { PROVIDER_LABEL } from "@/lib/metrics/catalog";

export const metadata = { title: "Mein Profil" };

export default async function ProfilePage() {
  const { repo, viewer, t, locale } = await requirePageContext();
  const [connections, visible] = await Promise.all([repo.connections(), repo.sharingPreferences()]);
  const shared = visible.filter((p) => p.enabled && !p.granteeId).map((p) => p.category);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">{t.profile.title}</h1>
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <Avatar name={viewer.displayName} url={viewer.avatarUrl} size={88} />
        <div>
          <p className="text-xl font-semibold">{viewer.displayName}</p>
          <p className="text-sm text-muted-foreground">{viewer.email}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Badge variant="violet">{viewer.role === "admin" ? t.profile.admin : t.profile.member}</Badge>
          {viewer.familyName ? <Badge>{viewer.familyName}</Badge> : null}
          {viewer.isDemo ? <Badge variant="amber">{t.common.demoBadge}</Badge> : null}
        </div>
        {viewer.createdAt ? <p className="text-xs text-muted-foreground">{t.profile.memberSince} {formatDate(viewer.createdAt.slice(0, 10), locale)}</p> : null}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t.profile.tracker}</h2>
        {connections.length ? connections.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2">
            <span className="font-medium">{PROVIDER_LABEL[c.provider]}</span>
            <SyncStatus status={c.status} lastSyncedAt={c.lastSyncedAt} t={t} locale={locale} timeZone={viewer.timezone} />
          </div>
        )) : <p className="text-sm text-muted-foreground">{t.common.notConnected}</p>}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t.settings.sharing}</h2>
        <div className="flex flex-wrap gap-2">
          {shared.length ? shared.map((c) => <Badge key={c} variant="green">{t.settings.categories[c]}</Badge>) : <span className="text-sm text-muted-foreground">{t.common.notShared}</span>}
        </div>
        <Link href="/settings#sharing" className={buttonVariants({ variant: "secondary", size: "sm", className: "w-fit" })}>{t.settings.sharing}</Link>
      </Card>
    </div>
  );
}
