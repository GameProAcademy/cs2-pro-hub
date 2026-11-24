/**
 * UX-1.7 — cs2.training-priority.v2 (Doc. 4 §4–§5). Includes the acceptance simulation of the
 * roadmap: false positives ≤ 2.5% per signal for a player exactly at the reference, with rounds
 * correlated inside a match (ρ up to 0.10).
 */
import { describe, expect, it } from "vitest";

import {
  assessSignal,
  candidateKeys,
  clusteredInterval,
  computePrioritiesV2,
  MAX_PRIORITIES,
  PRIORITY_VERSION_V2,
  REFERENCE,
} from "@/lib/training/priorityV2";
import { PRIORITY_VERSION } from "@/lib/training/adaptive";
import type { DnaFeatureRowV3 } from "@/lib/playerDnaV3";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gamma(shape: number, r: () => number): number {
  if (shape < 1) return gamma(shape + 1, r) * r() ** (1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      // Box–Muller normal
      x = Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))
      return d * v;
  }
}
/** Match-level rate ~ Beta(mean p, ICC ρ), then binomial rounds: correlated rounds. */
function matchRate(p: number, rho: number, r: () => number): number {
  if (rho === 0) return p;
  const s = 1 / rho - 1;
  const a = gamma(p * s, r);
  const b = gamma((1 - p) * s, r);
  return a / (a + b);
}
function kastRows(p: number, rho: number, k: number, rounds: number, r: () => number) {
  return Array.from({ length: k }, (_, i): DnaFeatureRowV3 => {
    const pi = matchRate(p, rho, r);
    let y = 0;
    for (let j = 0; j < rounds; j++) if (r() < pi) y++;
    return {
      match_id: `m${i}`,
      partial_parse: false,
      sample_rounds: rounds,
      features: { decision_making: { kast: y / rounds } },
    };
  });
}

describe("cs2.training-priority.v2", () => {
  it("is a new version; v1 is untouched", () => {
    expect(PRIORITY_VERSION_V2).toBe("cs2.training-priority.v2");
    expect(PRIORITY_VERSION).toBe("cs2.training-priority.v1");
  });

  it("never lists style signals, complements or duplicates", () => {
    const keys = candidateKeys();
    for (const k of [
      "dueling.opening_participation",
      "dueling.trade_kill_share",
      "clutch.clutch_frequency",
      "survivability.early_death_avoidance",
      "positioning.first_death_avoidance",
      "decision_making.opening_discipline",
    ])
      expect(keys).not.toContain(k);
  });

  it.each([
    [4, 0],
    [4, 0.05],
    [6, 0.05],
    [8, 0.05],
    [4, 0.1],
    [8, 0.1],
  ])("false positives ≤ 2.5%% at the reference (k=%i matches, ρ=%f)", (k, rho) => {
    const r = rng(1234 + k * 100 + rho * 1000);
    const trials = 3000;
    let fp = 0;
    for (let i = 0; i < trials; i++)
      if (
        assessSignal(kastRows(REFERENCE, rho, k, 25, r), "decision_making.kast")!.status ===
        "RECOMMEND"
      )
        fp++;
    // Monte Carlo tolerance: 2.5% + 3 standard errors of the estimate.
    expect(fp / trials).toBeLessThanOrEqual(0.025 + 3 * Math.sqrt((0.025 * 0.975) / trials));
  });

  it("recommends a clearly lower rate with enough matches", () => {
    const r = rng(99);
    let hits = 0;
    for (let i = 0; i < 400; i++)
      if (
        assessSignal(kastRows(0.4, 0.05, 8, 25, r), "decision_making.kast")!.status === "RECOMMEND"
      )
        hits++;
    expect(hits / 400).toBeGreaterThan(0.8);
  });

  it("below the minimums only observes, and says what is missing", () => {
    const r = rng(7);
    const s = assessSignal(kastRows(0.2, 0, 3, 25, r), "decision_making.kast")!;
    expect(s).toMatchObject({ status: "OBSERVE", reason: "BELOW_RECOMMEND_MINIMUM" });
    expect(s.missing).toEqual({ sample: 25, matches: 1 });
    expect(s.value).not.toBeNull();
  });

  it("hides the value of an event rate below 10 events (never a number from 6 events)", () => {
    const rows: DnaFeatureRowV3[] = [
      {
        match_id: "a",
        partial_parse: false,
        sample_rounds: 20,
        sample_opening_duels: 6,
        features: { dueling: { opening_success: 0.2 } },
      },
    ];
    expect(assessSignal(rows, "dueling.opening_success")).toMatchObject({
      status: "OBSERVE",
      reason: "BELOW_SHOW_MINIMUM",
      value: null,
      sample: 6,
    });
  });

  it("clutch never recommends (no per-1vN split yet)", () => {
    const rows: DnaFeatureRowV3[] = Array.from({ length: 6 }, (_, i) => ({
      match_id: `m${i}`,
      partial_parse: false,
      sample_rounds: 24,
      sample_clutches: 8,
      features: { clutch: { clutch_win_rate: 0 } },
    }));
    expect(assessSignal(rows, "clutch.clutch_win_rate")!.reason).toBe("NEVER_RECOMMENDS");
  });

  it("blocks a recommendation carried by one match (Doc. 4 §5.6)", () => {
    const rows: DnaFeatureRowV3[] = [
      ...Array.from({ length: 4 }, (_, i) => ({
        match_id: `m${i}`,
        partial_parse: false,
        sample_rounds: 22,
        sample_opening_duels: 3,
        features: { dueling: { opening_success: 0.33 } },
      })),
      {
        match_id: "big",
        partial_parse: false,
        sample_rounds: 22,
        sample_opening_duels: 30,
        features: { dueling: { opening_success: 0 } },
      },
    ];
    expect(assessSignal(rows, "dueling.opening_success")!.reason).toBe("ONE_MATCH_DOMINATES");
  });

  it("orders by distance and keeps at most three priorities", () => {
    const rows: DnaFeatureRowV3[] = Array.from({ length: 10 }, (_, i) => ({
      match_id: `m${i}`,
      partial_parse: false,
      sample_rounds: 25,
      sample_kills: 20,
      sample_deaths: 20,
      features: {
        decision_making: { kast: 0.2 + (i % 2) * 0.02 },
        survivability: { survival_rate: 0.1 + (i % 2) * 0.02 },
        teamplay: { trade_participation: 0.25 + (i % 2) * 0.02 },
        positioning: { first_death_rate: 0.7 + (i % 2) * 0.02 },
        aim: { hs_rate: 0.3 + (i % 2) * 0.02 },
      },
    }));
    const r = computePrioritiesV2(rows);
    expect(r.priorities.length).toBe(MAX_PRIORITIES);
    const d = r.priorities.map((p) => p.distance);
    expect([...d].sort((a, b) => b - a)).toEqual(d);
    expect(r.observing.some((s) => s.status === "RECOMMEND")).toBe(true);
  });

  it("the clustered interval widens with between-match spread", () => {
    const tight = clusteredInterval([0.5, 0.5, 0.5, 0.5].map((v) => ({ value: v, weight: 25 })));
    const wide = clusteredInterval([0.2, 0.8, 0.3, 0.7].map((v) => ({ value: v, weight: 25 })));
    expect(tight.interval![1] - tight.interval![0]).toBeCloseTo(0, 10);
    expect(wide.interval![1] - wide.interval![0]).toBeGreaterThan(0.4);
  });
});
