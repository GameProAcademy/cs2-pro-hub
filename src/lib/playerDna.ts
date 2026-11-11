/**
 * Real Player DNA: pure aggregation of the player's own persisted
 * `match_features.features` (the per-dimension signals written by
 * `extractFeatures`, see `pipeline/features.catalog.ts`). No I/O.
 *
 * What it is (dna-weighted-v2): for every catalogued signal, the SAMPLE-WEIGHTED
 * mean of the values observed in the player's matches (weight = the match's own
 * denominator for that signal: rounds, opening duels or clutch situations), which
 * equals the pooled value over all those matches, with the number of matches and
 * the pooled sample behind it. For every dimension, the mean of its folded signals.
 *
 * A signal is folded into its dimension only when ALL hold:
 *  - the catalogue bounds it to [0,1] and it is not "neutral" (style, not quality);
 *  - it is not the explicit complement of another folded signal of the same
 *    dimension (each quantity counts once);
 *  - an event-sampled signal (opening duels, clutches) has at least
 *    DNA_MIN_EVENT_SAMPLE pooled events (a rate over a handful of events is noise).
 * Signals that are not folded are still listed with their real value and sample.
 *
 * Why v2 replaced dna-mean-v1 (see docs/foundation/FOUNDATION_REPORT.md):
 *  - v1 folded `early_death_rate` (as its complement) AND `early_death_avoidance`,
 *    and `first_death_rate` AND `first_death_avoidance`: the same number twice;
 *  - v1 averaged per-match ratios unweighted, so 1 clutch won of 1 in a short match
 *    weighed as much as 0 of 4 in another (mean 50%, pooled 20%);
 *  - v1 folded rates observed over 1–9 events.
 *
 * What it is not: a comparison with other players (there is no reference
 * population), a score, or a diagnosis. A NULL signal is "not observed", never
 * 0, and is excluded from every mean. A dimension with no observed signal has
 * no value at all.
 */
import { FEATURE_CATALOG } from "@/lib/pipeline/features.catalog";
import type { DnaDimension } from "@/types";

export const DNA_MIN_MATCHES = 3;
/** Version of this aggregation; stored on every persisted snapshot. */
export const DNA_VERSION = "dna-weighted-v2";
/** Pooled events an event-sampled signal needs before it may shape a dimension. */
export const DNA_MIN_EVENT_SAMPLE = 10;

type SampleColumn = "sample_rounds" | "sample_opening_duels" | "sample_clutches";
/** Which per-match sample is the denominator of a signal (default: rounds). */
const SIGNAL_SAMPLE: Record<string, SampleColumn> = {
  "dueling.opening_success": "sample_opening_duels",
  "decision_making.opening_discipline": "sample_opening_duels",
  "clutch.clutch_win_rate": "sample_clutches",
};
/**
 * Explicit complements (catalogue formula `1 - <source>`): listed, never folded, because
 * their source is already folded as its complement. Enforced against the catalogue by tests.
 */
export const DNA_COMPLEMENT_OF: Record<string, string> = {
  "survivability.early_death_avoidance": "survivability.early_death_rate",
  "positioning.first_death_avoidance": "positioning.first_death_rate",
};

export type DnaNotFoldedReason = "NEUTRAL" | "NOT_UNIT_INTERVAL" | "COMPLEMENT" | "THIN_SAMPLE";

export interface DnaFeatureRow {
  match_id: string;
  partial_parse: boolean | null;
  sample_rounds: number | null;
  /** Event samples (dna-weighted-v2). Absent on legacy callers: plain mean is used then. */
  sample_opening_duels?: number | null;
  sample_clutches?: number | null;
  features: unknown;
}

export interface DnaSignal {
  name: string;
  mean: number | null;
  matches: number;
  unit: string;
  direction: string;
  foldedIntoDimension: boolean;
  /** Pooled denominator behind `mean` (rounds / opening duels / clutches); null when unknown. */
  sample?: number | null;
  /** Unit of `sample`. */
  sampleUnit?: "rounds" | "opening_duels" | "clutches";
  /** Why an observed signal does not shape the dimension value (absent when folded). */
  notFolded?: DnaNotFoldedReason;
}

export interface DnaDimensionSummary {
  dimension: DnaDimension;
  value: number | null;
  signals: DnaSignal[];
  /**
   * Set by `publishableDna`: the dimension had an observed signal. Lets a client tell
   * "withheld while in formation" (value null, observed true) from "not observed".
   */
  observed?: boolean;
}

export interface RealPlayerDna {
  state: "EMPTY" | "INSUFFICIENT_SAMPLE" | "READY";
  matches: number;
  rounds: number | null;
  partialMatches: number;
  minimumMatches: number;
  dimensions: DnaDimensionSummary[];
  /** The persisted snapshot this profile corresponds to (set by the server read; null when none). */
  snapshot?: { createdAt: string | null; dnaVersion: string | null; matchCount: number } | null;
}

const DIMENSIONS = Object.keys(FEATURE_CATALOG) as DnaDimension[];

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A signal may be averaged into a dimension only when the catalogue bounds it to [0,1]. */
function unitInterval(range: unknown): boolean {
  return Array.isArray(range) && range[0] === 0 && range[1] === 1;
}

export function buildPlayerDna(rows: DnaFeatureRow[]): RealPlayerDna {
  const matches = new Set(rows.map((row) => row.match_id)).size;
  const roundValues = rows
    .map((row) => row.sample_rounds)
    .filter((v): v is number => typeof v === "number");
  const dimensions: DnaDimensionSummary[] = DIMENSIONS.map((dimension) => {
    const catalog = FEATURE_CATALOG[dimension] as Record<
      string,
      { unit: string; direction: string; range: unknown }
    >;
    const signals: DnaSignal[] = Object.entries(catalog).map(([name, spec]) => {
      const key = `${dimension}.${name}`;
      const column = SIGNAL_SAMPLE[key] ?? "sample_rounds";
      const observed = rows
        .map((row) => {
          const dims =
            row.features && typeof row.features === "object"
              ? (row.features as Record<string, unknown>)
              : {};
          const group = dims[dimension];
          const value =
            group && typeof group === "object"
              ? finite((group as Record<string, unknown>)[name])
              : null;
          const weight = finite(row[column]);
          return value === null ? null : { value, weight };
        })
        .filter((v): v is { value: number; weight: number | null } => v !== null);
      // Pooled (sample-weighted) mean when every contributing match carries its sample;
      // otherwise the plain mean (legacy rows without samples), never a guessed weight.
      const weighted =
        observed.length > 0 && observed.every((o) => o.weight !== null && o.weight > 0);
      const total = weighted ? observed.reduce((a, o) => a + (o.weight as number), 0) : null;
      const mean = !observed.length
        ? null
        : weighted
          ? observed.reduce((a, o) => a + o.value * (o.weight as number), 0) / (total as number)
          : observed.reduce((a, o) => a + o.value, 0) / observed.length;
      const eventSampled = column !== "sample_rounds";
      const notFolded: DnaNotFoldedReason | undefined = !unitInterval(spec.range)
        ? "NOT_UNIT_INTERVAL"
        : spec.direction === "neutral"
          ? "NEUTRAL"
          : key in DNA_COMPLEMENT_OF
            ? "COMPLEMENT"
            : eventSampled && mean !== null && (total === null || total < DNA_MIN_EVENT_SAMPLE)
              ? "THIN_SAMPLE"
              : undefined;
      return {
        name,
        mean,
        matches: observed.length,
        unit: spec.unit,
        direction: spec.direction,
        foldedIntoDimension: notFolded === undefined,
        sample: total,
        sampleUnit:
          column === "sample_rounds"
            ? ("rounds" as const)
            : column === "sample_opening_duels"
              ? ("opening_duels" as const)
              : ("clutches" as const),
        ...(notFolded ? { notFolded } : {}),
      };
    });
    // "down" signals (lower is better) are folded as their complement so the
    // dimension reads "higher is better" consistently.
    const folded = signals
      .filter((s) => s.foldedIntoDimension && s.mean !== null)
      .map((s) => (s.direction === "down" ? 1 - (s.mean as number) : (s.mean as number)));
    return {
      dimension,
      value: folded.length ? folded.reduce((a, b) => a + b, 0) / folded.length : null,
      signals,
    };
  });
  return {
    state: matches === 0 ? "EMPTY" : matches < DNA_MIN_MATCHES ? "INSUFFICIENT_SAMPLE" : "READY",
    matches,
    rounds: roundValues.length ? roundValues.reduce((a, b) => a + b, 0) : null,
    partialMatches: rows.filter((row) => row.partial_parse).length,
    minimumMatches: DNA_MIN_MATCHES,
    dimensions,
  };
}

/**
 * The DNA as it may leave the server for a client (Fase 2.1). Below the minimum sample a
 * dimension value is a provisional mean, not a profile: it is withheld (null) and only the
 * fact that it was observed is kept. Signals (observed means, with their sample) are real
 * measurements and stay. READY profiles are unchanged.
 */
export function publishableDna(dna: RealPlayerDna): RealPlayerDna {
  const stable = dna.state === "READY";
  return {
    ...dna,
    dimensions: dna.dimensions.map((d) => ({
      ...d,
      value: stable ? d.value : null,
      observed: d.value !== null,
    })),
  };
}
