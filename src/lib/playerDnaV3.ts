/**
 * Player DNA v3 (`dna-weighted-v3`, UX-1.6) — pure, no I/O. A NEW version next to
 * `dna-weighted-v2` (`playerDna.ts`), which stays byte-for-byte intact (pro-score-v1 and the
 * training v1 engine keep reading it, and its snapshots keep their meaning).
 *
 * Same aggregation as v2 (sample-weighted mean of each catalogued signal over the player's
 * matches; a dimension is the mean of its folded signals, "down" signals folded as their
 * complement; NULL is "not observed", never 0). What v3 changes, each a decision of the owner
 * (UX-1 Doc. 2 §14, Doc. 6 R-04, R-05, R-35, R-36):
 *
 *  1. HS by kills (R-05): `aim.hs_rate` is weighted by the match's kills, not its rounds, so the
 *     DNA's HS equals the catalogue HS (Σ headshot kills ÷ Σ kills).
 *  2. Clutch without multi-kill (R-04): `clutch.multi_kill_rate` leaves Clutch. Q-23 (11 axes or
 *     10) is open; v3 keeps the 10 axes of the snapshot table and lists multi-kill as a signal of
 *     Duels (Doc. 5, the 10-axis option), so Clutch is only `clutch_win_rate`, with a value only
 *     from DNA_MIN_EVENT_SAMPLE (10) pooled clutch attempts.
 *  3. No signal counted twice (R-35): `decision_making.opening_discipline` is the same quantity as
 *     `dueling.opening_success` (equal in every persisted row, 11/11 on 2026-11-24); it is listed,
 *     never folded.
 *  4. Not measured ≠ no sample (R-36): a dimension whose signals cannot be derived from the
 *     parser contract (Economy today) is NOT_MEASURED; a dimension that could be measured but has
 *     too little is NO_SAMPLE. Neither has a value, and neither disappears from the radar.
 *  5. Half rule (Doc. 2 §14): a dimension has a value only when at least half of its foldable
 *     signals have one.
 *
 * Not a comparison with other players, not a score, not a diagnosis.
 */
import { FEATURE_CATALOG } from "@/lib/pipeline/features.catalog";
import {
  DNA_COMPLEMENT_OF,
  DNA_MIN_EVENT_SAMPLE,
  DNA_MIN_MATCHES,
  type DnaFeatureRow,
  type RealPlayerDna,
} from "@/lib/playerDna";
import type { DnaDimension } from "@/types";

export const DNA_VERSION_V3 = "dna-weighted-v3";

type SampleColumn = "sample_rounds" | "sample_opening_duels" | "sample_clutches" | "sample_kills";

export interface DnaFeatureRowV3 extends DnaFeatureRow {
  /** The player's kills in the match (`match_metrics.kills`): the denominator of HS (R-05). */
  sample_kills?: number | null;
}

/** Signals moved to another dimension in v3 (source key → dimension that lists it). */
export const DNA_V3_MOVED: Record<string, DnaDimension> = {
  "clutch.multi_kill_rate": "dueling",
};
/** Signals that repeat another folded signal (listed, never folded). */
export const DNA_V3_DUPLICATE_OF: Record<string, string> = {
  "decision_making.opening_discipline": "dueling.opening_success",
};

const SIGNAL_SAMPLE: Record<string, SampleColumn> = {
  "aim.hs_rate": "sample_kills",
  "dueling.opening_success": "sample_opening_duels",
  "decision_making.opening_discipline": "sample_opening_duels",
  "clutch.clutch_win_rate": "sample_clutches",
};
const EVENT_SAMPLED = new Set<SampleColumn>(["sample_opening_duels", "sample_clutches"]);

export type DnaV3NotFoldedReason =
  "NEUTRAL" | "NOT_UNIT_INTERVAL" | "COMPLEMENT" | "DUPLICATE" | "NOT_DERIVABLE" | "THIN_SAMPLE";

/** MEASURED: value. NO_SAMPLE: measurable, too little data. NOT_MEASURED: not derivable today. */
export type DnaV3DimensionStatus = "MEASURED" | "NO_SAMPLE" | "NOT_MEASURED";

export interface DnaV3Signal {
  /** `${dimension it came from}.${name}` — stable across the move of a signal. */
  key: string;
  name: string;
  mean: number | null;
  matches: number;
  unit: string;
  direction: string;
  foldedIntoDimension: boolean;
  sample: number | null;
  sampleUnit: "rounds" | "opening_duels" | "clutches" | "kills";
  notFolded?: DnaV3NotFoldedReason;
}

export interface DnaV3Dimension {
  dimension: DnaDimension;
  value: number | null;
  status: DnaV3DimensionStatus;
  signals: DnaV3Signal[];
  /** Foldable signals and how many of them have a value (the half rule). */
  foldable: number;
  foldedWithValue: number;
}

export interface RealPlayerDnaV3 {
  version: typeof DNA_VERSION_V3;
  state: "EMPTY" | "INSUFFICIENT_SAMPLE" | "READY";
  matches: number;
  rounds: number | null;
  partialMatches: number;
  minimumMatches: number;
  dimensions: DnaV3Dimension[];
}

const DIMENSIONS = Object.keys(FEATURE_CATALOG) as DnaDimension[];

type SignalSpec = { unit: string; direction: string; range: unknown; formula: string };

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const unitInterval = (range: unknown) => Array.isArray(range) && range[0] === 0 && range[1] === 1;

/** The parser contract cannot produce it (catalogue formula says so): never a sample problem. */
const notDerivable = (spec: SignalSpec) => /^(not derivable|requires )/i.test(spec.formula.trim());

const sampleUnit = (c: SampleColumn): DnaV3Signal["sampleUnit"] =>
  c === "sample_rounds"
    ? "rounds"
    : c === "sample_opening_duels"
      ? "opening_duels"
      : c === "sample_clutches"
        ? "clutches"
        : "kills";

function signalFor(
  rows: DnaFeatureRowV3[],
  source: DnaDimension,
  name: string,
  spec: SignalSpec,
): DnaV3Signal {
  const key = `${source}.${name}`;
  const column = SIGNAL_SAMPLE[key] ?? "sample_rounds";
  const observed = rows
    .map((row) => {
      const dims =
        row.features && typeof row.features === "object"
          ? (row.features as Record<string, unknown>)
          : {};
      const group = dims[source];
      const value =
        group && typeof group === "object"
          ? finite((group as Record<string, unknown>)[name])
          : null;
      return value === null ? null : { value, weight: finite(row[column]) };
    })
    .filter((v): v is { value: number; weight: number | null } => v !== null);
  const weighted = observed.length > 0 && observed.every((o) => o.weight !== null && o.weight > 0);
  const total = weighted ? observed.reduce((a, o) => a + (o.weight as number), 0) : null;
  const mean = !observed.length
    ? null
    : weighted
      ? observed.reduce((a, o) => a + o.value * (o.weight as number), 0) / (total as number)
      : observed.reduce((a, o) => a + o.value, 0) / observed.length;
  const notFolded: DnaV3NotFoldedReason | undefined = notDerivable(spec)
    ? "NOT_DERIVABLE"
    : !unitInterval(spec.range)
      ? "NOT_UNIT_INTERVAL"
      : spec.direction === "neutral"
        ? "NEUTRAL"
        : key in DNA_COMPLEMENT_OF
          ? "COMPLEMENT"
          : key in DNA_V3_DUPLICATE_OF
            ? "DUPLICATE"
            : EVENT_SAMPLED.has(column) &&
                mean !== null &&
                (total === null || total < DNA_MIN_EVENT_SAMPLE)
              ? "THIN_SAMPLE"
              : undefined;
  return {
    key,
    name,
    mean,
    matches: observed.length,
    unit: spec.unit,
    direction: spec.direction,
    foldedIntoDimension: notFolded === undefined,
    sample: total,
    sampleUnit: sampleUnit(column),
    ...(notFolded ? { notFolded } : {}),
  };
}

/** Structurally foldable: could shape the dimension once it has a sample. */
const foldableReason = (r: DnaV3NotFoldedReason | undefined) =>
  r === undefined || r === "THIN_SAMPLE";

export function buildPlayerDnaV3(rows: DnaFeatureRowV3[]): RealPlayerDnaV3 {
  const matches = new Set(rows.map((row) => row.match_id)).size;
  const roundValues = rows
    .map((row) => row.sample_rounds)
    .filter((v): v is number => typeof v === "number");
  const signalsBy = new Map<DnaDimension, DnaV3Signal[]>(DIMENSIONS.map((d) => [d, []]));
  for (const source of DIMENSIONS) {
    const catalog = FEATURE_CATALOG[source] as Record<string, SignalSpec>;
    for (const [name, spec] of Object.entries(catalog)) {
      const target = DNA_V3_MOVED[`${source}.${name}`] ?? source;
      signalsBy.get(target)!.push(signalFor(rows, source, name, spec));
    }
  }
  const dimensions: DnaV3Dimension[] = DIMENSIONS.map((dimension) => {
    const signals = signalsBy.get(dimension)!;
    const candidates = signals.filter((s) => foldableReason(s.notFolded));
    const folded = signals.filter((s) => s.foldedIntoDimension && s.mean !== null);
    const values = folded.map((s) =>
      s.direction === "down" ? 1 - (s.mean as number) : (s.mean as number),
    );
    const enough = candidates.length > 0 && folded.length * 2 >= candidates.length;
    const value =
      enough && values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return {
      dimension,
      value,
      status: !candidates.length ? "NOT_MEASURED" : value === null ? "NO_SAMPLE" : "MEASURED",
      signals,
      foldable: candidates.length,
      foldedWithValue: folded.length,
    };
  });
  return {
    version: DNA_VERSION_V3,
    state: matches === 0 ? "EMPTY" : matches < DNA_MIN_MATCHES ? "INSUFFICIENT_SAMPLE" : "READY",
    matches,
    rounds: roundValues.length ? roundValues.reduce((a, b) => a + b, 0) : null,
    partialMatches: rows.filter((row) => row.partial_parse).length,
    minimumMatches: DNA_MIN_MATCHES,
    dimensions,
  };
}

/**
 * As it may leave the server: below the minimum matches a dimension value is provisional and
 * withheld (null, status kept). Signals stay (they are real measurements with their sample).
 */
export function publishableDnaV3(dna: RealPlayerDnaV3): RealPlayerDnaV3 {
  if (dna.state === "READY") return dna;
  return { ...dna, dimensions: dna.dimensions.map((d) => ({ ...d, value: null })) };
}

/**
 * The v3 profile in the shape every DNA surface already renders (`RealPlayerDna`), carrying
 * `version` and each dimension's `status`. Values are withheld below the minimum matches
 * (`publishableDnaV3`), with `observed` telling "in formation" from "not observed".
 */
export function asRealPlayerDna(v3: RealPlayerDnaV3, publish = true): RealPlayerDna {
  const dna = publish ? publishableDnaV3(v3) : v3;
  const computed = new Map(v3.dimensions.map((d) => [d.dimension, d.value]));
  return {
    version: DNA_VERSION_V3,
    state: dna.state,
    matches: dna.matches,
    rounds: dna.rounds,
    partialMatches: dna.partialMatches,
    minimumMatches: dna.minimumMatches,
    dimensions: dna.dimensions.map((d) => ({
      dimension: d.dimension,
      value: d.value,
      status: d.status,
      observed: computed.get(d.dimension) !== null,
      signals: d.signals.map((s) => ({
        name: s.name,
        mean: s.mean,
        matches: s.matches,
        unit: s.unit,
        direction: s.direction,
        foldedIntoDimension: s.foldedIntoDimension,
        sample: s.sample,
        sampleUnit: s.sampleUnit,
        ...(s.notFolded ? { notFolded: s.notFolded } : {}),
      })),
    })),
  };
}
