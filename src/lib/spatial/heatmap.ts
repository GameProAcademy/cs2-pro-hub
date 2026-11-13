/**
 * PM1 / 4.2.2 — spatial heatmap read model (`spatial-heatmap-v1`). Pure and deterministic.
 *
 * Source: `round_events` rows of type `kill` (one per death), whose `data.position` is the
 * attacker's position and `data.victim_position` the victim's position, both AT THE DEATH TICK
 * (parser R5.8.24, spatial-v1 layer A). These are point samples tied to a death: they are not a
 * trajectory, presence, occupancy, route or exposure time, and nothing here interpolates them.
 *
 * Layers (each with one documented position; never mixed under a generic "kill location"):
 *  - DEATHS: the caller's own deaths, at the caller's (victim) position at the death tick.
 *  - KILLS: the caller's eliminations, at the caller's (attacker) position at the death tick.
 * Not measured (no position source, or forbidden by L02): damage dealt/received positions,
 * presence/density over time, routes, utility throw/landing. They are listed with their reason
 * and never computed.
 *
 * Side: the caller's side in that round from `round-context-v1` (`round_players.side`), never
 * inferred; UNKNOWN side is kept out of the CT/T filters and counted.
 */
import { envelope, type EvidenceRef, type MetricEnvelope } from "@/lib/metrics/metricContract";
import type { PlayerRound } from "@/lib/roundContext";
import {
  RADAR_SIZE,
  RADAR_TRANSFORM_VERSION,
  mapSupport,
  normalizeMapName,
  readWorldPosition,
  worldToRadar,
  type MapLevel,
  type MapSupport,
  type PositionRejection,
} from "@/lib/spatial/maps";

export const SPATIAL_HEATMAP_VERSION = "spatial-heatmap-v1";
/** Cells per side: 32 × 32 cells of 32 radar px (≈ 140–225 world units, depending on the map). */
export const HEATMAP_GRID = 32;
export const HEATMAP_CELL_PX = RADAR_SIZE / HEATMAP_GRID;
/**
 * Below this many plotted events, shares and per-round rates are withheld (INSUFFICIENT_SAMPLE);
 * points and raw counts are always shown. Declared heuristic, like DNA_MIN_EVENT_SAMPLE.
 */
export const HEATMAP_MIN_EVENTS = 10;
/** Hard cap of points returned for drill-down; counts stay complete when it is hit. */
export const HEATMAP_MAX_POINTS = 5000;

export const MEASURED_LAYERS = ["DEATHS", "KILLS"] as const;
export type HeatmapLayer = (typeof MEASURED_LAYERS)[number];

export const LAYER_SEMANTICS: Readonly<
  Record<HeatmapLayer, { entity: "victim" | "attacker"; field: string; tick: string }>
> = {
  DEATHS: { entity: "victim", field: "round_events.data.victim_position", tick: "death tick" },
  KILLS: { entity: "attacker", field: "round_events.data.position", tick: "death tick" },
};

/** Layers the specification lists that this release does not measure, and why. */
export const NOT_MEASURED_LAYERS = [
  { layer: "DAMAGE_DEALT", reason: "NO_POSITION_ON_DAMAGE_EVENTS" },
  { layer: "DAMAGE_RECEIVED", reason: "NO_POSITION_ON_DAMAGE_EVENTS" },
  { layer: "PRESENCE", reason: "L02_NO_CONTINUOUS_POSITION_SOURCE" },
  { layer: "ROUTES", reason: "L02_NO_CONTINUOUS_POSITION_SOURCE" },
  { layer: "EXPOSURE_TIME", reason: "L02_NO_CONTINUOUS_POSITION_SOURCE" },
  { layer: "UTILITY", reason: "NO_UTILITY_POSITION_SOURCE" },
] as const;

export type SideFilter = "ALL" | "CT" | "T";

export interface HeatmapEventRow {
  id: string;
  matchId: string;
  round: number | null;
  tick: number | null;
  type: string;
  actor: string | null;
  victim: string | null;
  weapon: string | null;
  headshot: boolean | null;
  data: unknown;
}

export interface HeatmapMatchInput {
  matchId: string;
  map: string | null;
  /** The caller's own participant key in this match. */
  participantKey: string;
  /** The caller's rounds with side (round-context-v1). */
  rounds: PlayerRound[];
  events: HeatmapEventRow[];
}

export interface HeatmapFilters {
  map: string;
  layer: HeatmapLayer;
  side: SideFilter;
  level: MapLevel;
  /** Optional: only these matches (already owned by the caller). */
  matchIds?: string[] | undefined;
  /** Optional: exact weapon name as persisted. */
  weapon?: string | undefined;
}

export type ExclusionReason = PositionRejection | "SIDE_UNKNOWN" | "OTHER_LEVEL" | "UNKNOWN_MAP";

export interface HeatmapPoint {
  id: string;
  matchId: string;
  round: number;
  tick: number | null;
  side: "CT" | "T" | "UNKNOWN";
  weapon: string | null;
  headshot: boolean | null;
  /** Radar pixels (0..1024), rounded to 0.1. */
  x: number;
  y: number;
  cell: number;
}

export interface HeatmapCell {
  cell: number;
  col: number;
  row: number;
  count: number;
}

export interface HeatmapResult {
  version: typeof SPATIAL_HEATMAP_VERSION;
  transformVersion: typeof RADAR_TRANSFORM_VERSION;
  map: string;
  support: MapSupport["status"];
  layer: HeatmapLayer;
  semantics: (typeof LAYER_SEMANTICS)[HeatmapLayer];
  filters: { side: SideFilter; level: MapLevel; weapon: string | null; matches: number };
  /** Plotted events, with coverage over the eligible events (own deaths / own kills). */
  events: MetricEnvelope;
  /** Eligible events that are not plotted, by reason (never drawn at (0,0)). */
  excluded: Partial<Record<ExclusionReason, number>>;
  /** Own rounds in the filtered matches with the filtered side (per-round denominator). */
  rounds: number;
  /** Per-round rate of plotted events; INSUFFICIENT_SAMPLE below HEATMAP_MIN_EVENTS. */
  perRound: MetricEnvelope;
  grid: { size: number; cellPx: number };
  cells: HeatmapCell[];
  points: HeatmapPoint[];
  pointsTruncated: boolean;
  /** Plotted events on each level, for maps with two levels. */
  levels: Partial<Record<MapLevel, number>>;
  weapons: string[];
  notMeasured: typeof NOT_MEASURED_LAYERS;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Pure: the caller's heatmap for one map and layer. */
export function buildHeatmap(matches: HeatmapMatchInput[], f: HeatmapFilters): HeatmapResult {
  const support = mapSupport(f.map);
  const semantics = LAYER_SEMANTICS[f.layer];
  const excluded: Partial<Record<ExclusionReason, number>> = {};
  const exclude = (r: ExclusionReason) => (excluded[r] = (excluded[r] ?? 0) + 1);
  const wanted = f.matchIds ? new Set(f.matchIds) : null;
  const mapName = normalizeMapName(f.map);
  const inScope = [...new Map(matches.map((m) => [m.matchId, m])).values()].filter(
    (m) =>
      (!wanted || wanted.has(m.matchId)) && mapName !== null && normalizeMapName(m.map) === mapName,
  );
  const seen = new Set<string>();
  const points: HeatmapPoint[] = [];
  const counts = new Map<number, number>();
  const levels: Partial<Record<MapLevel, number>> = {};
  const weapons = new Set<string>();
  let eligible = 0;
  let rounds = 0;

  for (const m of inScope) {
    const sideOf = new Map(m.rounds.map((r) => [r.round, r.side]));
    rounds += m.rounds.filter((r) => f.side === "ALL" || r.side === f.side).length;
    for (const e of m.events) {
      if (e.type !== "kill" || e.round == null) continue;
      if (seen.has(e.id)) continue; // the same persisted event read twice counts once
      const own =
        f.layer === "DEATHS" ? e.victim === m.participantKey : e.actor === m.participantKey;
      if (!own) continue;
      if (e.weapon) weapons.add(e.weapon);
      if (f.weapon && e.weapon !== f.weapon) continue;
      const side = sideOf.get(e.round) ?? "UNKNOWN";
      if (f.side !== "ALL" && side !== f.side) {
        if (side === "UNKNOWN") {
          seen.add(e.id);
          eligible++;
          exclude("SIDE_UNKNOWN");
        }
        continue;
      }
      seen.add(e.id);
      eligible++;
      if (!support.overview) {
        exclude("UNKNOWN_MAP");
        continue;
      }
      const data = (e.data && typeof e.data === "object" ? e.data : {}) as Record<string, unknown>;
      const read = readWorldPosition(data[f.layer === "DEATHS" ? "victim_position" : "position"]);
      if (!read.ok) {
        exclude(read.reason);
        continue;
      }
      const radar = worldToRadar(support.overview, read.position);
      if (!radar.ok) {
        exclude(radar.reason);
        continue;
      }
      levels[radar.point.level] = (levels[radar.point.level] ?? 0) + 1;
      if (radar.point.level !== f.level) {
        exclude("OTHER_LEVEL");
        continue;
      }
      const col = Math.min(HEATMAP_GRID - 1, Math.floor(radar.point.x / HEATMAP_CELL_PX));
      const row = Math.min(HEATMAP_GRID - 1, Math.floor(radar.point.y / HEATMAP_CELL_PX));
      const cell = row * HEATMAP_GRID + col;
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
      points.push({
        id: e.id,
        matchId: m.matchId,
        round: e.round,
        tick: e.tick,
        side,
        weapon: e.weapon,
        headshot: e.headshot,
        x: round1(radar.point.x),
        y: round1(radar.point.y),
        cell,
      });
    }
  }

  points.sort(
    (a, b) =>
      a.matchId.localeCompare(b.matchId) ||
      a.round - b.round ||
      (a.tick ?? 0) - (b.tick ?? 0) ||
      a.id.localeCompare(b.id),
  );
  // Evidence: the first plotted events in a stable order (match, round, tick, id).
  const refs: EvidenceRef[] = points.slice(0, 20).map((p) => ({
    matchId: p.matchId,
    round: p.round,
    ...(p.tick != null ? { tick: p.tick } : {}),
  }));
  const plotted = points.length;
  // Coverage of the layer: eligible events whose position could be drawn on this level.
  // Events on the other level are valid, just not on this plane: they leave the denominator.
  const otherLevel = excluded.OTHER_LEVEL ?? 0;
  const coverage = { measured: plotted, eligible: eligible - otherLevel };
  const key = `spatial.${f.layer.toLowerCase()}_positions`;
  const method = `${SPATIAL_HEATMAP_VERSION}; ${semantics.field} at the ${semantics.tick}; ${RADAR_TRANSFORM_VERSION} (${support.overview?.sourcePath ?? "no overview"})`;
  const sample = { n: coverage.eligible, unit: "eligible events" };
  let events: MetricEnvelope;
  if (support.status !== "SUPPORTED")
    events = envelope({
      metric_key: key,
      value: null,
      unit: "count",
      status: "UNAVAILABLE",
      provenance_method: `${method}; map ${support.status}`,
      sample_size: sample,
      coverage: null,
      evidence_refs: [],
    });
  else if (coverage.eligible === 0)
    events = envelope({
      metric_key: key,
      value: null,
      unit: "count",
      status: "NOT_OBSERVED",
      provenance_method: method,
      sample_size: null,
      coverage: null,
      evidence_refs: [],
    });
  else if (plotted === 0)
    events = envelope({
      metric_key: key,
      value: null,
      unit: "count",
      status: "UNAVAILABLE",
      provenance_method: `${method}; no eligible event has a valid position`,
      sample_size: sample,
      coverage,
      evidence_refs: [],
    });
  else
    events = envelope({
      metric_key: key,
      value: plotted,
      unit: "count",
      status: plotted < coverage.eligible ? "PARTIAL" : "OBSERVED",
      provenance_method: method,
      sample_size: sample,
      coverage,
      evidence_refs: refs,
    });

  const perRoundKey = `${key}_per_round`;
  const perRound =
    plotted >= HEATMAP_MIN_EVENTS && rounds > 0 && support.status === "SUPPORTED"
      ? envelope({
          metric_key: perRoundKey,
          value: Math.round((plotted / rounds) * 100) / 100,
          unit: "events per round",
          status: plotted < coverage.eligible ? "PARTIAL" : "DERIVED",
          provenance_method: `${method}; plotted events / own rounds (${f.side})`,
          sample_size: { n: rounds, unit: "rounds" },
          coverage: plotted < coverage.eligible ? coverage : null,
          evidence_refs: [],
        })
      : envelope({
          metric_key: perRoundKey,
          value: null,
          unit: "events per round",
          status: support.status !== "SUPPORTED" ? "UNAVAILABLE" : "INSUFFICIENT_SAMPLE",
          provenance_method: `${method}; minimum ${HEATMAP_MIN_EVENTS} plotted events`,
          sample_size: { n: plotted, unit: "plotted events" },
          coverage: null,
          evidence_refs: [],
        });

  const cells: HeatmapCell[] = [...counts]
    .sort(([a], [b]) => a - b)
    .map(([cell, count]) => ({
      cell,
      col: cell % HEATMAP_GRID,
      row: Math.floor(cell / HEATMAP_GRID),
      count,
    }));

  return {
    version: SPATIAL_HEATMAP_VERSION,
    transformVersion: RADAR_TRANSFORM_VERSION,
    map: support.overview?.map ?? f.map,
    support: support.status,
    layer: f.layer,
    semantics,
    filters: { side: f.side, level: f.level, weapon: f.weapon ?? null, matches: inScope.length },
    events,
    excluded,
    rounds,
    perRound,
    grid: { size: HEATMAP_GRID, cellPx: HEATMAP_CELL_PX },
    cells: support.status === "SUPPORTED" ? cells : [],
    points: support.status === "SUPPORTED" ? points.slice(0, HEATMAP_MAX_POINTS) : [],
    pointsTruncated: support.status === "SUPPORTED" && points.length > HEATMAP_MAX_POINTS,
    levels,
    weapons: [...weapons].sort(),
    notMeasured: NOT_MEASURED_LAYERS,
  };
}
