/**
 * PM4 / Fase 4.2.8 — evolution and consistency (module G), `cs2.evolution.v1`.
 *
 * Pure, deterministic, server-side. Input: the player's own per-match rows (`OverviewMatch`,
 * match_metrics under RLS). Output: descriptive windows, consistency and period comparisons.
 *
 * Rules (spec §6.3–6.7):
 * - A window holds the last N eligible matches, newest first. N is the real count; a window is
 *   never padded, and a match without a value for a metric is left out of that metric (coverage),
 *   never counted as zero.
 * - Rates are pooled from numerators and denominators (Σnum / Σden), never averaged per match.
 *   Numerators that the store keeps only as a rate (ADR, KAST %, HS %) are rebuilt from that rate
 *   × its own denominator (rounds or kills) of the same match; declared per metric.
 * - Rating has no numerator/denominator: it is declared a mean per match.
 * - Consistency is descriptive only (median, IQR, SD, CV) and needs ≥ CONSISTENCY_MIN_MATCHES; no
 *   "consistent/inconsistent" label is produced (no validated threshold exists).
 * - A comparison needs ≥ COMPARE_MIN_MATCHES on both sides and one comparable method on both
 *   sides; flash assists are compared only within one attribution method.
 * - Description only: a change between periods is never presented as caused by anything.
 */
import { pooledParts } from "@/lib/metrics/canonicalAggregate";
import type { FlashAssistMethodView, OverviewMatch } from "@/lib/playerOverview";

export const EVOLUTION_VERSION = "cs2.evolution.v1";
export const WINDOW_SIZES = [5, 10, 20, 50] as const;
export type WindowSize = (typeof WINDOW_SIZES)[number];
export const WINDOW_MIN_MATCHES = 3;
export const CONSISTENCY_MIN_MATCHES = 5;
export const COMPARE_MIN_MATCHES = 3;

export type EvolutionMetricKey =
  | "kd"
  | "adr"
  | "kast"
  | "hsPercent"
  | "rating"
  | "openingWinRate"
  | "deathsPerRound"
  | "tradeKillsPerRound"
  | "clutchWinRate"
  | "flashAssistsPerRound";

export type Aggregation = "POOLED_RATIO" | "MEAN_PER_MATCH";
export type Unit = "RATIO" | "PERCENT" | "PER_ROUND" | "DAMAGE_PER_ROUND" | "RATING";
export type Side = "ALL" | "CT" | "T";

export interface MetricDefinition {
  key: EvolutionMetricKey;
  unit: Unit;
  aggregation: Aggregation;
  /** Higher is better for the player (used only to orient the arrow, never to judge). */
  higherIsBetter: boolean;
  /** Supports the CT/T side filter (only the rating is stored per side). */
  sides: boolean;
  /** Text of the formula, shown as provenance. */
  formula: string;
}

export const METRICS: readonly MetricDefinition[] = [
  {
    key: "kd",
    unit: "RATIO",
    aggregation: "POOLED_RATIO",
    higherIsBetter: true,
    sides: false,
    formula: "Σ kills / Σ deaths",
  },
  {
    key: "adr",
    unit: "DAMAGE_PER_ROUND",
    aggregation: "POOLED_RATIO",
    higherIsBetter: true,
    sides: false,
    formula: "Σ (ADR × rounds) / Σ rounds",
  },
  {
    key: "kast",
    unit: "PERCENT",
    aggregation: "POOLED_RATIO",
    higherIsBetter: true,
    sides: false,
    formula: "Σ (KAST% × rounds) / Σ rounds",
  },
  {
    key: "hsPercent",
    unit: "PERCENT",
    aggregation: "POOLED_RATIO",
    higherIsBetter: true,
    sides: false,
    formula: "Σ (HS% × kills) / Σ kills",
  },
  {
    key: "rating",
    unit: "RATING",
    aggregation: "POOLED_RATIO",
    higherIsBetter: true,
    sides: true,
    formula:
      "Σ (rating × rounds) / Σ rounds; with the CT / T filter, mean of the match side rating (no per-side round count is persisted)",
  },
  {
    key: "openingWinRate",
    unit: "PERCENT",
    aggregation: "POOLED_RATIO",
    higherIsBetter: true,
    sides: false,
    formula: "Σ opening kills / Σ (opening kills + opening deaths)",
  },
  {
    key: "deathsPerRound",
    unit: "PER_ROUND",
    aggregation: "POOLED_RATIO",
    higherIsBetter: false,
    sides: false,
    formula: "Σ deaths / Σ rounds",
  },
  {
    key: "tradeKillsPerRound",
    unit: "PER_ROUND",
    aggregation: "POOLED_RATIO",
    higherIsBetter: true,
    sides: false,
    formula: "Σ trade kills / Σ rounds",
  },
  {
    key: "clutchWinRate",
    unit: "PERCENT",
    aggregation: "POOLED_RATIO",
    higherIsBetter: true,
    sides: false,
    formula: "Σ clutches won / Σ clutch attempts",
  },
  {
    key: "flashAssistsPerRound",
    unit: "PER_ROUND",
    aggregation: "POOLED_RATIO",
    higherIsBetter: true,
    sides: false,
    formula: "Σ flash assists / Σ rounds, within one attribution method",
  },
];

/** Per-match contribution of one metric: null when the match does not measure it. */
export interface Contribution {
  numerator: number;
  denominator: number;
  /** Value of this match alone (for consistency and the per-match list). */
  value: number;
  /** Compatibility key: two contributions are comparable only with the same key. */
  method: string;
}

const BASE_METHOD = "cs2.match-metrics";
const finite = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);
const safeRatio = (n: number, d: number) => (d > 0 ? n / d : null);

function flashMethod(m: FlashAssistMethodView | undefined): string | null {
  // Only matches whose attribution method is known and single are comparable.
  if (m === "GAME_FLAG" || m === "TIMED_ATTRIBUTION") return `${BASE_METHOD}+flash.${m}`;
  return null;
}

export function contribution(
  m: OverviewMatch,
  key: EvolutionMetricKey,
  side: Side = "ALL",
): Contribution | null {
  const rounds = finite(m.roundsPlayed) && m.roundsPlayed > 0 ? m.roundsPlayed : null;
  const make = (
    numerator: number,
    denominator: number,
    method = BASE_METHOD,
  ): Contribution | null => {
    const value = safeRatio(numerator, denominator);
    return value === null ? null : { numerator, denominator, value, method };
  };
  if (side !== "ALL" && key !== "rating") return null;
  switch (key) {
    // metrics-catalog-v2: the canonical per-match parts (canonicalAggregate.ts), shared with the
    // Dashboard, the X-ray and the AI Coach so the same matches give the same value everywhere.
    case "kd":
    case "adr":
    case "kast":
    case "hsPercent": {
      const p = pooledParts(m, key);
      return p ? make(p.numerator * p.scale, p.denominator) : null;
    }
    case "rating": {
      if (side === "ALL") {
        const p = pooledParts(m, "rating");
        return p ? make(p.numerator, p.denominator) : null;
      }
      // CT / T ratings carry no persisted per-side round count: one value per match.
      const r = side === "CT" ? m.ctRating : m.tRating;
      return finite(r) ? { numerator: r, denominator: 1, value: r, method: BASE_METHOD } : null;
    }
    case "openingWinRate":
      return finite(m.firstKills) && finite(m.firstDeaths)
        ? make(m.firstKills * 100, m.firstKills + m.firstDeaths)
        : null;
    case "deathsPerRound":
      return finite(m.deaths) && rounds ? make(m.deaths, rounds) : null;
    case "tradeKillsPerRound":
      return finite(m.tradeKills) && rounds ? make(m.tradeKills, rounds) : null;
    case "clutchWinRate":
      return finite(m.clutchWins) && finite(m.clutchAttempts)
        ? make(m.clutchWins * 100, m.clutchAttempts)
        : null;
    case "flashAssistsPerRound": {
      const method = flashMethod(m.flashAssistMethod);
      return finite(m.flashAssists) && rounds && method
        ? make(m.flashAssists, rounds, method)
        : null;
    }
  }
}

export type AggregateStatus = "OK" | "NO_SAMPLE" | "INCOMPATIBLE_METHODS";

export interface Aggregate {
  status: AggregateStatus;
  value: number | null;
  numerator: number;
  denominator: number;
  /** Matches that measured the metric (coverage numerator). */
  matches: number;
  /** Matches in the window (coverage denominator). */
  windowMatches: number;
  methods: string[];
}

export function aggregate(
  matches: OverviewMatch[],
  key: EvolutionMetricKey,
  side: Side = "ALL",
): Aggregate {
  const def = METRICS.find((d) => d.key === key)!;
  const parts = matches
    .map((m) => contribution(m, key, side))
    .filter((c): c is Contribution => !!c);
  const methods = [...new Set(parts.map((p) => p.method))].sort();
  const base = { matches: parts.length, windowMatches: matches.length, methods };
  if (!parts.length)
    return { status: "NO_SAMPLE", value: null, numerator: 0, denominator: 0, ...base };
  if (methods.length > 1)
    return { status: "INCOMPATIBLE_METHODS", value: null, numerator: 0, denominator: 0, ...base };
  const numerator = parts.reduce((s, p) => s + p.numerator, 0);
  const denominator = parts.reduce((s, p) => s + p.denominator, 0);
  const perMatch = def.aggregation === "MEAN_PER_MATCH" || (key === "rating" && side !== "ALL");
  const value = perMatch ? numerator / parts.length : safeRatio(numerator, denominator);
  return { status: value === null ? "NO_SAMPLE" : "OK", value, numerator, denominator, ...base };
}

export interface Consistency {
  status: "OK" | "INSUFFICIENT_SAMPLE";
  n: number;
  median: number | null;
  q1: number | null;
  q3: number | null;
  sd: number | null;
  /** SD / mean; only for positive ratio-scale metrics with a positive mean. */
  cv: number | null;
  min: number | null;
  max: number | null;
}

/** Linear-interpolation quantile (type 7) of sorted values. */
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function consistency(values: number[], cvAllowed: boolean): Consistency {
  const n = values.length;
  if (n < CONSISTENCY_MIN_MATCHES)
    return {
      status: "INSUFFICIENT_SAMPLE",
      n,
      median: null,
      q1: null,
      q3: null,
      sd: null,
      cv: null,
      min: null,
      max: null,
    };
  const s = [...values].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return {
    status: "OK",
    n,
    median: quantile(s, 0.5),
    q1: quantile(s, 0.25),
    q3: quantile(s, 0.75),
    sd,
    cv: cvAllowed && mean > 0 && s[0]! >= 0 ? sd / mean : null,
    min: s[0]!,
    max: s[n - 1]!,
  };
}

export type ComparisonStatus =
  "OK" | "INSUFFICIENT_SAMPLE" | "INCOMPATIBLE_METHODS" | "NO_PREVIOUS_PERIOD";

export interface Comparison {
  status: ComparisonStatus;
  recent: Aggregate;
  previous: Aggregate;
  delta: number | null;
  /** Relative change in %, only when the previous value is not 0. */
  deltaPercent: number | null;
}

export function compare(recent: Aggregate, previous: Aggregate): Comparison {
  const out = (status: ComparisonStatus): Comparison => ({
    status,
    recent,
    previous,
    delta: null,
    deltaPercent: null,
  });
  if (previous.windowMatches === 0) return out("NO_PREVIOUS_PERIOD");
  if (recent.status === "INCOMPATIBLE_METHODS" || previous.status === "INCOMPATIBLE_METHODS")
    return out("INCOMPATIBLE_METHODS");
  if (recent.methods.join() !== previous.methods.join() && recent.matches && previous.matches)
    return out("INCOMPATIBLE_METHODS");
  if (
    recent.value === null ||
    previous.value === null ||
    recent.matches < COMPARE_MIN_MATCHES ||
    previous.matches < COMPARE_MIN_MATCHES
  )
    return out("INSUFFICIENT_SAMPLE");
  const delta = recent.value - previous.value;
  return {
    status: "OK",
    recent,
    previous,
    delta,
    deltaPercent: previous.value !== 0 ? (delta / Math.abs(previous.value)) * 100 : null,
  };
}

export type WindowStatus = "COMPLETE" | "PARTIAL" | "INSUFFICIENT_SAMPLE";

export interface MetricReport {
  key: EvolutionMetricKey;
  definition: MetricDefinition;
  window: Aggregate;
  consistency: Consistency;
  comparison: Comparison;
  /** Oldest first: one point per window match; value null = not measured (a gap). */
  points: { matchId: string; playedAt: string; map: string | null; value: number | null }[];
}

export interface EvolutionFilters {
  window: WindowSize;
  map: string | null;
  side: Side;
}

export interface EvolutionReport {
  version: typeof EVOLUTION_VERSION;
  filters: EvolutionFilters;
  /** Eligible matches after the map filter (all history the caller sees). */
  eligibleMatches: number;
  /** Matches left out of every window, with the reason. */
  excluded: { matchId: string; reason: "NO_ROUNDS" }[];
  window: { requested: WindowSize; n: number; status: WindowStatus };
  previousWindow: { n: number };
  maps: string[];
  metrics: MetricReport[];
}

const byNewest = (a: OverviewMatch, b: OverviewMatch) => b.playedAt.localeCompare(a.playedAt);

export function buildEvolution(all: OverviewMatch[], filters: EvolutionFilters): EvolutionReport {
  const maps = [...new Set(all.map((m) => m.map).filter((m): m is string => !!m))].sort();
  const mapped = all.filter((m) => !filters.map || m.map === filters.map).sort(byNewest);
  // A match without a known round count cannot carry any per-round rate; it is listed, not used.
  const excluded = mapped
    .filter((m) => !(finite(m.roundsPlayed) && m.roundsPlayed > 0))
    .map((m) => ({ matchId: m.matchId, reason: "NO_ROUNDS" as const }));
  const eligible = mapped.filter((m) => finite(m.roundsPlayed) && m.roundsPlayed > 0);
  const N = filters.window;
  const recent = eligible.slice(0, N);
  const previous = eligible.slice(N, 2 * N);
  const status: WindowStatus =
    recent.length >= N
      ? "COMPLETE"
      : recent.length >= WINDOW_MIN_MATCHES
        ? "PARTIAL"
        : "INSUFFICIENT_SAMPLE";
  const metrics = METRICS.filter((d) => filters.side === "ALL" || d.sides).map((definition) => {
    const window = aggregate(recent, definition.key, filters.side);
    const values = recent
      .map((m) => contribution(m, definition.key, filters.side))
      .filter((c): c is Contribution => !!c)
      .map((c) => c.value);
    return {
      key: definition.key,
      definition,
      window,
      consistency:
        window.status === "OK"
          ? consistency(values, definition.unit !== "RATING")
          : consistency([], false),
      comparison: compare(window, aggregate(previous, definition.key, filters.side)),
      points: [...recent].reverse().map((m) => ({
        matchId: m.matchId,
        playedAt: m.playedAt,
        map: m.map,
        value: contribution(m, definition.key, filters.side)?.value ?? null,
      })),
    };
  });
  return {
    version: EVOLUTION_VERSION,
    filters,
    eligibleMatches: eligible.length,
    excluded,
    window: { requested: N, n: recent.length, status },
    previousWindow: { n: previous.length },
    maps,
    metrics,
  };
}
