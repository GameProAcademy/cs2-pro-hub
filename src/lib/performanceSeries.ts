/**
 * Real performance trends from the player's own persisted per-match metrics.
 *
 * Every value comes from `OverviewMatch` (match_metrics under RLS, scoped to the caller's
 * player). A metric that was not measured in a match is NOT a zero: the point simply has
 * no value for that series, so the chart shows a gap and totals ignore that match. A
 * metric measured in no match at all is reported as unavailable, never charted.
 */
import type { TimeSeriesPoint } from "@/types";

import type { OverviewMatch } from "@/lib/playerOverview";

export type PerformanceSeriesKey =
  "kd" | "adr" | "hsPercent" | "rating" | "kast" | "openingDiff" | "tradeKills" | "flashAssists";

export interface PerformanceTotals {
  matches: number;
  openingKills: number | null;
  openingDeaths: number | null;
  tradeKills: number | null;
  flashAssists: number | null;
  /** Matches in which each series was measured. */
  observed: Record<PerformanceSeriesKey, number>;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function value(match: OverviewMatch, key: PerformanceSeriesKey): number | null {
  switch (key) {
    case "kd":
      return match.kills !== null && match.deaths !== null && match.deaths > 0
        ? round(match.kills / match.deaths, 2)
        : null;
    case "adr":
      return match.adr === null ? null : round(match.adr, 1);
    case "hsPercent":
      return match.hsPercent === null ? null : round(match.hsPercent, 1);
    case "rating":
      return match.rating === null ? null : round(match.rating, 2);
    case "kast":
      return match.kast === null ? null : round(match.kast, 1);
    case "openingDiff":
      return match.firstKills === null || match.firstDeaths === null
        ? null
        : match.firstKills - match.firstDeaths;
    case "tradeKills":
      return match.tradeKills;
    case "flashAssists":
      return match.flashAssists;
  }
}

export const PERFORMANCE_SERIES: readonly PerformanceSeriesKey[] = [
  "kd",
  "adr",
  "hsPercent",
  "rating",
  "kast",
  "openingDiff",
  "tradeKills",
  "flashAssists",
];

/** Oldest first, one point per match; a missing value is an absent key (a gap). */
export function performanceSeries(matches: readonly OverviewMatch[]): TimeSeriesPoint[] {
  return [...matches]
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt))
    .map((match) => {
      const point: TimeSeriesPoint = {
        label: `${match.playedAt.slice(8, 10)}/${match.playedAt.slice(5, 7)}${match.map ? ` ${match.map.replace(/^de_/, "")}` : ""}`,
      };
      for (const key of PERFORMANCE_SERIES) {
        const measured = value(match, key);
        if (measured !== null && Number.isFinite(measured)) point[key] = measured;
      }
      return point;
    });
}

function sumObserved(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

export function performanceTotals(matches: readonly OverviewMatch[]): PerformanceTotals {
  const observed = Object.fromEntries(
    PERFORMANCE_SERIES.map((key) => [key, matches.filter((m) => value(m, key) !== null).length]),
  ) as Record<PerformanceSeriesKey, number>;
  return {
    matches: matches.length,
    openingKills: sumObserved(matches.map((m) => m.firstKills)),
    openingDeaths: sumObserved(matches.map((m) => m.firstDeaths)),
    tradeKills: sumObserved(matches.map((m) => m.tradeKills)),
    flashAssists: sumObserved(matches.map((m) => m.flashAssists)),
    observed,
  };
}
