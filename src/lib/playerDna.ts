/**
 * Real Player DNA: pure aggregation of the player's own persisted
 * `match_features.features` (the per-dimension signals written by
 * `extractFeatures`, see `pipeline/features.catalog.ts`). No I/O.
 *
 * What it is: for every catalogued signal, the mean of the values observed in
 * the player's matches, with the number of matches that carried it. For every
 * dimension, the mean of its observed signals (all catalogued signals are on
 * [0,1] except where the catalogue says otherwise; unbounded or count signals
 * are listed but never folded into a dimension value).
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
export const DNA_VERSION = "dna-mean-v1";

export interface DnaFeatureRow {
  match_id: string;
  partial_parse: boolean | null;
  sample_rounds: number | null;
  features: unknown;
}

export interface DnaSignal {
  name: string;
  mean: number | null;
  matches: number;
  unit: string;
  direction: string;
  foldedIntoDimension: boolean;
}

export interface DnaDimensionSummary {
  dimension: DnaDimension;
  value: number | null;
  signals: DnaSignal[];
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
      const values = rows
        .map((row) => {
          const dims =
            row.features && typeof row.features === "object"
              ? (row.features as Record<string, unknown>)
              : {};
          const group = dims[dimension];
          return group && typeof group === "object"
            ? finite((group as Record<string, unknown>)[name])
            : null;
        })
        .filter((v): v is number => v !== null);
      return {
        name,
        mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
        matches: values.length,
        unit: spec.unit,
        direction: spec.direction,
        foldedIntoDimension: unitInterval(spec.range) && spec.direction !== "neutral",
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
