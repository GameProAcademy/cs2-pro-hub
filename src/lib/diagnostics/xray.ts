/**
 * Raio-X (X-ray) diagnosis contract — pure, versioned, no I/O.
 *
 * Input: the player's own overview (match_metrics + matches + admission), Player DNA
 * (match_features) and the rounds per side (round_players.side of the target participant).
 * Output: what Fase 3 (and the UI) consumes without recomputing or inventing anything.
 *
 * Three layers, never mixed:
 *  - OBSERVATIONS: catalogued metrics aggregated exactly as `canonicalMetrics.ts` says, each
 *    with its status (MEASURED / NOT_MEASURED / EXCLUDED_BY_ADMISSION), sample and
 *    numerator/denominator when the aggregation has them.
 *  - INFERENCES: only from an existing, documented rule — the weakest observed Player DNA
 *    dimensions below the training-plan ceiling (`needsFromPlayer`, `PLAN_CEILING`), and only
 *    when the DNA has its minimum sample. No other rule, threshold or weight is introduced.
 *  - RECOMMENDATIONS: the training topics that same rule maps each inferred dimension to
 *    (`DIMENSION_TOPICS`), pointing to the training plan. Never a lesson or a number.
 *
 * Null is never zero: a metric no match carries is NOT_MEASURED (or EXCLUDED_BY_ADMISSION
 * when every match's admission decision excludes it), and has no value.
 */
import type { RoundContextSummary } from "@/lib/roundContext";
import { DIMENSION_TOPICS, needsFromPlayer } from "@/lib/catalog/catalogSelect";
import { canonicalMetric, type UnsupportedCapability } from "@/lib/metrics/canonicalMetrics";
import { roundHalfUp } from "@/lib/metrics/rounding";
import { excludedMetricsFor } from "@/lib/pipeline/admissionV3";
import type { RealPlayerDna } from "@/lib/playerDna";
import type { OverviewMatch, PlayerOverview } from "@/lib/playerOverview";
import { PLAN_CEILING } from "@/lib/training/trainingPlan";
import type { DnaDimension } from "@/types";

export const XRAY_CONTRACT_VERSION = "xray-v1";

export type XRayDimensionId =
  "aim_duels" | "survival_positioning" | "utility" | "impact" | "consistency" | "decision";

export type ObservationStatus = "MEASURED" | "NOT_MEASURED" | "EXCLUDED_BY_ADMISSION";

export interface XRayObservation {
  metric: string;
  status: ObservationStatus;
  value: number | null;
  /** Matches that carry the value (the sample of this observation). */
  matches: number;
  /** For sum_ratio / win_rate: the numerator and denominator actually used. */
  numerator: number | null;
  denominator: number | null;
}

/**
 * READY: the index is a published value. IN_FORMATION: the dimension was observed but the
 * DNA has fewer than the minimum matches, so the index is withheld (null) — never a score.
 * NOT_OBSERVED: no signal of the dimension was observed (null, never 0).
 */
export type DnaIndexStatus = "READY" | "IN_FORMATION" | "NOT_OBSERVED";

export interface XRayDnaReading {
  dimension: DnaDimension;
  /**
   * 0–100 index (DNA mean). ONLY set when `indexStatus` is READY (the DNA reached its minimum
   * sample); null otherwise. Consumers (UI, AI Coach) must never derive a score elsewhere.
   */
  index: number | null;
  indexStatus: DnaIndexStatus;
  /** Matches of the best-sampled signal of the dimension. */
  matches: number;
}

export interface XRayDimension {
  id: XRayDimensionId;
  status: "OBSERVED" | "NOT_OBSERVED";
  observations: XRayObservation[];
  dna: XRayDnaReading[];
}

export interface XRayInference {
  rule: "weakest_observed_dna_dimension";
  dimension: DnaDimension;
  index: number;
  ceiling: number;
  /** 1 = weakest. */
  rank: number;
}

export interface XRayRecommendation {
  dimension: DnaDimension;
  topics: string[];
  route: "/training";
}

export interface XRaySide {
  /** Rounds the player played on the side (round_players.side); null when not known. */
  rounds: number | null;
  rating: XRayObservation;
}

export interface XRayDiagnosis {
  version: typeof XRAY_CONTRACT_VERSION;
  state: "EMPTY" | "IN_FORMATION" | "READY";
  sample: {
    matches: number;
    rounds: number | null;
    decided: number;
    resultUnresolved: number;
    /** Matches whose date is the processing date (the demo carries none). */
    processedDateOnly: number;
    dnaMatches: number;
    dnaMinimumMatches: number;
  };
  dimensions: XRayDimension[];
  sides: { ct: XRaySide; t: XRaySide };
  /**
   * Marco 1 (additive, optional for older readers): side and outcome of each own round, own kills,
   * deaths and damage per side (`round-context-v1`). Null when no own participant is known.
   */
  roundContext?: RoundContextSummary | null;
  /** Index ceiling of the weakest-dimension rule (training plan `PLAN_CEILING`). */
  inferenceCeiling: number;
  /** Empty unless the DNA has its minimum sample. */
  inferences: XRayInference[];
  recommendations: XRayRecommendation[];
  /** Why there are no inferences (null when there are). */
  inferenceBlockedBy: "NO_DATA" | "INSUFFICIENT_SAMPLE" | "NONE_BELOW_CEILING" | null;
  unsupported: UnsupportedCapability[];
}

export interface SideRounds {
  matchId: string;
  ct: number;
  t: number;
}

const DIMENSIONS: Record<XRayDimensionId, { metrics: string[]; dna: DnaDimension[] }> = {
  aim_duels: {
    metrics: ["hsPercent", "kd", "adr", "openingKills", "openingDeaths"],
    dna: ["aim", "dueling"],
  },
  survival_positioning: { metrics: ["deaths", "kast"], dna: ["survivability", "positioning"] },
  utility: { metrics: ["utilityDamage", "flashAssists"], dna: ["utility"] },
  impact: {
    metrics: ["winRate", "tradeKills", "clutchWins", "rating"],
    dna: ["teamplay", "clutch"],
  },
  consistency: { metrics: ["rating"], dna: ["consistency"] },
  decision: { metrics: [], dna: ["decision_making", "economy"] },
};

/** OverviewMatch field and persisted column (for admission exclusion) of each metric. */
const FIELD: Record<string, { field: keyof OverviewMatch; column: string }> = {
  kills: { field: "kills", column: "kills" },
  deaths: { field: "deaths", column: "deaths" },
  adr: { field: "adr", column: "adr" },
  kast: { field: "kast", column: "kast" },
  hsPercent: { field: "hsPercent", column: "hs_percent" },
  rating: { field: "rating", column: "rating" },
  ctRating: { field: "ctRating", column: "ct_rating" },
  tRating: { field: "tRating", column: "t_rating" },
  openingKills: { field: "firstKills", column: "first_kills" },
  openingDeaths: { field: "firstDeaths", column: "first_deaths" },
  tradeKills: { field: "tradeKills", column: "trade_kills" },
  flashAssists: { field: "flashAssists", column: "flash_assists" },
  utilityDamage: { field: "utilityDamage", column: "utility_damage" },
  clutchWins: { field: "clutchWins", column: "clutch_wins" },
};

function value(m: OverviewMatch, metric: string): number | null {
  const v = m[FIELD[metric]!.field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Aggregates one catalogued metric over the matches, per its catalog aggregation. */
export function observe(matches: OverviewMatch[], metric: string): XRayObservation {
  const spec = canonicalMetric(metric);
  if (spec.aggregation === "win_rate") {
    const wins = matches.filter((m) => m.result === "win").length;
    const decided = matches.filter((m) => m.result === "win" || m.result === "loss").length;
    const unresolved = matches.filter((m) => m.resultStatus === "UNRESOLVED_BY_DEMO").length;
    return {
      metric,
      status: decided
        ? "MEASURED"
        : unresolved === matches.length && matches.length > 0
          ? "EXCLUDED_BY_ADMISSION"
          : "NOT_MEASURED",
      value: decided ? roundHalfUp((wins / decided) * 100, spec.digits.contract) : null,
      matches: decided,
      numerator: decided ? wins : null,
      denominator: decided ? decided : null,
    };
  }
  if (spec.aggregation === "sum_ratio") {
    const both = matches.filter((m) => m.kills !== null && m.deaths !== null);
    const k = both.reduce((s, m) => s + (m.kills as number), 0);
    const d = both.reduce((s, m) => s + (m.deaths as number), 0);
    const ok = both.length > 0 && d > 0;
    return {
      metric,
      status: ok ? "MEASURED" : statusWithout(matches, "kills"),
      value: ok ? roundHalfUp(k / d, spec.digits.contract) : null,
      matches: ok ? both.length : 0,
      numerator: ok ? k : null,
      denominator: ok ? d : null,
    };
  }
  const present = matches.map((m) => value(m, metric)).filter((v): v is number => v !== null);
  if (!present.length)
    return {
      metric,
      status: statusWithout(matches, FIELD[metric]!.column),
      value: null,
      matches: 0,
      numerator: null,
      denominator: null,
    };
  const total = present.reduce((s, v) => s + v, 0);
  return {
    metric,
    status: "MEASURED",
    // Rounded once, on the aggregate, to the catalog's contract precision.
    value: roundHalfUp(
      spec.aggregation === "sum" ? total : total / present.length,
      spec.digits.contract,
    ),
    matches: present.length,
    numerator: null,
    denominator: null,
  };
}

/** Columns the match's admission limitations exclude; an unregistered limitation excludes nothing provable. */
function excludedColumns(limitations: readonly string[]): string[] {
  try {
    return excludedMetricsFor(limitations);
  } catch {
    return [];
  }
}

function statusWithout(matches: OverviewMatch[], column: string): ObservationStatus {
  if (!matches.length) return "NOT_MEASURED";
  const excludedEverywhere = matches.every((m) => excludedColumns(m.limitations).includes(column));
  return excludedEverywhere ? "EXCLUDED_BY_ADMISSION" : "NOT_MEASURED";
}

function dnaReading(dna: RealPlayerDna, dimension: DnaDimension): XRayDnaReading {
  const d = dna.dimensions.find((x) => x.dimension === dimension);
  const observed = d?.value != null;
  const indexStatus: DnaIndexStatus = !observed
    ? "NOT_OBSERVED"
    : dna.state === "READY"
      ? "READY"
      : "IN_FORMATION";
  return {
    dimension,
    // A provisional index is withheld, not shown as a score and not turned into 0.
    index: indexStatus === "READY" ? Math.round((d!.value as number) * 100) : null,
    indexStatus,
    matches: d ? Math.max(0, ...d.signals.map((s) => s.matches)) : 0,
  };
}

export function buildXRay(args: {
  overview: PlayerOverview;
  dna: RealPlayerDna;
  sides: SideRounds[];
  roundContext?: RoundContextSummary | null;
}): XRayDiagnosis {
  const { overview, dna } = args;
  const matches = overview.matches;
  const dimensions: XRayDimension[] = (Object.keys(DIMENSIONS) as XRayDimensionId[]).map((id) => {
    const spec = DIMENSIONS[id];
    const observations = spec.metrics.map((metric) => observe(matches, metric));
    const readings = spec.dna.map((d) => dnaReading(dna, d));
    const observed =
      observations.some((o) => o.status === "MEASURED") ||
      readings.some((r) => r.indexStatus !== "NOT_OBSERVED");
    return {
      id,
      status: observed ? "OBSERVED" : "NOT_OBSERVED",
      observations,
      dna: readings,
    };
  });

  const known = new Set(matches.map((m) => m.matchId));
  const sideRows = args.sides.filter((s) => known.has(s.matchId));
  const sideRounds = (side: "ct" | "t") =>
    sideRows.length ? sideRows.reduce((sum, s) => sum + s[side], 0) : null;

  const readings = dna.dimensions.map((d) => ({
    dimension: d.dimension,
    index: d.value === null ? null : Math.round(d.value * 100),
  }));
  let inferences: XRayInference[] = [];
  let blockedBy: XRayDiagnosis["inferenceBlockedBy"] = null;
  if (dna.state === "EMPTY") blockedBy = "NO_DATA";
  else if (dna.state === "INSUFFICIENT_SAMPLE") blockedBy = "INSUFFICIENT_SAMPLE";
  else {
    const needs = needsFromPlayer({ dimensions: readings, goals: [], ceiling: PLAN_CEILING });
    const order = [...new Set(needs.map((n) => n.detail))] as DnaDimension[];
    inferences = order.map((dimension, i) => ({
      rule: "weakest_observed_dna_dimension" as const,
      dimension,
      index: readings.find((r) => r.dimension === dimension)!.index as number,
      ceiling: PLAN_CEILING,
      rank: i + 1,
    }));
    if (!inferences.length) blockedBy = "NONE_BELOW_CEILING";
  }

  return {
    version: XRAY_CONTRACT_VERSION,
    state: !matches.length ? "EMPTY" : dna.state === "READY" ? "READY" : "IN_FORMATION",
    sample: {
      matches: matches.length,
      rounds: matches.some((m) => m.roundsPlayed !== null)
        ? matches.reduce((s, m) => s + (m.roundsPlayed ?? 0), 0)
        : null,
      decided: matches.filter((m) => m.result === "win" || m.result === "loss").length,
      resultUnresolved: matches.filter((m) => m.resultStatus === "UNRESOLVED_BY_DEMO").length,
      processedDateOnly: matches.filter((m) => m.dateSource === "processed").length,
      dnaMatches: dna.matches,
      dnaMinimumMatches: dna.minimumMatches,
    },
    dimensions,
    sides: {
      ct: { rounds: sideRounds("ct"), rating: observe(matches, "ctRating") },
      t: { rounds: sideRounds("t"), rating: observe(matches, "tRating") },
    },
    inferenceCeiling: PLAN_CEILING,
    inferences,
    recommendations: inferences.map((i) => ({
      dimension: i.dimension,
      topics: DIMENSION_TOPICS[i.dimension] ?? [],
      route: "/training" as const,
    })),
    inferenceBlockedBy: blockedBy,
    roundContext: args.roundContext ?? null,
    // Kills and damage per side are measured when the round context has rounds with a side.
    unsupported:
      args.roundContext && args.roundContext.rounds - args.roundContext.roundsSideUnknown > 0
        ? ["enemiesFlashed", "positions", "economyClassification"]
        : ["enemiesFlashed", "positions", "economyClassification", "sideSplitKills"],
  };
}
