import { FlaskConical } from "lucide-react";
import { BottomNav, SideNav } from "@/components/navigation/app-nav";
import { OfflineBanner } from "@/components/navigation/offline-banner";
import { requirePageContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { t, viewer } = await requirePageContext();
  return (
    <div className="flex min-h-dvh">
      <SideNav labels={t.nav} appName={t.appName} />
      <div className="flex min-w-0 flex-1 flex-col">
        {viewer.isDemo ? (
          <div role="note" className="flex items-center justify-center gap-2 bg-violet/15 px-4 py-2 pt-safe text-center text-xs font-medium text-violet">
            <FlaskConical className="size-4 shrink-0" /> {t.common.demoBanner}
          </div>
        ) : null}
        <OfflineBanner text={t.common.offline} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-safe pb-28 pt-safe md:px-8 md:pb-12 md:pt-8">{children}</main>
      </div>
      <BottomNav labels={t.nav} />
    </div>
  );
}
