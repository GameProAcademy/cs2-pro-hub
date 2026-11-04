/**
 * Real Player DNA. Every value is the mean of the player's own persisted
 * feature signals (`getRealPlayerDna`); nothing is compared with a population
 * that does not exist, and an unobserved signal is shown as "not observed".
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed } from "lucide-react";

import { DnaRadarChart } from "@/components/charts/DnaRadarChart";
import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { AppShell } from "@/components/layout/AppShell";
import { OverviewStatePanel, WithOverview } from "@/components/real/RealData";
import { Button } from "@/components/ui/button";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { dnaLabelKey } from "@/lib/dna";
import { formatSignalValue } from "@/lib/dnaFormat";
import { signalLabel } from "@/lib/dnaSignalLabels";
import { NOT_AVAILABLE_MARK, fill, formatDateTime } from "@/lib/format";
import { getRealPlayerDna } from "@/lib/playerData.functions";
import { getDnaHistory, getDnaSummary } from "@/lib/xray.functions";
import type { RealPlayerDna } from "@/lib/playerDna";

export const PLAYER_DNA_QUERY_KEY = ["player", "dna"] as const;

export function DnaBody({ dna }: { dna: RealPlayerDna }) {
  const { t, intlTag, locale } = useI18n();
  const observed = dna.dimensions.filter((d) => d.value !== null);
  // Below the minimum sample, dimension indexes are not a profile: no radar, no "N / 100".
  const stable = dna.state === "READY";
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
      {!stable ? (
        <p className="text-xs text-muted-foreground" data-dna-in-formation>
          {fill(t("real.dna.radarInFormation"), { minimum: dna.minimumMatches })}
        </p>
      ) : null}
      {stable && observed.length >= 3 ? (
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
              d.value === null && !d.observed
                ? t("real.dna.notObserved")
                : stable && d.value !== null
                  ? `${Math.round(d.value * 100)} / 100`
                  : fill(t("real.dna.inFormationIndex"), {
                      matches: dna.matches,
                      minimum: dna.minimumMatches,
                    })
            }
          >
            <ul className="divide-y divide-border">
              {d.signals.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground">
                    {signalLabel(s.name, locale)}
                  </span>
                  <span className="font-mono">
                    {s.mean === null
                      ? t("real.dna.notObserved")
                      : formatSignalValue(
                          s.name,
                          s.mean,
                          s.unit,
                          { yes: t("real.dna.flagYes"), no: t("real.dna.flagNo") },
                          intlTag,
                        )}
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
      <DnaHistory />
    </div>
  );
}

/** Persisted snapshots, newest first: how the profile changed as matches were added. */
function DnaHistory() {
  const { t, intlTag } = useI18n();
  const query = useQuery({
    queryKey: ["player", "dna", "history"],
    queryFn: () => getDnaHistory(),
  });
  return (
    <ChartCard
      showDemoTag={false}
      title={t("real.dna.history.title")}
      subtitle={t("real.dna.history.description")}
    >
      {query.isPending ? (
        <LoadingState />
      ) : query.isError || !query.data ? (
        <ErrorState
          title={t("real.error.title")}
          description={t("real.error.description")}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data.length ? (
        <p className="text-sm text-muted-foreground">{t("real.dna.history.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-dna-history>
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="py-2 pr-4 font-normal">{t("real.dna.history.date")}</th>
                <th className="py-2 pr-4 font-normal">{t("real.dna.history.matches")}</th>
                <th className="py-2 font-normal">{t("real.dna.history.state")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.data.map((h) => (
                <tr key={h.createdAt}>
                  <td className="py-2 pr-4 font-mono text-xs">
                    <time dateTime={h.createdAt}>{formatDateTime(h.createdAt, intlTag)}</time>
                  </td>
                  <td className="py-2 pr-4 font-mono">{h.matchCount ?? "—"}</td>
                  <td className="py-2 text-muted-foreground">
                    {h.state === "READY" || h.state === "INSUFFICIENT_SAMPLE"
                      ? t(`real.dna.history.${h.state}` as TranslationKey)
                      : (h.state ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

/**
 * Dashboard card: the real DNA state and a way to the full page (never "not available").
 * READ ONLY: uses `getDnaSummary` (latest persisted snapshot) — never `getRealPlayerDna`,
 * which refreshes snapshots. A missing snapshot is shown as such, never created here.
 */
export function RealDnaSummary() {
  const t = useT();
  const query = useQuery({
    queryKey: ["player", "dna", "summary"],
    queryFn: () => getDnaSummary(),
  });
  const dna = query.data;
  const text = !dna
    ? null
    : dna.state === "NO_PLAYER"
      ? t("real.dna.dashboard.empty")
      : dna.state === "NO_SNAPSHOT"
        ? t("real.dna.dashboard.noSnapshot")
        : dna.state === "INSUFFICIENT_SAMPLE"
          ? fill(t("real.dna.dashboard.inFormation"), {
              matches: dna.matches ?? NOT_AVAILABLE_MARK,
              minimum: dna.minimumMatches,
            })
          : fill(t("real.dna.dashboard.ready"), {
              matches: dna.matches ?? NOT_AVAILABLE_MARK,
              observed: dna.observedDimensions ?? NOT_AVAILABLE_MARK,
            });
  return (
    <ChartCard showDemoTag={false} title={t("dashboard.dna")}>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError || !dna ? (
        <ErrorState
          title={t("real.error.title")}
          description={t("real.error.description")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <DnaSummaryBody text={text} state={dna.state} />
      )}
    </ChartCard>
  );
}

export function DnaSummaryBody({ text, state }: { text: string | null; state: string }) {
  const t = useT();
  return (
    <div className="space-y-4" data-dna-summary={state}>
      <p className="text-sm text-muted-foreground">{text}</p>
      {state !== "NO_PLAYER" ? (
        <Button asChild size="sm" variant="outline">
          <Link to="/player-dna">{t("real.dna.open")}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function RealPlayerDnaPage() {
  const t = useT();
  const query = useQuery({ queryKey: PLAYER_DNA_QUERY_KEY, queryFn: () => getRealPlayerDna() });
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
