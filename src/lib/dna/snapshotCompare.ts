/**
 * Experiment C (R-16) — technical comparison of two Player DNA snapshots. NOT wired to any screen:
 * Alternative A stays the official Player DNA; this module only proves what a comparison may say.
 *
 * Rules (owner decision 2026-11-25):
 *  - only snapshots of the SAME dna_version and feature versions are compared; never mixed;
 *  - snapshots are read, never written (the caller passes copies of the rows);
 *  - a dimension without a value in either snapshot is not compared (no sample or not measured),
 *    never treated as zero;
 *  - the windows are described (cumulative, overlapping or independent): a cumulative pair shares
 *    most matches, so its delta is the effect of the added matches diluted in the whole sample;
 *  - significance is NOT established: a snapshot stores no per-dimension variance, so a delta can
 *    not be separated from sampling noise. Every delta is DIRECTIONAL_ONLY.
 */
export const DNA_COMPARE_VERSION = "dna-snapshot-compare-v0";

export const DNA_DIMENSIONS = [
  "aim",
  "dueling",
  "survivability",
  "positioning",
  "utility",
  "decision_making",
  "teamplay",
  "economy",
  "clutch",
  "consistency",
] as const;
export type DnaDimensionKey = (typeof DNA_DIMENSIONS)[number];

export interface DnaSnapshotRow {
  dna_version: string;
  feature_versions: readonly string[] | null;
  created_at: string;
  source_match_ids: readonly string[] | null;
  match_count: number | null;
  round_count: number | null;
  partial_matches: number | null;
  state: string | null;
  [dimension: string]: unknown;
}

export type WindowRelation = "CUMULATIVE" | "OVERLAPPING" | "INDEPENDENT";
export type DimensionComparison =
  | {
      dimension: DnaDimensionKey;
      status: "COMPARED";
      before: number;
      after: number;
      delta: number;
      significance: "DIRECTIONAL_ONLY";
    }
  | {
      dimension: DnaDimensionKey;
      status: "NO_VALUE_IN_EITHER" | "NO_VALUE_BEFORE" | "NO_VALUE_AFTER";
    };

export type SnapshotComparison =
  | {
      version: typeof DNA_COMPARE_VERSION;
      comparable: false;
      reason: "VERSION_MISMATCH" | "FEATURE_VERSION_MISMATCH" | "NOT_CHRONOLOGICAL" | "NOT_READY";
    }
  | {
      version: typeof DNA_COMPARE_VERSION;
      comparable: true;
      dnaVersion: string;
      relation: WindowRelation;
      shared: number;
      added: number;
      removed: number;
      rounds: { before: number | null; after: number | null };
      dimensions: DimensionComparison[];
      significance: "NOT_ESTABLISHED";
    };

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const sameSet = (a: readonly string[] | null, b: readonly string[] | null) =>
  JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());

export function compareDnaSnapshots(
  before: DnaSnapshotRow,
  after: DnaSnapshotRow,
): SnapshotComparison {
  const base = { version: DNA_COMPARE_VERSION } as const;
  if (before.dna_version !== after.dna_version)
    return { ...base, comparable: false, reason: "VERSION_MISMATCH" };
  if (!sameSet(before.feature_versions, after.feature_versions))
    return { ...base, comparable: false, reason: "FEATURE_VERSION_MISMATCH" };
  if (!(Date.parse(before.created_at) < Date.parse(after.created_at)))
    return { ...base, comparable: false, reason: "NOT_CHRONOLOGICAL" };
  if (before.state !== "READY" || after.state !== "READY")
    return { ...base, comparable: false, reason: "NOT_READY" };

  const a = new Set(before.source_match_ids ?? []);
  const b = new Set(after.source_match_ids ?? []);
  const shared = [...a].filter((id) => b.has(id)).length;
  const relation: WindowRelation =
    shared === 0 ? "INDEPENDENT" : shared === a.size ? "CUMULATIVE" : "OVERLAPPING";

  const dimensions = DNA_DIMENSIONS.map((dimension): DimensionComparison => {
    const x = num(before[dimension]);
    const y = num(after[dimension]);
    if (x === null && y === null) return { dimension, status: "NO_VALUE_IN_EITHER" };
    if (x === null) return { dimension, status: "NO_VALUE_BEFORE" };
    if (y === null) return { dimension, status: "NO_VALUE_AFTER" };
    return {
      dimension,
      status: "COMPARED",
      before: x,
      after: y,
      delta: Math.round((y - x) * 100) / 100,
      significance: "DIRECTIONAL_ONLY",
    };
  });

  return {
    ...base,
    comparable: true,
    dnaVersion: after.dna_version,
    relation,
    shared,
    added: [...b].filter((id) => !a.has(id)).length,
    removed: [...a].filter((id) => !b.has(id)).length,
    rounds: { before: before.round_count, after: after.round_count },
    dimensions,
    significance: "NOT_ESTABLISHED",
  };
}
