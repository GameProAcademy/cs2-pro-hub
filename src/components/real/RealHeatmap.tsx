/**
 * PM1 / 4.2.2 — spatial heatmap page. Renders `spatial-heatmap-v1` and nothing else: the layer's
 * documented position, plotted counts with coverage, exclusions by reason, layers not measured,
 * and a drill-down to round/tick. Absence is a state, never a zero; an unvalidated map draws
 * nothing. The background is a neutral grid in the radar's coordinate space (radar art is
 * Valve's; not embedded pending an owner decision).
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapTierBadge, useOverviewMapRanking } from "@/components/cs2/BestMap";
import { MapIdentityPanel } from "@/components/cs2/MapIdentity";
import { CircleDashed, MapPinned } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { GameIcon } from "@/components/common/GameIcon";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SaveMomentButton } from "@/components/moments/SaveMoment";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { MatchSelectSlot, MaybePageHeader, MaybeShell } from "@/components/real/MatchScope";
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
import { mapDisplayName, normalizeMapCode } from "@/lib/cs2/maps";
import { tierOf, type MapRanking } from "@/lib/maps/mapRanking";
import { MapTile } from "@/components/common/GameVisuals";
import { MapArt, MapEmblem } from "@/components/cs2/Cs2Art";
import { cn } from "@/lib/utils";
import { MAP_OVERVIEWS, RADAR_SIZE, mapSupport, type MapLevel } from "@/lib/spatial/maps";
import { radarAsset } from "@/lib/spatial/radarAssets";
import {
  getSpatialHeatmap,
  type SpatialHeatmapResponse,
  type SpatialMapOption,
  type SpatialMatchOption,
} from "@/lib/spatial.functions";
import { CoachWordCard } from "@/components/coachWord/CoachWordCard";

export interface HeatmapSearch {
  map?: string | undefined;
  layer?: HeatmapLayer | undefined;
  side?: SideFilter | undefined;
  level?: MapLevel | undefined;
  matchId?: string | undefined;
  weapon?: string | undefined;
}

export const spatialQueryKey = (s: HeatmapSearch) => ["player", "spatial", s] as const;

const HEATMAP_SEARCH_KEYS = ["map", "layer", "side", "level", "matchId", "weapon"] as const;

/**
 * Only the documented filters reach the server function (its input is strict): an unrelated URL
 * parameter (e.g. `?utm_source=` or a cache-buster) must never turn the page into an error.
 */
export const clean = (s: HeatmapSearch) =>
  Object.fromEntries(
    HEATMAP_SEARCH_KEYS.flatMap((k) => (s[k] === undefined ? [] : [[k, s[k]]])),
  ) as HeatmapSearch;

export function RealHeatmapPage({
  search,
  onSearch,
}: {
  search: HeatmapSearch;
  onSearch: (next: HeatmapSearch) => void;
}) {
  const t = useT();
  // Default map view is the player's eliminations; an explicit URL/filter choice always wins.
  const effectiveSearch: HeatmapSearch = { ...clean(search), layer: search.layer ?? "KILLS" };
  const query = useQuery({
    queryKey: spatialQueryKey(effectiveSearch),
    queryFn: () => getSpatialHeatmap({ data: clean(effectiveSearch) }),
  });
  return (
    <MaybeShell>
      <div className="space-y-6">
        <MaybePageHeader
          eyebrow={t("spatial.eyebrow")}
          title={t("spatial.title")}
          description={t("spatial.description")}
        />
        {/* Standalone /maps only (inside the Match Room the match summary has its own). */}
        <MatchSelectSlot>
          <CoachWordCard section="maps" />
        </MatchSelectSlot>
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
    </MaybeShell>
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
  // VGL 5.0: one ranking (map-rank-v1) for the identity panel and the gallery labels.
  const ranking = useOverviewMapRanking();
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
      <MatchSelectSlot>
        <MapGallery
          maps={r.maps}
          current={h.map}
          onPick={(map) => onSearch({ map })}
          ranking={ranking}
        />
        <BestMapIdentity ranking={ranking} maps={r.maps} fallback={h} />
      </MatchSelectSlot>
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
      <SecondaryInfo h={h} />
    </div>
  );
}

/**
 * VGL 5.1 (Frente 11) — the secondary information of every map view (Maps page and the Match
 * Room "Map" tab), at the end, as three cards of one pattern: Legend · Off the map · Not measured
 * in this version. Each card is an accordion, closed by default (Radix: aria-expanded, keyboard).
 */
function SecondaryInfo({ h }: { h: HeatmapResult }) {
  const t = useT();
  const supported = h.support === "SUPPORTED";
  const max = h.cells.reduce((m, c) => Math.max(m, c.count), 0);
  const cards: Array<{
    id: string;
    icon: Parameters<typeof GameIcon>[0]["name"];
    title: string;
    body: React.ReactNode;
  }> = [
    ...(supported
      ? [
          {
            id: "legend",
            icon: "map" as const,
            title: t("spatial.legend.title"),
            body: <LegendBody h={h} max={max} />,
          },
          {
            id: "excluded",
            icon: "alert" as const,
            title: t("spatial.excluded.title"),
            body: <ExcludedBody h={h} />,
          },
        ]
      : []),
    {
      id: "not-measured",
      icon: "clock" as const,
      title: t("spatial.notMeasured.title"),
      body: <NotMeasuredBody h={h} />,
    },
  ];
  return (
    <div className="grid items-start gap-4 lg:grid-cols-3" data-map-secondary>
      {cards.map((c) => (
        <Accordion
          key={c.id}
          type="single"
          collapsible
          className="surface-panel rounded-xl border border-border px-4"
          data-map-secondary-card={c.id}
        >
          <AccordionItem value={c.id} className="border-b-0">
            <AccordionTrigger className="min-h-12 gap-3 py-3 font-display text-sm font-semibold uppercase tracking-wide text-foreground hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-md border border-border bg-background/60 text-muted-foreground">
                  <GameIcon name={c.icon} className="size-4" />
                </span>
                {c.title}
              </span>
            </AccordionTrigger>
            <AccordionContent forceMount className="pb-4 [[data-state=closed]>&]:hidden">
              {c.body}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ))}
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

/**
 * VGL 2.0: the player's maps as in-game scenes. Same choice as the map select (same handler);
 * each card shows the real number of matches and the support state the server returned.
 */
/**
 * VGL 5.0: the "selected map" panel now presents the player's BEST map (map-rank-v1). Before a
 * map can be ranked, it keeps showing the selected map with the honest "waiting" state.
 */
function BestMapIdentity({
  ranking,
  maps,
  fallback,
}: {
  ranking: MapRanking | null;
  maps: SpatialMapOption[];
  fallback: HeatmapResult;
}) {
  const best = ranking?.best ?? null;
  const raw = best ? (maps.find((m) => normalizeMapCode(m.map) === best.map)?.map ?? null) : null;
  if (best && raw)
    return <MapIdentityPanel map={raw} support={mapSupport(raw).status} rank={best} />;
  return (
    <MapIdentityPanel map={fallback.map} support={fallback.support} rankingState={ranking?.state} />
  );
}

function MapGallery({
  maps,
  current,
  onPick,
  ranking,
}: {
  maps: SpatialMapOption[];
  current: string;
  onPick: (map: string) => void;
  ranking: MapRanking | null;
}) {
  const t = useT();
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-map-gallery>
      {maps.map((m, i) => (
        <li key={m.map} className="vgl-rise" style={{ "--vgl-i": i } as CSSProperties}>
          <button
            type="button"
            onClick={() => onPick(m.map)}
            aria-pressed={m.map === current}
            className={cn(
              "vgl-lift block w-full overflow-hidden rounded-xl border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              m.map === current
                ? "border-primary shadow-[0_0_0_1px_var(--primary),0_12px_32px_-14px_var(--primary)]"
                : "border-border hover:border-primary/50",
            )}
            data-map-gallery-item={m.map}
          >
            <MapArt
              map={m.map}
              overlay="soft"
              className="flex h-24 items-end justify-between gap-2 px-3 pb-2"
            >
              <MapEmblem map={m.map} className="size-10" />
              {m.map === current ? (
                <span
                  className="absolute left-2 top-2 rounded-md bg-primary px-1.5 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide text-primary-foreground"
                  data-map-selected
                >
                  {t("vgl3.maps.selected")}
                </span>
              ) : null}
              <span className="rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-xs tabular-nums text-foreground">
                {m.matches}
              </span>
            </MapArt>
            <span className="block truncate bg-card px-3 py-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
              {mapDisplayName(m.map)}
              {(() => {
                const rank = ranking ? tierOf(ranking, m.map) : null;
                return rank ? (
                  <MapTierBadge rank={rank} className="mt-1 flex w-fit font-sans normal-case" />
                ) : null;
              })()}
              {m.support !== "SUPPORTED" ? (
                <span className="block font-sans text-xs font-normal normal-case tracking-normal text-muted-foreground">
                  {t(`spatial.support.${m.support}` as TranslationKey)}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
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
      {/* In the Match Room the map and the match are fixed by the room. */}
      <MatchSelectSlot>
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
      </MatchSelectSlot>
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
  // UX-1.9a: every map cell is also reachable from this list (WCAG 2.5.8 "equivalent"
  // control): the map's cells are smaller than 24 px on phones.
  const [showAll, setShowAll] = useState(false);
  const top = useMemo(
    () =>
      [...h.cells]
        .sort((a, b) => b.count - a.count || a.cell - b.cell)
        .slice(0, showAll ? undefined : 10),
    [h.cells, showAll],
  );
  const showShare =
    h.perRound.status !== "INSUFFICIENT_SAMPLE" && h.perRound.status !== "UNAVAILABLE";
  return (
    // VGL 5.1 (Frente 11): map | "cells with most events" side by side, the selected cell's
    // events right below across both columns. (The previous column class carried a stray
    // ", showAll" that made Tailwind drop it, so everything stacked.)
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start"
      data-map-main
    >
      <ChartCard
        title={t(`spatial.layer.${h.layer}`)}
        subtitle={t(`spatial.layer.${h.layer}.semantics`)}
        icon="map"
        actions={<MapTile map={h.map} size="sm" showName />}
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
      {h.cells.length ? (
        <ChartCard title={t("spatial.cells.title")} className="lg:sticky lg:top-4">
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
          {h.cells.length > 10 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? t("spatial.cells.showTop")
                : fill(t("spatial.cells.showAll"), { n: h.cells.length })}
            </Button>
          ) : null}
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

function LegendBody({ h, max }: { h: HeatmapResult; max: number }) {
  const t = useT();
  const { intlTag } = useI18n();
  const cov = h.events.coverage;
  return (
    <div data-map-legend>
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
      <p className="mt-2 text-xs text-muted-foreground">
        {fill(t("spatial.version"), { version: h.version, transform: h.transformVersion })}
      </p>
    </div>
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

function ExcludedBody({ h }: { h: HeatmapResult }) {
  const t = useT();
  const entries = Object.entries(h.excluded) as Array<[ExclusionReason, number]>;
  return (
    <div>
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
    </div>
  );
}

function NotMeasuredBody({ h }: { h: HeatmapResult }) {
  const t = useT();
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">{t("spatial.notMeasured.note")}</p>
      <ul className="grid gap-1 text-sm text-muted-foreground" data-not-measured>
        {h.notMeasured.map((l) => (
          <li key={l.layer}>
            <span aria-hidden>{NOT_AVAILABLE_MARK} </span>
            {t(`spatial.notMeasured.${l.layer}`)}
          </li>
        ))}
      </ul>
    </div>
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
                  <th className="py-1" />
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
                    <td className="py-1 text-right">
                      {e.tick !== null ? (
                        <span className="inline-flex items-center gap-2">
                          <Link
                            to="/replay"
                            search={{ matchId: e.matchId, round: e.round, tick: e.tick }}
                            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                            data-replay-link
                          >
                            {t("combat.openReplay")}
                          </Link>
                          <SaveMomentButton
                            compact
                            matchId={e.matchId}
                            round={e.round}
                            tick={e.tick}
                            kind={h.layer === "DEATHS" ? "DEATH" : "KILL"}
                            source="MAPS"
                            defaultTitle={`${fill(t("rounds.roundN"), { n: e.round })} · ${h.map}`}
                          />
                        </span>
                      ) : null}
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
