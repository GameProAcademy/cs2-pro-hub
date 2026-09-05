/**
 * Display context for per-map performance.
 *
 * The historical resolver in `maps.ts` stays the ONLY source of truth about the
 * Active Duty pool. This adapter translates a performance row (plus the date the
 * matches were played, when known) into everything the chart needs, so no visual
 * component ever re-implements pool rules.
 *
 * Honesty rules:
 * - absent data is absent (`hasData = false`), never 0%;
 * - a map is only flagged as "historical" when it really was in the pool on the
 *   match date and is not in the pool today;
 * - a map that was NOT in the pool on the match date is never presented as a
 *   valid Active Duty map of that period.
 */
import {
  mapDisplayName,
  normalizeMapCode,
  resolveMapPool,
  activeDutyMaps,
  type Cs2MapCode,
} from "@/lib/cs2/maps";
import type { MapPerformance } from "@/types";

/** Suffix used to mark "valid then, out of the pool now". */
export const HISTORICAL_MAP_MARKER = "*";

export interface MapPerformanceDisplayContext {
  /** Raw value as received (never rewritten). */
  map: string;
  code: Cs2MapCode | null;
  /** ISO date of the matches, when the caller knows it. */
  matchDate: string | null;
  /** Pool version effective at `matchDate`; null when the date is unknown. */
  historicalPoolVersion: number | null;
  isCurrentlyActive: boolean;
  /** null when the match date is unknown — we do not guess. */
  wasActiveAtMatchDate: boolean | null;
  /** Valid on the match date, out of the current pool. */
  isHistorical: boolean;
  /** In the pool neither then nor now (or unknown map). */
  isOutOfPool: boolean;
  hasData: boolean;
  winRate: number | null;
  matches: number;
  displayLabel: string;
  /** The original row, for callers that need the remaining metrics. */
  row: MapPerformance;
}

function isoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getMapPerformanceDisplayContext(
  row: MapPerformance,
  now: Date | string = new Date(),
): MapPerformanceDisplayContext {
  const code = normalizeMapCode(row.map);
  const matchDate = isoDate(row.matchDate ?? null);
  const currentPool = activeDutyMaps(now);
  const isCurrentlyActive = code !== null && currentPool.includes(code);

  const historicalPool = matchDate ? resolveMapPool(matchDate) : null;
  const wasActiveAtMatchDate =
    code === null || historicalPool === null ? null : historicalPool.activeDuty.includes(code);

  const hasData = row.matches > 0 && row.winRate !== null && row.winRate !== undefined;
  const isHistorical = wasActiveAtMatchDate === true && !isCurrentlyActive;
  const isOutOfPool = !isCurrentlyActive && wasActiveAtMatchDate !== true;

  const base = mapDisplayName(row.map);

  return {
    map: row.map,
    code,
    matchDate,
    historicalPoolVersion: historicalPool?.version ?? null,
    isCurrentlyActive,
    wasActiveAtMatchDate,
    isHistorical,
    isOutOfPool,
    hasData,
    winRate: hasData ? (row.winRate as number) : null,
    matches: row.matches,
    row,
    displayLabel: isHistorical ? `${base}${HISTORICAL_MAP_MARKER}` : base,
  };
}

export function getMapPerformanceDisplayContexts(
  rows: readonly MapPerformance[],
  now: Date | string = new Date(),
): MapPerformanceDisplayContext[] {
  return rows.map((row) => getMapPerformanceDisplayContext(row, now));
}
