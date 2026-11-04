/**
 * Canonical metrics catalog (Fase 2). One entry per metric the product shows or hands to
 * the AI Coach, with exactly where it comes from and when it may be shown.
 *
 * It describes the engine; it does not compute anything. The formulas are the ones in
 * `src/lib/pipeline/metrics.ts` (per match) and `src/lib/playerOverview.ts` (aggregates);
 * the data classes are the admission contract v3 maps (`admissionV3.ts`), so a limitation
 * that forbids a class is known to null the metric. The test suite fails if a source column
 * is not read by the app, if the data classes drift from the admission maps, or if a metric
 * shown in the UI is missing here.
 *
 * Null semantics (all metrics): `null` = not measured / not determinable / excluded by the
 * admission decision. It is never 0, never averaged, never counted in a denominator.
 */
import type { MetricId } from "@/lib/glossary";
import {
  METRIC_DATA_DEPENDENCIES_V3,
  PROJECTION_DATA_DEPENDENCIES_V3,
} from "@/lib/pipeline/admissionV3";

export const METRICS_CATALOG_VERSION = "metrics-catalog-v1";

export type MetricUnit = "ratio" | "percent" | "per_round" | "count" | "index" | "matches";

/** How a per-match value becomes the player's value over several matches. */
export type MetricAggregation =
  /** Σ numerator ÷ Σ denominator over matches that carry both (K/D). */
  | "sum_ratio"
  /** Arithmetic mean of the per-match values that exist (ADR, KAST, HS%, rating). */
  | "mean_of_matches"
  /** Σ of the per-match counts that exist (opening kills, trades, flash assists). */
  | "sum"
  /** wins ÷ (wins + losses); unresolved results and draws are excluded. */
  | "win_rate";

export interface CanonicalMetric {
  id: string;
  /** Glossary entry that explains it to the player (src/lib/glossary.ts). */
  glossary: MetricId | null;
  /** Persisted source: `table.column`. */
  source: string;
  unit: MetricUnit;
  /** Per-match formula, as implemented. */
  formula: string;
  denominator: string;
  aggregation: MetricAggregation;
  /** Admission v3 data classes the per-match value depends on (from admissionV3.ts). */
  dataClasses: readonly string[];
  /** Matches needed before the aggregate is shown without an "in formation" warning. */
  minMatches: number;
  /** When the per-match value is null. */
  nullWhen: string;
}

function classes(source: string): readonly string[] {
  const [table, column] = source.split(".") as [string, string];
  const map =
    table === "match_metrics"
      ? METRIC_DATA_DEPENDENCIES_V3
      : (PROJECTION_DATA_DEPENDENCIES_V3 as Readonly<Record<string, readonly string[]>>);
  const key = table === "match_metrics" ? column : `matches.${column}`;
  const found = map[key];
  if (!found) throw new Error(`canonical_metric_without_admission_classes:${source}`);
  return found;
}

const entry = (m: Omit<CanonicalMetric, "dataClasses">): CanonicalMetric => ({
  ...m,
  dataClasses: classes(m.source),
});

export const CANONICAL_METRICS: readonly CanonicalMetric[] = [
  entry({
    id: "kills",
    glossary: null,
    source: "match_metrics.kills",
    unit: "count",
    formula: "kill events whose attacker is the player",
    denominator: "—",
    aggregation: "sum",
    minMatches: 1,
    nullWhen: "kill events unavailable or excluded by admission",
  }),
  entry({
    id: "deaths",
    glossary: null,
    source: "match_metrics.deaths",
    unit: "count",
    formula: "kill events whose victim is the player",
    denominator: "—",
    aggregation: "sum",
    minMatches: 1,
    nullWhen: "kill events unavailable or excluded by admission",
  }),
  entry({
    id: "kd",
    glossary: "kd",
    source: "match_metrics.kills",
    unit: "ratio",
    formula: "kills ÷ deaths",
    denominator: "deaths (Σ over matches with both kills and deaths)",
    aggregation: "sum_ratio",
    minMatches: 1,
    nullWhen: "no match carries kills and deaths, or Σ deaths = 0",
  }),
  entry({
    id: "adr",
    glossary: "adr",
    source: "match_metrics.adr",
    unit: "per_round",
    formula: "damage dealt ÷ rounds played",
    denominator: "rounds played in the match",
    aggregation: "mean_of_matches",
    minMatches: 1,
    nullWhen: "damage events unavailable, or 0 rounds played",
  }),
  entry({
    id: "kast",
    glossary: "kast",
    source: "match_metrics.kast",
    unit: "percent",
    formula: "rounds with a kill, assist, proven survival or trade ÷ rounds played × 100",
    denominator: "rounds played in the match",
    aggregation: "mean_of_matches",
    minMatches: 1,
    nullWhen: "survival or trade timing not provable for every round",
  }),
  entry({
    id: "hsPercent",
    glossary: "hsPercent",
    source: "match_metrics.hs_percent",
    unit: "percent",
    formula: "headshot kills ÷ kills × 100",
    denominator: "kills in the match",
    aggregation: "mean_of_matches",
    minMatches: 1,
    nullWhen: "the player made no kill (no denominator)",
  }),
  entry({
    id: "rating",
    glossary: "rating",
    source: "match_metrics.rating",
    unit: "index",
    formula: "0.45·(KPR/0.70) + 0.25·(1 − DPR/0.75) + 0.30·(ADR/80), floored at 0",
    denominator: "rounds played in the match",
    aggregation: "mean_of_matches",
    minMatches: 1,
    nullWhen: "kill or damage events missing, or round coverage incomplete",
  }),
  entry({
    id: "ctRating",
    glossary: "rating",
    source: "match_metrics.ct_rating",
    unit: "index",
    formula: "match rating formula restricted to the player's CT rounds",
    denominator: "rounds the player played as CT",
    aggregation: "mean_of_matches",
    minMatches: 1,
    nullWhen: "no CT round, or the rating evidence is missing",
  }),
  entry({
    id: "tRating",
    glossary: "rating",
    source: "match_metrics.t_rating",
    unit: "index",
    formula: "match rating formula restricted to the player's T rounds",
    denominator: "rounds the player played as T",
    aggregation: "mean_of_matches",
    minMatches: 1,
    nullWhen: "no T round, or the rating evidence is missing",
  }),
  entry({
    id: "openingKills",
    glossary: "openingKills",
    source: "match_metrics.first_kills",
    unit: "count",
    formula: "rounds whose first kill was made by the player",
    denominator: "rounds with a determinable first kill",
    aggregation: "sum",
    minMatches: 1,
    nullWhen: "kill order not determinable",
  }),
  entry({
    id: "openingDeaths",
    glossary: "openingDeaths",
    source: "match_metrics.first_deaths",
    unit: "count",
    formula: "rounds whose first death was the player",
    denominator: "rounds with a determinable first kill",
    aggregation: "sum",
    minMatches: 1,
    nullWhen: "kill order not determinable",
  }),
  entry({
    id: "tradeKills",
    glossary: "tradeKills",
    source: "match_metrics.trade_kills",
    unit: "count",
    formula: "kills of an enemy who killed a teammate within the trade window, same round",
    denominator: "—",
    aggregation: "sum",
    minMatches: 1,
    nullWhen: "event timing not trustworthy",
  }),
  entry({
    id: "flashAssists",
    glossary: "flashAssists",
    source: "match_metrics.flash_assists",
    unit: "count",
    formula: "game flash-assist flag, else own flash blinding the victim within the window",
    denominator: "—",
    aggregation: "sum",
    minMatches: 1,
    nullWhen: "neither the flag nor blind events with trustworthy timing exist",
  }),
  entry({
    id: "utilityDamage",
    glossary: "utility",
    source: "match_metrics.utility_damage",
    unit: "count",
    formula: "damage dealt with grenades (HE, molotov/incendiary, flash, smoke, decoy)",
    denominator: "—",
    aggregation: "sum",
    minMatches: 1,
    nullWhen: "damage events unavailable",
  }),
  entry({
    id: "clutchWins",
    glossary: "clutch",
    source: "match_metrics.clutch_wins",
    unit: "count",
    formula:
      "clutch situations (last alive vs ≥1) the player survived and whose round their side won",
    denominator: "clutch_attempts",
    aggregation: "sum",
    minMatches: 1,
    nullWhen: "kill events or state at event tick unavailable",
  }),
  entry({
    id: "roundsPlayed",
    glossary: null,
    source: "match_metrics.rounds_played",
    unit: "count",
    formula: "rounds in which the player was present",
    denominator: "—",
    aggregation: "sum",
    minMatches: 1,
    nullWhen: "round boundaries unavailable",
  }),
  entry({
    id: "winRate",
    glossary: "winRate",
    source: "matches.result",
    unit: "percent",
    formula: "wins ÷ (wins + losses) × 100",
    denominator: "matches with a known win or loss",
    aggregation: "win_rate",
    minMatches: 1,
    nullWhen: "no match has a resolved result (e.g. admission limitation L04)",
  }),
];

export function canonicalMetric(id: string): CanonicalMetric {
  const found = CANONICAL_METRICS.find((m) => m.id === id);
  if (!found) throw new Error(`unknown_canonical_metric:${id}`);
  return found;
}

/**
 * Capabilities the product does not measure today, with why. Shown as "not supported",
 * never as zero or as a missing value of a measured metric.
 */
export const UNSUPPORTED_CAPABILITIES = [
  "enemiesFlashed",
  "positions",
  "economyClassification",
  "sideSplitKills",
] as const;
export type UnsupportedCapability = (typeof UNSUPPORTED_CAPABILITIES)[number];
