/**
 * Real Player DNA. Every value is the mean of the player's own persisted
 * feature signals (`getRealPlayerDna`); nothing is compared with a population
 * that does not exist, and an unobserved signal is shown as "not observed".
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { DnaRadarA, type RadarAxis } from "@/components/charts/DnaRadarA";
import { ChartCard } from "@/components/common/ChartCard";
import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { Cs2Mask, RadialGauge } from "@/components/cs2/Cs2Art";
import { DIMENSION_ART } from "@/lib/cs2/assets";
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
import { getRealPlayerDna, refreshOwnDnaSnapshot } from "@/lib/playerData.functions";
import { getDnaHistory, getDnaSummary } from "@/lib/xray.functions";
import { DNA_MIN_EVENT_SAMPLE, type RealPlayerDna } from "@/lib/playerDna";
import { DNA_VERSION_V3 } from "@/lib/playerDnaV3";
import { cn } from "@/lib/utils";
import type { DnaDimension } from "@/types";

export const PLAYER_DNA_QUERY_KEY = ["player", "dna"] as const;

/** VGL: a game pictogram per DNA dimension (decorative; the dimension name stays the title). */
const DNA_ICON = {
  aim: "crosshair",
  dueling: "kill",
  survivability: "shield",
  positioning: "map",
  utility: "grenade",
  decision_making: "dna",
  teamplay: "assist",
  economy: "rounds",
  clutch: "clutch",
  consistency: "trend",
} as const satisfies Record<string, GameIconName>;

const DNA_ART = DIMENSION_ART;

export function DnaBody({ dna }: { dna: RealPlayerDna }) {
  const { t, intlTag, locale } = useI18n();
  const observed = dna.dimensions.filter((d) => d.value !== null);
  const [selected, setSelected] = useState<DnaDimension | null>(null);
  const axes: RadarAxis[] = dna.dimensions.map((d) => ({
    dimension: d.dimension,
    value: d.value === null ? null : Math.round(d.value * 100),
    status: d.status ?? (d.value === null ? "NO_SAMPLE" : "MEASURED"),
  }));
  const selectedDim = dna.dimensions.find((d) => d.dimension === selected) ?? null;
  // The selected dimension's signals come first (the "bars" of the selection).
  const ordered = selectedDim
    ? [selectedDim, ...dna.dimensions.filter((d) => d !== selectedDim)]
    : dna.dimensions;
  const clutchAttempts =
    dna.dimensions
      .find((d) => d.dimension === "clutch")
      ?.signals.find((x) => x.name === "clutch_win_rate")?.sample ?? null;
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
      <p className="font-mono text-xs text-muted-foreground" data-testid="dna-snapshot">
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
          subtitle={fill(t("real.dna.radarSub"), { min: DNA_MIN_EVENT_SAMPLE })}
        >
          {/* UX-1.6 / R-14: radar A — ten axes always, empty axes dashed, one selection. */}
          <DnaRadarA axes={axes} selected={selected} onSelect={setSelected} />
          <div
            role="group"
            aria-label={t("real.dna.select")}
            className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1"
            data-dna-chips
          >
            {axes.map((a) => (
              <button
                key={a.dimension}
                type="button"
                aria-pressed={selected === a.dimension}
                onClick={() => setSelected(a.dimension)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs",
                  selected === a.dimension
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {t(dnaLabelKey(a.dimension))}
                <span className="font-mono">{a.value === null ? NOT_AVAILABLE_MARK : a.value}</span>
              </button>
            ))}
          </div>
          <p className="sr-only" aria-live="polite" data-dna-announce>
            {selectedDim
              ? fill(t("real.dna.selected"), {
                  dimension: t(dnaLabelKey(selectedDim.dimension)),
                  value:
                    selectedDim.value === null
                      ? t(
                          `real.dna.status.${selectedDim.status === "NOT_MEASURED" ? "NOT_MEASURED" : "NO_SAMPLE"}` as TranslationKey,
                        )
                      : `${Math.round(selectedDim.value * 100)} / 100`,
                  n: selectedDim.signals.length,
                })
              : ""}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground" data-dna-legend>
            {t("real.dna.legend")} {selected ? null : t("real.dna.pick")}
          </p>
        </ChartCard>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {ordered.map((d, i) => (
          <article
            key={d.dimension}
            className={cn(
              "vgl-rise vgl-lift surface-panel relative isolate overflow-hidden rounded-xl border border-border p-4 sm:p-5",
              selected === d.dimension && "ring-1 ring-primary/50",
            )}
            style={{ "--vgl-i": i } as CSSProperties}
            data-dna-card={d.dimension}
          >
            {/* Authentic CS2 silhouette as a watermark (decorative). */}
            <Cs2Mask
              src={DNA_ART[d.dimension] ?? DIMENSION_ART["aim"]!}
              className="pointer-events-none absolute -right-4 top-3 -z-10 h-20 w-44 text-primary opacity-[0.07]"
            />
            <header className="mb-4 flex items-center gap-4">
              <RadialGauge
                value={stable && d.value !== null ? d.value : null}
                size={68}
                label={
                  stable && d.value !== null ? (
                    <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
                      {Math.round(d.value * 100)}
                    </span>
                  ) : (
                    <GameIcon
                      name={DNA_ICON[d.dimension as keyof typeof DNA_ICON]}
                      className="size-5 text-muted-foreground"
                    />
                  )
                }
              />
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 font-display text-base font-semibold uppercase tracking-wide text-foreground">
                  <GameIcon
                    name={DNA_ICON[d.dimension as keyof typeof DNA_ICON]}
                    className="size-4 text-primary"
                  />
                  {t(dnaLabelKey(d.dimension))}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground" data-dna-card-status>
                  {d.status === "NOT_MEASURED"
                    ? t("real.dna.status.NOT_MEASURED")
                    : d.status === "NO_SAMPLE" && !d.observed
                      ? d.dimension === "clutch" && clutchAttempts !== null
                        ? `${t("real.dna.status.NO_SAMPLE")} · ${fill(t("real.dna.clutchAttempts"), { n: clutchAttempts, min: DNA_MIN_EVENT_SAMPLE })}`
                        : t("real.dna.status.NO_SAMPLE")
                      : d.value === null && !d.observed
                        ? t("real.dna.notObserved")
                        : stable && d.value !== null
                          ? `${Math.round(d.value * 100)} / 100`
                          : fill(t("real.dna.inFormationIndex"), {
                              matches: dna.matches,
                              minimum: dna.minimumMatches,
                            })}
                </p>
              </div>
            </header>
            <ul className="grid gap-2 sm:grid-cols-2" data-dna-signals>
              {d.signals.map((s) => (
                <li
                  key={s.name}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
                >
                  <span className="text-xs text-muted-foreground">
                    {signalLabel(s.name, locale)}
                    {s.mean !== null &&
                    (s.notFolded === "COMPLEMENT" ||
                      s.notFolded === "THIN_SAMPLE" ||
                      s.notFolded === "DUPLICATE") ? (
                      <span className="block text-xs" data-dna-not-folded={s.notFolded}>
                        {fill(t(`real.dna.notFolded.${s.notFolded}`), {
                          min: DNA_MIN_EVENT_SAMPLE,
                        })}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono text-base font-semibold tabular-nums text-foreground">
                    {s.mean === null
                      ? t("real.dna.notObserved")
                      : formatSignalValue(
                          s.name,
                          s.mean,
                          s.unit,
                          { yes: t("real.dna.flagYes"), no: t("real.dna.flagNo") },
                          intlTag,
                        )}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("real.dna.inMatches").replace("{n}", String(s.matches))}
                      {s.mean !== null &&
                      s.sample != null &&
                      (s.sampleUnit === "opening_duels" ||
                        s.sampleUnit === "clutches" ||
                        s.sampleUnit === "kills")
                        ? ` · ${fill(t(`real.dna.sample.${s.sampleUnit}`), { n: s.sample })}`
                        : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </article>
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
      subtitle={`${t("real.dna.history.description")} ${fill(t("real.dna.history.versionNote"), { version: DNA_VERSION_V3 })}`}
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
          <div className="overflow-x-auto" data-table-scroll>
            <table className="w-full text-sm" data-dna-history>
              <thead>
                <tr className="text-left font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="py-2 pr-4 font-normal">{t("real.dna.history.date")}</th>
                  <th className="py-2 pr-4 font-normal">{t("real.dna.history.matches")}</th>
                  <th className="py-2 pr-4 font-normal">{t("real.dna.history.version")}</th>
                  <th className="py-2 pr-4 font-normal">{t("real.dna.history.dimensions")}</th>
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
                    <td className="py-2 pr-4 font-mono text-xs">{h.dnaVersion ?? "—"}</td>
                    <td className="py-2 pr-4 font-mono">
                      {Object.values(h.dimensions).filter((v) => v !== null).length}
                    </td>
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
    <ChartCard showDemoTag={false} icon="dna" title={t("dashboard.dna")}>
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
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: PLAYER_DNA_QUERY_KEY, queryFn: () => getRealPlayerDna() });
  // The read never writes. A non-empty profile without a snapshot of its current inputs
  // (older profile, or a new DNA method) asks for one explicitly, once per page visit.
  const refresh = useMutation({
    mutationFn: () => refreshOwnDnaSnapshot(),
    onSuccess: (result) => {
      if (result.status === "created" || result.status === "unchanged")
        void queryClient.invalidateQueries({ queryKey: PLAYER_DNA_QUERY_KEY });
    },
  });
  const asked = useRef(false);
  const needsSnapshot =
    query.data !== undefined && query.data.state !== "EMPTY" && !query.data.snapshot;
  useEffect(() => {
    if (needsSnapshot && !asked.current) {
      asked.current = true;
      refresh.mutate();
    }
  }, [needsSnapshot, refresh]);
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
