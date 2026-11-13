/**
 * PM1 / 4.2.2 — spatial heatmap page. Renders `spatial-heatmap-v1` and nothing else: the layer's
 * documented position, plotted counts with coverage, exclusions by reason, layers not measured,
 * and a drill-down to round/tick. Absence is a state, never a zero; an unvalidated map draws
 * nothing. The background is a neutral grid in the radar's coordinate space (radar art is
 * Valve's; not embedded pending an owner decision).
 */
import { useQuery } from "@tanstack/react-query";
import { CircleDashed, MapPinned } from "lucide-react";
import { useMemo, useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { AppShell } from "@/components/layout/AppShell";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { NOT_AVAILABLE_MARK, fill, formatDate, formatNumber } from "@/lib/format";
import {
  HEATMAP_MAX_POINTS,
  HEATMAP_MIN_EVENTS,
  type ExclusionReason,
  type HeatmapLayer,
  type HeatmapResult,
  type SideFilter,
} from "@/lib/spatial/heatmap";
import { mapDisplayName } from "@/lib/cs2/maps";
import { MAP_OVERVIEWS, RADAR_SIZE, type MapLevel } from "@/lib/spatial/maps";
import { radarAsset } from "@/lib/spatial/radarAssets";
import {
  getSpatialHeatmap,
  type SpatialHeatmapResponse,
  type SpatialMapOption,
  type SpatialMatchOption,
} from "@/lib/spatial.functions";

export interface HeatmapSearch {
  map?: string | undefined;
  layer?: HeatmapLayer | undefined;
  side?: SideFilter | undefined;
  level?: MapLevel | undefined;
  matchId?: string | undefined;
  weapon?: string | undefined;
}

export const spatialQueryKey = (s: HeatmapSearch) => ["player", "spatial", s] as const;

const clean = (s: HeatmapSearch) =>
  Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as HeatmapSearch;

export function RealHeatmapPage({
  search,
  onSearch,
}: {
  search: HeatmapSearch;
  onSearch: (next: HeatmapSearch) => void;
}) {
  const t = useT();
  const query = useQuery({
    queryKey: spatialQueryKey(clean(search)),
    queryFn: () => getSpatialHeatmap({ data: clean(search) }),
  });
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("spatial.eyebrow")}
          title={t("spatial.title")}
          description={t("spatial.description")}
        />
        {query.isPending ? (
          <LoadingState />
        ) : query.isError || !query.data ? (
          <ErrorState
            title={t("real.error.title")}
            description={t("real.error.description")}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <HeatmapBody r={query.data} search={search} onSearch={onSearch} />
        )}
      </div>
    </AppShell>
  );
}

export function HeatmapBody({
  r,
  search,
  onSearch,
}: {
  r: SpatialHeatmapResponse;
  search: HeatmapSearch;
  onSearch: (next: HeatmapSearch) => void;
}) {
  const t = useT();
  if (!r.heatmap || !r.maps.length)
    return (
      <EmptyState
        icon={<CircleDashed className="size-5" aria-hidden />}
        title={t("spatial.empty.title")}
        description={t("spatial.empty.description")}
      />
    );
  const h = r.heatmap;
  return (
    <div className="space-y-6" data-heatmap-status={h.events.status} data-map-support={h.support}>
      <Filters r={r} h={h} search={search} onSearch={onSearch} />
      {h.support !== "SUPPORTED" ? (
        <EmptyState
          icon={<MapPinned className="size-5" aria-hidden />}
          title={t("spatial.unsupported.title")}
          description={t(`spatial.unsupported.${h.support}` as TranslationKey)}
        />
      ) : (
        <SupportedHeatmap h={h} matches={r.matches} />
      )}
      <NotMeasured h={h} />
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  name,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      <span className="font-mono uppercase tracking-[0.12em]">{label}</span>
      <select
        name={name}
        className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Filters({
  r,
  h,
  search,
  onSearch,
}: {
  r: SpatialHeatmapResponse;
  h: HeatmapResult;
  search: HeatmapSearch;
  onSearch: (next: HeatmapSearch) => void;
}) {
  const t = useT();
  const { intlTag } = useI18n();
  const set = (patch: HeatmapSearch) => onSearch({ ...search, ...patch });
  const hasLower = MAP_OVERVIEWS[h.map]?.lowerLevelMaxZ != null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Select<string>
        name="map"
        label={t("spatial.filter.map")}
        value={h.map}
        options={r.maps.map((m: SpatialMapOption) => ({
          value: m.map,
          label:
            m.support === "SUPPORTED"
              ? `${mapDisplayName(m.map)} (${m.matches})`
              : `${mapDisplayName(m.map)} (${m.matches}) · ${t(`spatial.support.${m.support}` as TranslationKey)}`,
        }))}
        onChange={(map) => onSearch({ map })}
      />
      <Select<string>
        name="match"
        label={t("spatial.filter.match")}
        value={search.matchId ?? ""}
        options={[
          { value: "", label: fill(t("spatial.filter.allMatches"), { n: r.matches.length }) },
          ...r.matches.map((m: SpatialMatchOption) => ({
            value: m.matchId,
            label: formatDate(m.playedAt, intlTag),
          })),
        ]}
        onChange={(matchId) => set({ matchId: matchId || undefined })}
      />
      <Select<HeatmapLayer>
        name="layer"
        label={t("spatial.filter.layer")}
        value={h.layer}
        options={(["DEATHS", "KILLS"] as const).map((l) => ({
          value: l,
          label: t(`spatial.layer.${l}`),
        }))}
        onChange={(layer) => set({ layer })}
      />
      <Select<SideFilter>
        name="side"
        label={t("spatial.filter.side")}
        value={h.filters.side}
        options={(["ALL", "CT", "T"] as const).map((s) => ({
          value: s,
          label: t(`spatial.side.${s}`),
        }))}
        onChange={(side) => set({ side })}
      />
      {hasLower ? (
        <Select<MapLevel>
          name="level"
          label={t("spatial.filter.level")}
          value={h.filters.level}
          options={(["default", "lower"] as const).map((l) => ({
            value: l,
            label: t(`spatial.level.${l}`),
          }))}
          onChange={(level) => set({ level })}
        />
      ) : null}
      <Select<string>
        name="weapon"
        label={t("spatial.filter.weapon")}
        value={search.weapon ?? ""}
        options={[
          { value: "", label: t("spatial.filter.allWeapons") },
          ...h.weapons.map((w) => ({ value: w, label: w })),
        ]}
        onChange={(weapon) => set({ weapon: weapon || undefined })}
      />
    </div>
  );
}

function SupportedHeatmap({ h, matches }: { h: HeatmapResult; matches: SpatialMatchOption[] }) {
  const t = useT();
  const { intlTag } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  const plotted = h.events.value ?? 0;
  const max = useMemo(() => h.cells.reduce((m, c) => Math.max(m, c.count), 0), [h.cells]);
  const top = useMemo(
    () => [...h.cells].sort((a, b) => b.count - a.count || a.cell - b.cell).slice(0, 10),
    [h.cells],
  );
  const showShare =
    h.perRound.status !== "INSUFFICIENT_SAMPLE" && h.perRound.status !== "UNAVAILABLE";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <ChartCard
        title={t(`spatial.layer.${h.layer}`)}
        subtitle={t(`spatial.layer.${h.layer}.semantics`)}
      >
        <StatusNote h={h} />
        {h.cells.length ? (
          <HeatmapSvg h={h} max={max} selected={selected} onSelect={setSelected} />
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            radarAsset(h.map, h.filters.level)
              ? "spatial.legend.background"
              : "spatial.legend.backgroundGrid",
          )}{" "}
          {t("spatial.legend.points")}
        </p>
      </ChartCard>
      <div className="space-y-6">
        <Legend h={h} max={max} />
        <Excluded h={h} />
      </div>
      {h.cells.length ? (
        <ChartCard title={t("spatial.cells.title")}>
          <ol className="space-y-1 text-sm" data-cells-list>
            {top.map((c) => (
              <li key={c.cell}>
                <button
                  type="button"
                  className="flex w-full justify-between gap-3 rounded px-2 py-1 text-left hover:bg-secondary aria-pressed:bg-secondary"
                  aria-pressed={selected === c.cell}
                  onClick={() => setSelected(c.cell)}
                >
                  <span>{fill(t("spatial.cells.cell"), { col: c.col + 1, row: c.row + 1 })}</span>
                  <span className="font-mono text-muted-foreground">
                    {c.count}
                    {showShare
                      ? ` · ${fill(t("spatial.cells.share"), { share: formatNumber((c.count / plotted) * 100, intlTag, 1) })}`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </ChartCard>
      ) : null}
      {h.cells.length ? <DrillDown h={h} cell={selected} matches={matches} /> : null}
    </div>
  );
}

function StatusNote({ h }: { h: HeatmapResult }) {
  const t = useT();
  const cov = h.events.coverage;
  const text =
    h.events.status === "PARTIAL" && cov
      ? fill(t("spatial.status.PARTIAL"), { measured: cov.measured, eligible: cov.eligible })
      : h.events.status === "OBSERVED" && cov
        ? fill(t("spatial.status.OBSERVED"), { eligible: cov.eligible })
        : h.events.status === "NOT_OBSERVED" || h.events.status === "UNAVAILABLE"
          ? t(`spatial.status.${h.events.status}`)
          : null;
  if (!text) return null;
  return (
    <p className="mb-3 text-sm text-muted-foreground" data-status-note={h.events.status}>
      {text}
    </p>
  );
}

function HeatmapSvg({
  h,
  max,
  selected,
  onSelect,
}: {
  h: HeatmapResult;
  max: number;
  selected: number | null;
  onSelect: (cell: number) => void;
}) {
  const t = useT();
  const px = h.grid.cellPx;
  const gridLines = Array.from({ length: 9 }, (_, i) => i * (RADAR_SIZE / 8));
  // The background comes from the radar asset registry; the engine only knows radar coordinates.
  const background = radarAsset(h.map, h.filters.level);
  return (
    <svg
      viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
      className="aspect-square w-full max-w-[640px] rounded-md border border-border bg-secondary/40"
      role="group"
      aria-label={fill(t("spatial.map.aria"), {
        layer: t(`spatial.layer.${h.layer}`),
        map: mapDisplayName(h.map),
      })}
      data-heatmap-svg
    >
      {background ? (
        <image
          href={background.src}
          x={0}
          y={0}
          width={RADAR_SIZE}
          height={RADAR_SIZE}
          preserveAspectRatio="none"
          data-radar-asset={background.src}
        />
      ) : null}
      {(background ? [] : gridLines).map((v) => (
        <g key={v} className="stroke-border" strokeWidth={1}>
          <line x1={v} y1={0} x2={v} y2={RADAR_SIZE} />
          <line x1={0} y1={v} x2={RADAR_SIZE} y2={v} />
        </g>
      ))}
      {h.cells.map((c) => (
        <rect
          key={c.cell}
          x={c.col * px}
          y={c.row * px}
          width={px}
          height={px}
          className={h.layer === "DEATHS" ? "fill-destructive" : "fill-primary"}
          fillOpacity={0.15 + 0.5 * (c.count / max)}
          stroke={selected === c.cell ? "currentColor" : "none"}
          strokeWidth={selected === c.cell ? 4 : 0}
          tabIndex={0}
          role="button"
          aria-pressed={selected === c.cell}
          aria-label={fill(t("spatial.map.cellAria"), {
            col: c.col + 1,
            row: c.row + 1,
            n: c.count,
          })}
          onClick={() => onSelect(c.cell)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(c.cell);
            }
          }}
          data-cell={c.cell}
          data-count={c.count}
        />
      ))}
      {h.points.map((p) => (
        <circle
          key={p.id}
          cx={p.x}
          cy={p.y}
          r={6}
          className={h.layer === "DEATHS" ? "fill-destructive" : "fill-primary"}
          stroke="black"
          strokeWidth={1.5}
          pointerEvents="none"
          data-point={p.id}
        />
      ))}
    </svg>
  );
}

function Legend({ h, max }: { h: HeatmapResult; max: number }) {
  const t = useT();
  const { intlTag } = useI18n();
  const cov = h.events.coverage;
  return (
    <ChartCard title={t("spatial.legend.title")}>
      <dl className="space-y-2 text-sm">
        <Row label={t("spatial.legend.events")}>
          {h.events.value === null ? (
            <span className="text-muted-foreground">{NOT_AVAILABLE_MARK}</span>
          ) : (
            <span className="font-mono">{h.events.value}</span>
          )}
        </Row>
        <Row label={t("spatial.legend.coverage")}>
          {cov ? (
            <span className="font-mono" data-coverage>
              {cov.measured}/{cov.eligible}
            </span>
          ) : (
            <span className="text-muted-foreground">{NOT_AVAILABLE_MARK}</span>
          )}
        </Row>
        <Row label={t("spatial.legend.perRound")}>
          {h.perRound.value !== null ? (
            <span className="font-mono">
              {fill(t("spatial.legend.perRoundValue"), {
                value: formatNumber(h.perRound.value, intlTag, 2),
                rounds: h.rounds,
              })}
            </span>
          ) : h.perRound.status === "INSUFFICIENT_SAMPLE" ? (
            <span className="text-muted-foreground" data-per-round="INSUFFICIENT_SAMPLE">
              {fill(t("spatial.legend.perRoundInsufficient"), {
                min: HEATMAP_MIN_EVENTS,
                n: h.events.value ?? 0,
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("spatial.legend.perRoundUnavailable")}</span>
          )}
        </Row>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        {fill(t("spatial.legend.cell"), { px: h.grid.cellPx, grid: h.grid.size })}
        {max ? ` ${fill(t("spatial.legend.max"), { n: max })}` : ""}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {fill(t("spatial.version"), { version: h.version, transform: h.transformVersion })}
      </p>
    </ChartCard>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Excluded({ h }: { h: HeatmapResult }) {
  const t = useT();
  const entries = Object.entries(h.excluded) as Array<[ExclusionReason, number]>;
  return (
    <ChartCard title={t("spatial.excluded.title")}>
      {entries.length ? (
        <ul className="space-y-1 text-sm" data-excluded>
          {entries.map(([reason, n]) => (
            <li key={reason} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t(`spatial.excluded.${reason}`)}</span>
              <span className="font-mono">{n}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("spatial.excluded.none")}</p>
      )}
    </ChartCard>
  );
}

function NotMeasured({ h }: { h: HeatmapResult }) {
  const t = useT();
  return (
    <ChartCard title={t("spatial.notMeasured.title")} subtitle={t("spatial.notMeasured.note")}>
      <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2" data-not-measured>
        {h.notMeasured.map((l) => (
          <li key={l.layer}>
            <span aria-hidden>{NOT_AVAILABLE_MARK} </span>
            {t(`spatial.notMeasured.${l.layer}`)}
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

export function DrillDown({
  h,
  cell,
  matches,
}: {
  h: HeatmapResult;
  cell: number | null;
  matches: SpatialMatchOption[];
}) {
  const t = useT();
  const { intlTag } = useI18n();
  const dateOf = new Map(matches.map((m) => [m.matchId, formatDate(m.playedAt, intlTag)]));
  const events = cell === null ? [] : h.points.filter((p) => p.cell === cell);
  return (
    <ChartCard title={t("spatial.drill.title")} className="lg:col-span-2">
      {cell === null ? (
        <p className="text-sm text-muted-foreground">{t("spatial.drill.hint")}</p>
      ) : (
        <div className="space-y-2" data-drill-cell={cell}>
          <p className="text-sm text-muted-foreground">
            {fill(t("spatial.drill.count"), { n: events.length })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">{t("spatial.drill.match")}</th>
                  <th className="py-1 pr-3">{t("spatial.drill.round")}</th>
                  <th className="py-1 pr-3">{t("spatial.drill.tick")}</th>
                  <th className="py-1 pr-3">{t("spatial.drill.side")}</th>
                  <th className="py-1 pr-3">{t("spatial.drill.weapon")}</th>
                  <th className="py-1">{t("spatial.drill.headshot")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-border" data-event-round={e.round}>
                    <td className="py-1 pr-3">{dateOf.get(e.matchId) ?? NOT_AVAILABLE_MARK}</td>
                    <td className="py-1 pr-3 font-mono">{e.round}</td>
                    <td className="py-1 pr-3 font-mono">{e.tick ?? NOT_AVAILABLE_MARK}</td>
                    <td className="py-1 pr-3">{t(`spatial.side.${e.side}`)}</td>
                    <td className="py-1 pr-3">{e.weapon ?? NOT_AVAILABLE_MARK}</td>
                    <td className="py-1">
                      {e.headshot === null
                        ? NOT_AVAILABLE_MARK
                        : t(e.headshot ? "spatial.drill.yes" : "spatial.drill.no")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {h.pointsTruncated ? (
            <p className="text-xs text-muted-foreground">
              {fill(t("spatial.drill.truncated"), { n: HEATMAP_MAX_POINTS })}
            </p>
          ) : null}
        </div>
      )}
    </ChartCard>
  );
}
