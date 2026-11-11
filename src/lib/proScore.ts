/**
 * CS2 PRO Score — pro-score-v1 (pure; no I/O; deterministic).
 *
 * WHAT IT IS
 * A 0–100 index of the player's measured PERFORMANCE over their own processed matches:
 * the weighted mean of seven performance signals already produced (and gated) by the feature
 * pipeline (`pipeline/features.ts`, catalogued in `features.catalog.ts`), each pooled over
 * the eligible matches with the match's own sample as weight.
 *
 *   score = 100 × Σ(wᵢ · vᵢ) / Σ(wᵢ)        over the AVAILABLE components i
 *   vᵢ    = Σ(valueᵢₘ · sampleᵢₘ) / Σ(sampleᵢₘ)   over eligible matches m that observed i
 *
 * Every vᵢ is on [0,1] as defined by the catalogue (a natural proportion, or the catalogue's
 * own documented index — `damage_per_round` is ADR ÷ 100). No new reference value, benchmark
 * or population is introduced here.
 *
 * WHAT IT IS NOT
 * Not a percentile, not a rank, not a comparison with other players or with professionals
 * (there is no reference population): `percentile` and `tier` are always null. 50 does NOT
 * mean "average". It is not the per-match rating and not the Player DNA (which describes
 * style and patterns; neutral/style signals never enter the Score).
 *
 * WEIGHTS (design decision of v1, documented, NOT statistically fitted — the product has no
 * population to fit them on; they change only with a new version):
 *   0.25 kast               round contribution: the broadest per-round outcome signal
 *   0.20 damage_per_round   output measured on every engagement (least noisy output signal)
 *   0.15 kills_per_round    output that ends an opponent's round
 *   0.15 kd_balance         exchange: kills against deaths
 *   0.10 survival_rate      rounds survived (determinable rounds only)
 *   0.10 opening_success    first duels won — event-sampled, rarer, so a lower weight
 *   0.05 clutch_win_rate    rarest situation: the lowest weight
 * Per-round signals carry 0.85 of the weight because they are observed every round; the two
 * event-sampled signals carry 0.15 and need PRO_SCORE_MIN_EVENT_SAMPLE pooled events.
 * The per-match `rating` is excluded on purpose: it is itself a blend of kills, deaths and
 * damage per round and would count them twice.
 *
 * MISSING DATA (never zero)
 *  - A match read partially is not eligible (its per-round signals are null by contract).
 *  - A component nobody observed, or below its event sample, is UNAVAILABLE: it contributes
 *    nothing and its weight is removed from the denominator. `coverage` is the share of the
 *    total weight that was available; below PRO_SCORE_MIN_COVERAGE there is no Score.
 *  - Fewer than PRO_SCORE_MIN_MATCHES eligible matches: no Score.
 *
 * CONFIDENCE (sample size only — it says nothing about skill)
 * From the pooled rounds n. The worst-case standard error of a per-round proportion is
 * √(0.25/n): n = 150 → 4.1 points, n = 300 → 2.9 points.
 *   PROVISIONAL  n < 150     MODERATE  150 ≤ n < 300     HIGH  n ≥ 300
 */

export const PRO_SCORE_VERSION = "pro-score-v1";
export const PRO_SCORE_MIN_MATCHES = 3;
export const PRO_SCORE_MIN_COVERAGE = 0.75;
export const PRO_SCORE_MIN_EVENT_SAMPLE = 10;
export const PRO_SCORE_CONFIDENCE_ROUNDS = { moderate: 150, high: 300 } as const;

type SampleColumn = "sample_rounds" | "sample_opening_duels" | "sample_clutches";

export interface ProScoreComponentSpec {
  id: string;
  dimension: string;
  signal: string;
  weight: number;
  sample: SampleColumn;
}

export const PRO_SCORE_COMPONENTS: readonly ProScoreComponentSpec[] = [
  {
    id: "round_contribution",
    dimension: "decision_making",
    signal: "kast",
    weight: 0.25,
    sample: "sample_rounds",
  },
  {
    id: "damage",
    dimension: "aim",
    signal: "damage_per_round",
    weight: 0.2,
    sample: "sample_rounds",
  },
  {
    id: "kills",
    dimension: "aim",
    signal: "kills_per_round",
    weight: 0.15,
    sample: "sample_rounds",
  },
  {
    id: "duel_balance",
    dimension: "dueling",
    signal: "kd_balance",
    weight: 0.15,
    sample: "sample_rounds",
  },
  {
    id: "survival",
    dimension: "survivability",
    signal: "survival_rate",
    weight: 0.1,
    sample: "sample_rounds",
  },
  {
    id: "opening",
    dimension: "dueling",
    signal: "opening_success",
    weight: 0.1,
    sample: "sample_opening_duels",
  },
  {
    id: "clutch",
    dimension: "clutch",
    signal: "clutch_win_rate",
    weight: 0.05,
    sample: "sample_clutches",
  },
] as const;

export interface ProScoreRow {
  match_id: string;
  partial_parse: boolean | null;
  sample_rounds: number | null;
  sample_opening_duels?: number | null;
  sample_clutches?: number | null;
  features: unknown;
}

export type ProScoreState = "EMPTY" | "INSUFFICIENT_SAMPLE" | "INSUFFICIENT_COVERAGE" | "READY";
export type ProScoreConfidence = "PROVISIONAL" | "MODERATE" | "HIGH";

export interface ProScoreComponent {
  id: string;
  signal: string;
  weight: number;
  /** Pooled value on [0,1]; null when unavailable (never 0 for "missing"). */
  value: number | null;
  /** Pooled denominator behind `value` (rounds / opening duels / clutches). */
  sample: number;
  sampleUnit: "rounds" | "opening_duels" | "clutches";
  matches: number;
  available: boolean;
  unavailableReason?: "NOT_OBSERVED" | "THIN_SAMPLE";
  /** Points this component adds to the final score (0 when unavailable). */
  contribution: number;
}

export interface ProScore {
  version: string;
  state: ProScoreState;
  /** 0–100 with one decimal; null unless READY. */
  score: number | null;
  /** Share of the total weight that was available, 0–1. */
  coverage: number;
  confidence: ProScoreConfidence | null;
  /** Eligible (fully read) matches. */
  matches: number;
  partialMatchesExcluded: number;
  rounds: number;
  minimumMatches: number;
  components: ProScoreComponent[];
  /** No reference population exists: always null (never estimated). */
  percentile: null;
  tier: null;
}

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function signalValue(row: ProScoreRow, dimension: string, signal: string): number | null {
  const dims =
    row.features && typeof row.features === "object"
      ? (row.features as Record<string, unknown>)
      : {};
  const group = dims[dimension];
  const v =
    group && typeof group === "object" ? finite((group as Record<string, unknown>)[signal]) : null;
  // The catalogue bounds every Score signal to [0,1]; anything else is not a valid reading.
  return v !== null && v >= 0 && v <= 1 ? v : null;
}

const UNIT = {
  sample_rounds: "rounds",
  sample_opening_duels: "opening_duels",
  sample_clutches: "clutches",
} as const;

export function buildProScore(input: ProScoreRow[]): ProScore {
  // One row per match (a duplicate can never add sample); partial reads are not eligible.
  const byMatch = new Map<string, ProScoreRow>();
  for (const row of input) if (!byMatch.has(row.match_id)) byMatch.set(row.match_id, row);
  const unique = [...byMatch.values()];
  const rows = unique.filter((r) => r.partial_parse !== true);
  const partialMatchesExcluded = unique.length - rows.length;
  const rounds = rows.reduce((sum, r) => sum + Math.max(0, finite(r.sample_rounds) ?? 0), 0);

  const components: ProScoreComponent[] = PRO_SCORE_COMPONENTS.map((spec) => {
    let weighted = 0;
    let sample = 0;
    let matches = 0;
    for (const row of rows) {
      const value = signalValue(row, spec.dimension, spec.signal);
      const weight = finite(row[spec.sample]);
      // A value without its denominator cannot be pooled: it is left out, not guessed.
      if (value === null || weight === null || weight <= 0) continue;
      weighted += value * weight;
      sample += weight;
      matches++;
    }
    const eventSampled = spec.sample !== "sample_rounds";
    const reason: ProScoreComponent["unavailableReason"] | undefined =
      matches === 0
        ? "NOT_OBSERVED"
        : eventSampled && sample < PRO_SCORE_MIN_EVENT_SAMPLE
          ? "THIN_SAMPLE"
          : undefined;
    return {
      id: spec.id,
      signal: `${spec.dimension}.${spec.signal}`,
      weight: spec.weight,
      value: matches === 0 ? null : weighted / sample,
      sample,
      sampleUnit: UNIT[spec.sample],
      matches,
      available: reason === undefined,
      ...(reason ? { unavailableReason: reason } : {}),
      contribution: 0,
    };
  });

  const totalWeight = PRO_SCORE_COMPONENTS.reduce((s, c) => s + c.weight, 0);
  const availableWeight = components.filter((c) => c.available).reduce((s, c) => s + c.weight, 0);
  const coverage = Math.round((availableWeight / totalWeight) * 1000) / 1000;
  const state: ProScoreState =
    unique.length === 0
      ? "EMPTY"
      : rows.length < PRO_SCORE_MIN_MATCHES
        ? "INSUFFICIENT_SAMPLE"
        : coverage < PRO_SCORE_MIN_COVERAGE
          ? "INSUFFICIENT_COVERAGE"
          : "READY";

  let score: number | null = null;
  if (state === "READY") {
    const raw = components
      .filter((c) => c.available)
      .reduce((s, c) => s + c.weight * (c.value as number), 0);
    score = Math.round((raw / availableWeight) * 1000) / 10;
    for (const c of components)
      if (c.available)
        c.contribution =
          Math.round(((c.weight * (c.value as number)) / availableWeight) * 1000) / 10;
  }
  return {
    version: PRO_SCORE_VERSION,
    state,
    score,
    coverage,
    confidence:
      state !== "READY"
        ? null
        : rounds >= PRO_SCORE_CONFIDENCE_ROUNDS.high
          ? "HIGH"
          : rounds >= PRO_SCORE_CONFIDENCE_ROUNDS.moderate
            ? "MODERATE"
            : "PROVISIONAL",
    matches: rows.length,
    partialMatchesExcluded,
    rounds,
    minimumMatches: PRO_SCORE_MIN_MATCHES,
    components,
    percentile: null,
    tier: null,
  };
}
