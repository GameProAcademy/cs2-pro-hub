import { describe, expect, it } from "vitest";
import { compareDnaSnapshots, type DnaSnapshotRow } from "@/lib/dna/snapshotCompare";

/** The test account's three dna-weighted-v3 snapshots in production (2026-11-25), ids truncated. */
const base = {
  dna_version: "dna-weighted-v3",
  feature_versions: ["1:v1"],
  state: "READY",
  partial_matches: 0,
  economy: null,
  clutch: null,
};
const s1: DnaSnapshotRow = {
  ...base,
  created_at: "2026-11-24T18:51:13Z",
  source_match_ids: ["7d23", "a1e4", "daef"],
  match_count: 3,
  round_count: 64,
  aim: "67.98",
  dueling: "35.02",
  survivability: "38.35",
  positioning: "55.76",
  utility: "27.50",
  decision_making: "82.05",
  teamplay: "27.59",
  consistency: "71.10",
};
const s2: DnaSnapshotRow = {
  ...base,
  created_at: "2026-11-25T02:15:58Z",
  source_match_ids: ["323a", "7d23", "a1e4", "daef"],
  match_count: 4,
  round_count: 88,
  aim: "65.72",
  dueling: "34.11",
  survivability: "36.36",
  positioning: "52.93",
  utility: "26.89",
  decision_making: "81.27",
  teamplay: "31.38",
  consistency: "67.87",
};
const s3: DnaSnapshotRow = {
  ...base,
  created_at: "2026-11-25T05:58:24Z",
  source_match_ids: ["323a", "7d23", "a1e4", "b68b", "daef"],
  match_count: 5,
  round_count: 118,
  aim: "70.04",
  dueling: "39.01",
  survivability: "35.91",
  positioning: "50.67",
  utility: "32.70",
  decision_making: "79.68",
  teamplay: "31.27",
  consistency: "65.39",
};

describe("Experiment C — snapshot comparison (technical, not wired to the radar)", () => {
  it("real snapshots: same version, cumulative windows, one added match each", () => {
    const c = compareDnaSnapshots(s1, s2);
    expect(c).toMatchObject({
      comparable: true,
      relation: "CUMULATIVE",
      shared: 3,
      added: 1,
      removed: 0,
      rounds: { before: 64, after: 88 },
      significance: "NOT_ESTABLISHED",
    });
    const c2 = compareDnaSnapshots(s2, s3);
    expect(c2).toMatchObject({ comparable: true, relation: "CUMULATIVE", shared: 4, added: 1 });
  });
  it("deltas are directional only; no-sample dimensions are never compared as zero", () => {
    const c = compareDnaSnapshots(s1, s3);
    if (!c.comparable) throw new Error("expected comparable");
    const byDim = Object.fromEntries(c.dimensions.map((d) => [d.dimension, d]));
    expect(byDim["aim"]).toMatchObject({
      status: "COMPARED",
      delta: 2.06,
      significance: "DIRECTIONAL_ONLY",
    });
    expect(byDim["teamplay"]).toMatchObject({ status: "COMPARED", delta: 3.68 });
    expect(byDim["clutch"]).toEqual({ dimension: "clutch", status: "NO_VALUE_IN_EITHER" });
    expect(byDim["economy"]).toEqual({ dimension: "economy", status: "NO_VALUE_IN_EITHER" });
  });
  it("never mixes versions, feature versions or order; never mutates the snapshots", () => {
    const frozen = JSON.stringify([s1, s2]);
    expect(compareDnaSnapshots(s1, { ...s2, dna_version: "dna-weighted-v2" })).toMatchObject({
      comparable: false,
      reason: "VERSION_MISMATCH",
    });
    expect(compareDnaSnapshots(s1, { ...s2, feature_versions: ["1:v2"] })).toMatchObject({
      comparable: false,
      reason: "FEATURE_VERSION_MISMATCH",
    });
    expect(compareDnaSnapshots(s2, s1)).toMatchObject({
      comparable: false,
      reason: "NOT_CHRONOLOGICAL",
    });
    expect(compareDnaSnapshots(s1, { ...s2, state: "IN_FORMATION" })).toMatchObject({
      comparable: false,
      reason: "NOT_READY",
    });
    expect(JSON.stringify([s1, s2])).toBe(frozen);
  });
  it("a value missing on one side is reported, not compared", () => {
    const c = compareDnaSnapshots({ ...s1, clutch: "40" }, s2);
    if (!c.comparable) throw new Error("expected comparable");
    expect(c.dimensions.find((d) => d.dimension === "clutch")).toEqual({
      dimension: "clutch",
      status: "NO_VALUE_AFTER",
    });
  });
  it("disjoint windows are INDEPENDENT", () => {
    const c = compareDnaSnapshots(s1, { ...s2, source_match_ids: ["x1", "x2"] });
    expect(c).toMatchObject({ relation: "INDEPENDENT", shared: 0 });
  });
});
