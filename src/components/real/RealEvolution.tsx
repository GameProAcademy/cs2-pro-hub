/**
 * PM4 / 4.2.8 — evolution and consistency (module G). Renders `cs2.evolution.v1` only.
 * Every value shows its N (matches in the window that measured it), its aggregation and its
 * formula; a window is never padded; consistency is descriptive (no "consistent" label);
 * a comparison is shown only when both periods have enough matches and the same method, and
 * it is never presented as caused by anything. The Player DNA is linked with its own state.
 */
import { MapTile } from "@/components/common/GameVisuals";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed, Info } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import { ProBenchmarkCard } from "@/components/benchmarks/ProBenchmarkCard";
import { MonthlyReviewCard } from "@/components/review/MonthlyReviewCard";
import { TrendChart } from "@/components/charts/TrendChart";
import { ChartCard } from "@/components/common/ChartCard";
import { SnapshotTimeline } from "@/components/cs2/IdentityKit";
import { cn } from "@/lib/utils";
import {
  STACK_BODY,
  STACK_CELL,
  STACK_HEAD,
  STACK_ROW,
  STACK_TABLE,
  STACK_WIDE,
} from "@/lib/ui/stackedTable";
import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { AppShell } from "@/components/layout/AppShell";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { mapDisplayName } from "@/lib/cs2/maps";
import { getEvolution, type EvolutionResponse } from "@/lib/evolution.functions";
import {
  COMPARE_MIN_MATCHES,
  CONSISTENCY_MIN_MATCHES,
  WINDOW_MIN_MATCHES,
  WINDOW_SIZES,
  type EvolutionMetricKey,
  type EvolutionReport,
  type MetricReport,
  type Side,
  type Unit,
  type WindowSize,
} from "@/lib/evolution/evolution";
import { NOT_AVAILABLE_MARK, fill, formatDate, formatNumber } from "@/lib/format";
import { getDnaSummary } from "@/lib/xray.functions";
import { CoachWordCard } from "@/components/coachWord/CoachWordCard";

export interface EvolutionSearch {
  window?: WindowSize | undefined;
  map?: string | undefined;
  side?: Side | undefined;
}
export const evolutionQueryKey = (s: EvolutionSearch) => ["player", "evolution", s] as const;

export function RealEvolutionPage({
  search,
  onSearch,
}: {
  search: EvolutionSearch;
  onSearch: (next: EvolutionSearch) => void;
}) {
  const t = useT();
  const clean: EvolutionSearch = {
    ...(search.window ? { window: search.window } : {}),
    ...(search.map ? { map: search.map } : {}),
    ...(search.side && search.side !== "ALL" ? { side: search.side } : {}),
  };
  const query = useQuery({
    queryKey: evolutionQueryKey(clean),
    queryFn: () => getEvolution({ data: clean }),
  });
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("evolution.eyebrow")}
          title={t("evolution.title")}
          description={t("evolution.description")}
        />
        <CoachWordCard section="evolution" />
        {query.isPending ? (
          <LoadingState />
        ) : query.isError || !query.data ? (
          <ErrorState
            title={t("real.error.title")}
            description={t("real.error.description")}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <EvolutionBody r={query.data} search={clean} onSearch={onSearch} />
        )}
        <DnaCard />
        <SnapshotTimeline />
        <MonthlyReviewCard />
        <ProBenchmarkCard />
      </div>
    </AppShell>
  );
}

const DIGITS: Record<Unit, number> = {
  RATIO: 2,
  PERCENT: 1,
  PER_ROUND: 2,
  DAMAGE_PER_ROUND: 1,
  RATING: 2,
};

export function formatMetric(value: number | null, unit: Unit, intlTag: string): string {
  if (value === null) return NOT_AVAILABLE_MARK;
  const n = formatNumber(value, intlTag, DIGITS[unit]);
  return unit === "PERCENT" ? `${n}%` : n;
}

function signed(value: number, unit: Unit, intlTag: string): string {
  const text = formatMetric(Math.abs(value), unit, intlTag);
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

function Note({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
      data-evolution-note={id}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function Select<T extends string | number>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex min-w-36 flex-col gap-1 text-xs text-muted-foreground">
      <span className="font-mono uppercase tracking-[0.12em]">{label}</span>
      <select
        name={name}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        value={String(value)}
        onChange={(e) => {
          const hit = options.find((o) => String(o.value) === e.target.value);
          if (hit) onChange(hit.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EvolutionBody({
  r,
  search,
  onSearch,
}: {
  r: EvolutionResponse;
  search: EvolutionSearch;
  onSearch: (next: EvolutionSearch) => void;
}) {
  const t = useT();
  if (r.status === "EMPTY")
    return (
      <div data-evolution-status="EMPTY">
        <EmptyState
          icon={<CircleDashed className="size-5" aria-hidden />}
          title={t("evolution.empty.title")}
          description={t("evolution.empty.description")}
        />
      </div>
    );
  const rep = r.report;
  const set = (patch: EvolutionSearch) => onSearch({ ...search, ...patch });
  return (
    <div className="space-y-6" data-evolution-status="OK" data-window-status={rep.window.status}>
      <div className="flex flex-wrap gap-3">
        <Select
          label={t("evolution.filter.window")}
          name="window"
          value={rep.filters.window}
          options={WINDOW_SIZES.map((w) => ({
            value: w,
            label: fill(t("evolution.filter.windowN"), { n: w }),
          }))}
          onChange={(w) => set({ window: w })}
        />
        <Select
          label={t("evolution.filter.map")}
          name="map"
          value={rep.filters.map ?? ""}
          options={[
            { value: "", label: t("evolution.filter.allMaps") },
            ...rep.maps.map((m) => ({ value: m, label: mapDisplayName(m) })),
          ]}
          onChange={(m) => set({ map: m || undefined })}
        />
        <Select
          label={t("evolution.filter.side")}
          name="side"
          value={rep.filters.side}
          options={(["ALL", "CT", "T"] as const).map((s) => ({
            value: s,
            label: t(`evolution.side.${s}` as TranslationKey),
          }))}
          onChange={(s) => set({ side: s })}
        />
      </div>
      <EvolutionReportView rep={rep} />
    </div>
  );
}

function EvolutionReportView({ rep }: { rep: EvolutionReport }) {
  const t = useT();
  const { intlTag } = useI18n();
  const [selected, setSelected] = useState<EvolutionMetricKey>(rep.metrics[0]?.key ?? "kd");
  const chosen = rep.metrics.find((m) => m.key === selected) ?? rep.metrics[0];
  const blocked = rep.window.status === "INSUFFICIENT_SAMPLE";
  return (
    <div className="space-y-6">
      <Note id="WINDOW">
        {fill(t("evolution.windowN"), {
          n: rep.window.n,
          requested: rep.window.requested,
          total: rep.eligibleMatches,
        })}{" "}
        {rep.window.status === "PARTIAL"
          ? t("evolution.window.partial")
          : rep.window.status === "INSUFFICIENT_SAMPLE"
            ? fill(t("evolution.window.insufficient"), { min: WINDOW_MIN_MATCHES })
            : ""}
      </Note>
      {rep.excluded.length ? (
        <Note id="EXCLUDED">{fill(t("evolution.excluded"), { n: rep.excluded.length })}</Note>
      ) : null}
      {rep.filters.side !== "ALL" ? <Note id="SIDE">{t("evolution.sideOnlyRating")}</Note> : null}
      <Note id="WEAPON">{t("evolution.weaponNote")}</Note>

      {blocked ? null : <PeriodCompare metrics={rep.metrics} intlTag={intlTag} />}
      {blocked ? null : (
        <ChartCard
          title={t("evolution.section.metrics")}
          subtitle={t("evolution.section.metrics.subtitle")}
        >
          <div className="overflow-x-auto">
            <table
              className={cn("w-full text-sm md:min-w-[720px]", STACK_TABLE)}
              data-evolution-table
            >
              <thead className={cn("text-left text-xs text-muted-foreground", STACK_HEAD)}>
                <tr>
                  <th className="py-1.5 pr-3 font-medium">{t("evolution.col.metric")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("evolution.col.window")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("evolution.col.consistency")}</th>
                  <th className="py-1.5 font-medium">{t("evolution.col.comparison")}</th>
                </tr>
              </thead>
              <tbody className={STACK_BODY}>
                {rep.metrics.map((m) => (
                  <MetricRow key={m.key} m={m} intlTag={intlTag} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {fill(t("evolution.method"), {
              version: rep.version,
              consistency: CONSISTENCY_MIN_MATCHES,
              compare: COMPARE_MIN_MATCHES,
            })}
          </p>
        </ChartCard>
      )}

      {blocked || !chosen ? null : (
        <ChartCard
          title={t("evolution.section.chart")}
          subtitle={t("evolution.section.chart.subtitle")}
        >
          <div className="mb-3 max-w-xs">
            <Select
              label={t("evolution.col.metric")}
              name="metric"
              value={chosen.key}
              options={rep.metrics.map((m) => ({
                value: m.key,
                label: t(`evolution.metric.${m.key}` as TranslationKey),
              }))}
              onChange={(k) => setSelected(k)}
            />
          </div>
          <TrendChart
            variant="line"
            data={chosen.points.map((p) => ({
              label: formatDate(p.playedAt, intlTag),
              ...(p.value === null ? {} : { [chosen.key]: Number(p.value.toFixed(3)) }),
            }))}
            series={[
              { key: chosen.key, label: t(`evolution.metric.${chosen.key}` as TranslationKey) },
            ]}
            {...(chosen.definition.unit === "PERCENT" ? { unit: "%" } : {})}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {fill(t("evolution.chart.axis"), {
              unit: t(`evolution.unit.${chosen.definition.unit}` as TranslationKey),
            })}
          </p>
          <ol className="mt-3 divide-y divide-border text-sm" data-evolution-matches>
            {[...chosen.points].reverse().map((p) => (
              <li
                key={p.matchId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5"
                data-match-value={p.value === null ? "NOT_MEASURED" : "OK"}
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDate(p.playedAt, intlTag)}
                </span>
                {p.map ? (
                  <MapTile map={p.map} size="sm" showName />
                ) : (
                  <span>{NOT_AVAILABLE_MARK}</span>
                )}
                <span className="font-mono">
                  {p.value === null
                    ? t("evolution.notMeasured")
                    : formatMetric(p.value, chosen.definition.unit, intlTag)}
                </span>
                <Link
                  to="/rounds"
                  search={{ matchId: p.matchId }}
                  className="text-primary underline-offset-2 hover:underline"
                  data-drilldown-link
                >
                  {t("evolution.openRounds")}
                </Link>
              </li>
            ))}
          </ol>
        </ChartCard>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">{t("evolution.notCausal")}</p>
    </div>
  );
}

/** VGL 2.0 continuation: a game icon per evolution metric (decorative). */
const METRIC_ICON: Record<EvolutionMetricKey, GameIconName> = {
  kd: "kill",
  adr: "crosshair",
  kast: "shield",
  hsPercent: "headshot",
  rating: "trend",
  openingWinRate: "opening",
  deathsPerRound: "skull",
  tradeKillsPerRound: "trade",
  clutchWinRate: "clutch",
  flashAssistsPerRound: "flash",
};

/**
 * "Before → now" for the comparisons the report itself marks OK (same filters, comparable
 * periods). The arrow states the direction only; it is neutral because "up" is not better for
 * every metric (deaths per round). Metrics without a valid comparison are listed apart.
 */
function PeriodCompare({ metrics, intlTag }: { metrics: MetricReport[]; intlTag: string }) {
  const t = useT();
  const ok = metrics.filter((m) => m.comparison.status === "OK" && m.comparison.delta !== null);
  const without = metrics.filter((m) => !ok.includes(m));
  return (
    <section
      className="surface-panel vgl-grid relative overflow-hidden rounded-xl border border-border p-4 sm:p-6"
      aria-labelledby="period-compare-title"
      data-period-compare
    >
      <h2
        id="period-compare-title"
        className="font-display text-lg font-semibold uppercase tracking-wide text-foreground"
      >
        {t("vgl.evo.compare.title")}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        {t("vgl.evo.compare.subtitle")}
      </p>
      {ok.length ? (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ok.map((m, i) => {
            const c = m.comparison;
            const unit = m.definition.unit;
            const dir = c.delta! > 0 ? "UP" : c.delta! < 0 ? "DOWN" : "FLAT";
            return (
              <li
                key={m.key}
                className="vgl-rise rounded-lg border border-border bg-background/40 p-3"
                style={{ "--vgl-i": i } as CSSProperties}
                data-period-metric={m.key}
                data-period-direction={dir}
              >
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <GameIcon name={METRIC_ICON[m.key]} className="size-4 text-primary" />
                  {t(`evolution.metric.${m.key}` as TranslationKey)}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("vgl.evo.compare.before")}</p>
                    <p className="font-mono text-lg tabular-nums text-muted-foreground">
                      {formatMetric(c.previous.value, unit, intlTag)}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className="mb-1 flex size-8 items-center justify-center rounded-full border border-border-strong text-foreground"
                  >
                    {dir === "UP" ? "↗" : dir === "DOWN" ? "↘" : "→"}
                  </span>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{t("vgl.evo.compare.now")}</p>
                    <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                      {formatMetric(c.recent.value, unit, intlTag)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {signed(c.delta!, unit, intlTag)} ·{" "}
                  {fill(t("evolution.comparison.n"), {
                    recent: c.recent.matches,
                    previous: c.previous.matches,
                  })}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p
          className="mt-4 rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm text-muted-foreground"
          data-period-compare-empty
        >
          {t("vgl.evo.compare.none")}
        </p>
      )}
      {ok.length && without.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {fill(t("vgl.evo.compare.without"), { n: without.length })}
        </p>
      ) : null}
    </section>
  );
}

function MetricRow({ m, intlTag }: { m: MetricReport; intlTag: string }) {
  const t = useT();
  const unit = m.definition.unit;
  const w = m.window;
  const c = m.consistency;
  const cmp = m.comparison;
  return (
    <tr
      className={cn("border-t border-border align-top", STACK_ROW)}
      data-metric={m.key}
      data-metric-status={w.status}
    >
      <td className={cn("py-2 pr-3", STACK_WIDE, "max-md:p-0")}>
        <div className="max-md:font-medium">{t(`evolution.metric.${m.key}` as TranslationKey)}</div>
        <div className="text-xs text-muted-foreground">
          {t(`evolution.aggregation.${m.definition.aggregation}` as TranslationKey)} ·{" "}
          {m.definition.formula}
        </div>
      </td>
      <td className={cn("py-2 pr-3", STACK_CELL)} data-label={t("evolution.col.window")}>
        {w.status === "OK" ? (
          <>
            <div className="font-mono">{formatMetric(w.value, unit, intlTag)}</div>
            <div className="text-xs text-muted-foreground">
              {fill(t("evolution.coverage"), { n: w.matches, total: w.windowMatches })}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">
            {t(`evolution.status.${w.status}` as TranslationKey)}
          </span>
        )}
      </td>
      <td
        className={cn("py-2 pr-3", STACK_CELL)}
        data-label={t("evolution.col.consistency")}
        data-consistency-status={c.status}
      >
        {c.status === "OK" ? (
          <div className="space-y-0.5 font-mono text-xs">
            <div>
              {fill(t("evolution.consistency.median"), {
                v: formatMetric(c.median, unit, intlTag),
                q1: formatMetric(c.q1, unit, intlTag),
                q3: formatMetric(c.q3, unit, intlTag),
              })}
            </div>
            <div>
              {fill(t("evolution.consistency.sd"), {
                sd: formatMetric(c.sd, unit, intlTag),
                cv: c.cv === null ? NOT_AVAILABLE_MARK : `${formatNumber(c.cv * 100, intlTag, 0)}%`,
              })}
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {fill(t("evolution.consistency.insufficient"), {
              n: c.n,
              min: CONSISTENCY_MIN_MATCHES,
            })}
          </span>
        )}
      </td>
      <td
        className={cn("py-2", STACK_CELL, STACK_WIDE)}
        data-label={t("evolution.col.comparison")}
        data-comparison-status={cmp.status}
      >
        {cmp.status === "OK" && cmp.delta !== null ? (
          <div className="space-y-0.5 text-xs">
            <div className="font-mono">
              {`${formatMetric(cmp.previous.value, unit, intlTag)} → ${formatMetric(cmp.recent.value, unit, intlTag)}`}
            </div>
            <div
              className="font-mono"
              data-delta={cmp.delta > 0 ? "UP" : cmp.delta < 0 ? "DOWN" : "FLAT"}
            >
              {signed(cmp.delta, unit, intlTag)}
              {cmp.deltaPercent === null
                ? ""
                : ` (${cmp.deltaPercent > 0 ? "+" : cmp.deltaPercent < 0 ? "−" : ""}${formatNumber(Math.abs(cmp.deltaPercent), intlTag, 0)}%)`}
            </div>
            <div className="text-muted-foreground">
              {fill(t("evolution.comparison.n"), {
                recent: cmp.recent.matches,
                previous: cmp.previous.matches,
              })}
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {fill(t(`evolution.comparison.${cmp.status}` as TranslationKey), {
              min: COMPARE_MIN_MATCHES,
            })}
          </span>
        )}
      </td>
    </tr>
  );
}

function DnaCard() {
  const t = useT();
  const { intlTag } = useI18n();
  // Pure read of the latest persisted DNA snapshot (never the snapshot-refreshing read).
  const q = useQuery({ queryKey: ["player", "dna", "summary"], queryFn: () => getDnaSummary() });
  if (!q.data) return null;
  const d = q.data;
  return (
    <ChartCard title={t("evolution.dna.title")} subtitle={t("evolution.dna.subtitle")}>
      <div className="flex flex-wrap items-center gap-3 text-sm" data-dna-state={d.state}>
        <span>
          {d.state === "READY"
            ? fill(t("evolution.dna.ready"), {
                n: d.matches ?? NOT_AVAILABLE_MARK,
                date: d.createdAt ? formatDate(d.createdAt, intlTag) : NOT_AVAILABLE_MARK,
              })
            : fill(t("evolution.dna.insufficient"), {
                n: d.matches ?? 0,
                min: d.minimumMatches,
              })}
        </span>
        <Link to="/player-dna" className="text-primary underline-offset-2 hover:underline">
          {t("evolution.dna.open")}
        </Link>
      </div>
    </ChartCard>
  );
}
