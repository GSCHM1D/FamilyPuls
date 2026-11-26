import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { SyncStatus } from "@/components/dashboard/sync-status";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { MetricSummary } from "@/lib/data/types";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { metricCategory } from "@/lib/metrics/catalog";
import { formatMetric } from "@/lib/metrics/format";
import type { MemberSummary, MetricKey, SharingCategory } from "@/types/health";

export const FAMILY_METRICS: MetricKey[] = ["recovery_score", "sleep_duration", "resting_heart_rate", "hrv", "steps"];

export function FamilyMetricValue({ metric, summary, visible, t, locale }: { metric: MetricKey; summary: MetricSummary | undefined; visible: boolean; t: Dictionary; locale: Locale }) {
  if (!visible) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={t.common.notShared}>
        <Lock className="size-3" /> <span className="sr-only">{t.common.notShared}</span>
      </span>
    );
  }
  const { text, unit } = formatMetric(metric, summary?.value ?? null, locale);
  return (
    <span className="tabular">
      <span className="font-semibold">{text}</span>
      {unit && summary?.value !== null && summary?.value !== undefined ? <span className="ml-0.5 text-xs text-muted-foreground">{unit}</span> : null}
    </span>
  );
}

export function MemberCard({
  member,
  summaries,
  visible,
  t,
  locale,
  timeZone,
}: {
  member: MemberSummary;
  summaries: Map<MetricKey, MetricSummary>;
  visible: SharingCategory[];
  t: Dictionary;
  locale: Locale;
  timeZone: string;
}) {
  const nothingShared = !member.isSelf && visible.length === 0;
  return (
    <Link href={`/family/${member.userId}`} aria-label={`${member.displayName} – ${t.family.openDetail}`} className="group block">
      <Card className="flex flex-col gap-4 transition-colors group-hover:border-border" data-testid="member-card">
        <div className="flex items-center gap-3">
          <Avatar name={member.displayName} url={member.avatarUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {member.displayName} {member.isSelf ? <span className="text-xs font-normal text-muted-foreground">({t.common.you})</span> : null}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {member.providerLabel ? <Badge variant={member.provider === "whoop" ? "green" : "blue"}>{member.providerLabel}</Badge> : <Badge>{t.common.notConnected}</Badge>}
              <SyncStatus status={member.connectionStatus} lastSyncedAt={member.lastSyncedAt} t={t} locale={locale} timeZone={timeZone} compact />
            </div>
          </div>
          <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
        {nothingShared ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" /> {t.family.privateMember}</p>
        ) : (
          <dl className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-5">
            {FAMILY_METRICS.map((m) => (
              <div key={m} className="flex flex-col gap-0.5">
                <dt className="text-[11px] text-muted-foreground">{t.metrics[m]}</dt>
                <dd className="text-[15px]">
                  <FamilyMetricValue metric={m} summary={summaries.get(m)} visible={member.isSelf || visible.includes(metricCategory(m))} t={t} locale={locale} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </Link>
  );
}
