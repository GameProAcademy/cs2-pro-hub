/**
 * Real Player DNA. Every value is the mean of the player's own persisted
 * feature signals (`getRealPlayerDna`); nothing is compared with a population
 * that does not exist, and an unobserved signal is shown as "not observed".
 */
import { useQuery } from "@tanstack/react-query";
import { CircleDashed } from "lucide-react";

import { DnaRadarChart } from "@/components/charts/DnaRadarChart";
import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { AppShell } from "@/components/layout/AppShell";
import { OverviewStatePanel, WithOverview } from "@/components/real/RealData";
import { useI18n, useT } from "@/i18n";
import { dnaLabelKey } from "@/lib/dna";
import { getRealPlayerDna } from "@/lib/playerData.functions";
import type { RealPlayerDna } from "@/lib/playerDna";

function format(value: number | null, unit: string): string {
  if (value === null) return "—";
  if (unit === "ratio" || unit === "rate") return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(2);
}

function DnaBody({ dna }: { dna: RealPlayerDna }) {
  const { t, intlTag } = useI18n();
  const observed = dna.dimensions.filter((d) => d.value !== null);
  return (
    <div className="space-y-8">
      <p className="rounded-lg border border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        {t("real.dna.basis")
          .replace("{matches}", String(dna.matches))
          .replace("{rounds}", dna.rounds === null ? "—" : String(dna.rounds))
          .replace("{partial}", String(dna.partialMatches))}
      </p>
      <p className="font-mono text-[11px] text-muted-foreground" data-testid="dna-snapshot">
        {dna.snapshot?.createdAt
          ? t("real.dna.snapshot")
              .replace("{version}", dna.snapshot.dnaVersion ?? "—")
              .replace(
                "{date}",
                new Date(dna.snapshot.createdAt).toLocaleString(intlTag, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              )
              .replace("{n}", String(dna.snapshot.matchCount))
          : t("real.dna.snapshotPending")}
      </p>
      {dna.state === "INSUFFICIENT_SAMPLE" ? (
        <p className="rounded-lg border border-warning/25 bg-warning/8 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          {t("real.dna.insufficient")
            .replace("{matches}", String(dna.matches))
            .replace("{minimum}", String(dna.minimumMatches))}
        </p>
      ) : null}
      {observed.length >= 3 ? (
        <ChartCard
          showDemoTag={false}
          title={t("dna.radarTitle")}
          subtitle={t("real.dna.radarSub")}
        >
          <DnaRadarChart
            showAverage={false}
            data={observed.map((d) => ({
              dimension: d.dimension,
              value: Math.round((d.value as number) * 100),
              average: 0,
            }))}
          />
        </ChartCard>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {dna.dimensions.map((d) => (
          <ChartCard
            key={d.dimension}
            showDemoTag={false}
            title={t(dnaLabelKey(d.dimension))}
            subtitle={
              d.value === null ? t("real.dna.notObserved") : `${Math.round(d.value * 100)} / 100`
            }
          >
            <ul className="divide-y divide-border">
              {d.signals.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{s.name}</span>
                  <span className="font-mono">
                    {s.mean === null ? t("real.dna.notObserved") : format(s.mean, s.unit)}
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {t("real.dna.inMatches").replace("{n}", String(s.matches))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </ChartCard>
        ))}
      </div>
    </div>
  );
}

export function RealPlayerDnaPage() {
  const t = useT();
  const query = useQuery({ queryKey: ["player", "dna"], queryFn: () => getRealPlayerDna() });
  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("dna.eyebrow")}
          title={t("dna.title")}
          description={t("real.dna.description")}
        />
        {query.isPending ? (
          <LoadingState />
        ) : query.isError || !query.data ? (
          <ErrorState
            title={t("real.error.title")}
            description={t("real.error.description")}
            onRetry={() => void query.refetch()}
          />
        ) : query.data.state === "EMPTY" ? (
          <>
            <EmptyState
              icon={<CircleDashed className="size-5" aria-hidden />}
              title={t("dna.title")}
              description={t("real.dna.empty")}
            />
            <WithOverview>{(overview) => <OverviewStatePanel overview={overview} />}</WithOverview>
          </>
        ) : (
          <DnaBody dna={query.data} />
        )}
      </div>
    </AppShell>
  );
}
