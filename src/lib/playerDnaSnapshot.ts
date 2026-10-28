/**
 * Persisted Player DNA snapshot (pure; no I/O).
 *
 * A snapshot is exactly what `buildPlayerDna` computes from the player's own
 * `match_features` rows, stored with the inputs that produced it:
 * the aggregated match ids, the sample, the feature versions and an input
 * digest. The digest covers the aggregated inputs only (never wall-clock time),
 * so the same inputs always yield the same snapshot row: repeated generation is
 * idempotent and a new or reprocessed match produces a new snapshot.
 *
 * Dimension values are stored on [0,100] (the table's documented range); an
 * unobserved dimension stays NULL, never 0. An EMPTY profile is never stored.
 */
import { DNA_VERSION, type DnaFeatureRow, type RealPlayerDna } from "@/lib/playerDna";
import type { DnaDimension } from "@/types";

export interface DnaSnapshotFeatureRow extends DnaFeatureRow {
  schema_version?: number | null;
  analysis_version?: string | null;
  created_at?: string | null;
}

export type DnaSnapshotRow = {
  player_id: string;
  dna_version: string;
  state: "INSUFFICIENT_SAMPLE" | "READY";
  source_match_ids: string[];
  match_count: number;
  round_count: number | null;
  partial_matches: number;
  feature_versions: string[];
  input_digest: string;
} & Record<DnaDimension, number | null>;

/** Stable JSON: object keys sorted recursively, so equal inputs serialize identically. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

/** The exact material the digest covers (sorted by match id). */
export function snapshotDigestInput(rows: DnaSnapshotFeatureRow[]): string {
  const material = [...rows]
    .sort((a, b) => (a.match_id < b.match_id ? -1 : a.match_id > b.match_id ? 1 : 0))
    .map((row) => ({
      match_id: row.match_id,
      partial_parse: row.partial_parse ?? null,
      sample_rounds: row.sample_rounds ?? null,
      schema_version: row.schema_version ?? null,
      analysis_version: row.analysis_version ?? null,
      features: row.features ?? null,
    }));
  return stableJson({ dna_version: DNA_VERSION, rows: material });
}

function scale(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(Math.min(1, Math.max(0, value)) * 10000) / 100;
}

/** NULL for an EMPTY profile (nothing to store). */
export function snapshotRow(
  playerId: string,
  dna: RealPlayerDna,
  rows: DnaSnapshotFeatureRow[],
  inputDigest: string,
): DnaSnapshotRow | null {
  if (dna.state === "EMPTY") return null;
  const dims = Object.fromEntries(
    dna.dimensions.map((d) => [d.dimension, scale(d.value)]),
  ) as Record<DnaDimension, number | null>;
  const versions = [
    ...new Set(rows.map((r) => `${r.schema_version ?? "?"}:${r.analysis_version ?? "?"}`)),
  ].sort();
  return {
    player_id: playerId,
    dna_version: DNA_VERSION,
    state: dna.state,
    source_match_ids: [...new Set(rows.map((r) => r.match_id))].sort(),
    match_count: dna.matches,
    round_count: dna.rounds,
    partial_matches: dna.partialMatches,
    feature_versions: versions,
    input_digest: inputDigest,
    ...dims,
  };
}
