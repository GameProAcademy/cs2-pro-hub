import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildPlayerDna, DNA_VERSION } from "../playerDna";
import {
  snapshotDigestInput,
  snapshotRow,
  stableJson,
  type DnaSnapshotFeatureRow,
} from "../playerDnaSnapshot";

const row = (
  id: string,
  hs: number | null,
  extra: Partial<DnaSnapshotFeatureRow> = {},
): DnaSnapshotFeatureRow => ({
  match_id: id,
  partial_parse: false,
  sample_rounds: 24,
  schema_version: 1,
  analysis_version: "v1",
  features: { aim: { hs_rate: hs } },
  ...extra,
});
const digest = (rows: DnaSnapshotFeatureRow[]) =>
  createHash("sha256").update(snapshotDigestInput(rows)).digest("hex");

describe("Player DNA snapshot", () => {
  it("stable JSON ignores key order", () => {
    expect(stableJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(
      stableJson({ a: { c: [3, { e: 0, f: 1 }], d: 2 }, b: 1 }),
    );
  });

  it("digest is independent of row order and wall-clock, and changes with any input", () => {
    const rows = [row("a", 0.4), row("b", 0.6), row("c", 0.5)];
    const base = digest(rows);
    expect(digest([...rows].reverse())).toBe(base);
    expect(digest(rows.map((r) => ({ ...r, created_at: "2030-01-01T00:00:00Z" })))).toBe(base);
    expect(digest([...rows, row("d", 0.5)])).not.toBe(base); // new match → new snapshot
    expect(digest([row("a", 0.41), rows[1]!, rows[2]!])).not.toBe(base); // reprocessed features
    expect(digest(rows.map((r) => ({ ...r, analysis_version: "v2" })))).not.toBe(base);
    expect(snapshotDigestInput(rows)).toContain(DNA_VERSION);
  });

  it("an EMPTY profile is never stored", () => {
    expect(snapshotRow("p", buildPlayerDna([]), [], digest([]))).toBeNull();
  });

  it("stores the computed profile on [0,100] with provenance; unobserved stays null", () => {
    const rows = [row("b", 0.6), row("a", 0.4), row("c", null)];
    const dna = buildPlayerDna(rows);
    const snap = snapshotRow("player-1", dna, rows, digest(rows))!;
    expect(snap.state).toBe("READY");
    expect(snap.source_match_ids).toEqual(["a", "b", "c"]);
    expect(snap.match_count).toBe(3);
    expect(snap.source_match_ids).toHaveLength(snap.match_count);
    expect(snap.round_count).toBe(dna.rounds);
    expect(snap.feature_versions).toEqual(["1:v1"]);
    expect(snap.dna_version).toBe(DNA_VERSION);
    expect(snap.input_digest).toMatch(/^[0-9a-f]{64}$/);
    const aim = dna.dimensions.find((d) => d.dimension === "aim")!.value;
    expect(snap.aim).toBe(aim === null ? null : Math.round(aim * 10000) / 100);
    expect(snap.utility).toBeNull();
    for (const d of dna.dimensions) {
      const v = snap[d.dimension];
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("same inputs → identical snapshot row (idempotent generation)", () => {
    const rows = [row("a", 0.4), row("b", 0.6)];
    const one = snapshotRow("p", buildPlayerDna(rows), rows, digest(rows));
    const two = snapshotRow(
      "p",
      buildPlayerDna([...rows].reverse()),
      [...rows].reverse(),
      digest([...rows].reverse()),
    );
    expect(two).toEqual(one);
    expect(one!.state).toBe("INSUFFICIENT_SAMPLE");
  });

  it("migration is additive, enforces provenance and backs ON CONFLICT with a non-partial unique index", () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        "../../../supabase/migrations/20261028200000_player_dna_snapshot_provenance.sql",
      ),
      "utf8",
    );
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).toMatch(/cardinality\(source_match_ids\)\s*=\s*match_count/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS player_dna_snapshots_player_input_uniq\s+ON public\.player_dna_snapshots \(player_id, input_digest\);/,
    );
  });

  it("the snapshot writer excludes quarantined matches and only the server role writes", () => {
    const src = readFileSync(resolve(__dirname, "../playerDnaSnapshot.server.ts"), "utf8");
    expect(src).toContain("canonical_match_quarantine");
    expect(src).toContain('onConflict: "player_id,input_digest"');
    const fn = readFileSync(resolve(__dirname, "../playerData.functions.ts"), "utf8");
    // the player id passed to the writer comes from the caller's own RLS-scoped profiles
    expect(fn).toMatch(/refreshOwnPlayerDnaSnapshot\(playerIds\[0\]!\)/);
    expect(fn).toMatch(/playerIds\.length !== 1/);
  });
});
