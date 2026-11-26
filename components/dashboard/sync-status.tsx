import { AlertTriangle, CheckCircle2, KeyRound, Loader2, PlugZap } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { formatTime } from "@/lib/i18n/format";
import type { ConnectionStatus } from "@/types/health";
import { cn } from "@/lib/utils";

export function SyncStatus({ status, lastSyncedAt, t, locale, timeZone, compact = false }: { status: ConnectionStatus | null; lastSyncedAt: string | null; t: Dictionary; locale: Locale; timeZone: string; compact?: boolean }) {
  let Icon = CheckCircle2;
  let text = lastSyncedAt ? `${t.common.lastUpdated} ${formatTime(lastSyncedAt, locale, timeZone)}` : t.common.noData;
  let tone = "text-muted-foreground";
  if (!status) {
    Icon = PlugZap;
    text = t.common.notConnected;
  } else if (status === "syncing") {
    Icon = Loader2;
    text = t.common.syncing;
    tone = "text-blue";
  } else if (status === "error") {
    Icon = AlertTriangle;
    text = t.common.connectionBroken;
    tone = "text-amber";
  } else if (status === "reauth_required") {
    Icon = KeyRound;
    text = t.common.reauthRequired;
    tone = "text-red";
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5", compact ? "text-[11px]" : "text-xs", tone)} data-testid="sync-status">
      <Icon className={cn("size-3.5 shrink-0", status === "syncing" && "animate-spin")} /> {text}
    </span>
  );
}
