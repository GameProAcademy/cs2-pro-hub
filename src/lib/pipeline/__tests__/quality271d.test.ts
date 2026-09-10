/**
 * FASE 2.7.1D — survival-rate round-end coverage and partial-parse rate semantics.
 *
 * SYNTHETIC fixtures only: no real `.dem`, no parser worker, no network, no
 * database. These are unit/semantic tests, never an E2E proof.
 */
import { describe, expect, it } from "vitest";

import { PARSER_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION } from "@/config/pipeline";
import { extractFeatures } from "@/lib/pipeline/features";
import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserEvent, RawParserOutput, RawParserRound } from "@/lib/pipeline/types";

const ME = "76561198000000001";
const MATE = "76561198000000002";
const ENEMY_A = "76561198000000101";
const ENEMY_B = "76561198000000102";

const kill = (round: number, time: number, attacker: string, victim: string): RawParserEvent => ({
  type: "player_death",
  round,
  time_seconds: time,
  attacker,
  victim,
});

const damage = (round: number, attacker: string, victim: string, dmg: number): RawParserEvent => ({
  type: "player_hurt",
  round,
  time_seconds: 20,
  attacker,
  victim,
  damage: dmg,
});

const sides = { [ME]: "CT", [MATE]: "CT", [ENEMY_A]: "T", [ENEMY_B]: "T" } as const;

/** A round with FULL end evidence. */
const endedRound = (number: number): RawParserRound =>
  ({
    number,
    winner_side: "CT",
    end_tick: 5000 * number,
    duration_seconds: 60,
    sides: { ...sides },
  }) as RawParserRound;

/** A round with NO end evidence at all (unknown outcome). */
const openRound = (number: number): RawParserRound =>
  ({
    number,
    sides: { ...sides },
  }) as RawParserRound;

function build(rounds: RawParserRound[], events: RawParserEvent[], warnings?: string[]) {
  const raw: RawParserOutput = {
    parser: { name: PARSER_NAME, version: PARSER_VERSION },
    contract_version: PARSER_CONTRACT_VERSION,
    header: { map: "de_mirage", tickrate: 64, duration_seconds: 600 },
    players: [
      { steam_id: ME, name: "me", team: "A" },
      { steam_id: MATE, name: "mate", team: "A" },
      { steam_id: ENEMY_A, name: "e1", team: "B" },
      { steam_id: ENEMY_B, name: "e2", team: "B" },
    ],
    rounds,
    events,
    ...(warnings ? { warnings } : {}),
  } as RawParserOutput;
  return normalizeParserOutput(raw);
}

/** Kill + damage evidence in every round, so only coverage varies per test. */
const eventsFor = (roundNumbers: number[]): RawParserEvent[] =>
  roundNumbers.flatMap((n) => [
    kill(n, 10 + n, ME, ENEMY_A),
    damage(n, ME, ENEMY_A, 100),
    damage(n, ENEMY_A, ME, 40),
  ]);

const survivalRate = (match: ReturnType<typeof build>) => {
  const metrics = computeMetrics(match, ME);
  return {
    metrics,
    value: extractFeatures(match, metrics).dimensions["survivability"]!["survival_rate"],
  };
};

/* ------------------------------------------------------------------ */
/* Survival rate — per-round round-end coverage                        */
/* ------------------------------------------------------------------ */

describe("survival_rate requires round-end evidence for EVERY round in the denominator", () => {
  it("TEST A: all rounds ended => survival_rate is a number", () => {
    const numbers = [1, 2, 3];
    const { metrics, value } = survivalRate(build(numbers.map(endedRound), eventsFor(numbers)));
    expect(metrics.survivalRounds).toBe(metrics.roundsPlayed);
    expect(value).not.toBeNull();
  });

  it("TEST B: one round of the denominator has no end evidence => NULL, not 0, not partial", () => {
    const numbers = [1, 2, 3];
    const rounds = [endedRound(1), endedRound(2), openRound(3)];
    const { metrics, value } = survivalRate(build(rounds, eventsFor(numbers)));
    // Aggregate evidence exists (rounds 1-2 ended) — that must NOT be enough.
    expect(metrics.availability.roundEndEvidence).toBe(true);
    expect(metrics.survivalRounds).toBeNull();
    expect(value).toBeNull();
    expect(value).not.toBe(0);
  });

  it("TEST C: no round has end evidence => survival_rate NULL", () => {
    const numbers = [1, 2];
    const { metrics, value } = survivalRate(build(numbers.map(openRound), eventsFor(numbers)));
    expect(metrics.availability.roundEndEvidence).toBe(false);
    expect(metrics.survivalRounds).toBeNull();
    expect(value).toBeNull();
  });

  it("TEST D: partial parse => survival_rate NULL even with kills and ended rounds", () => {
    const numbers = [1, 2];
    const match = build(numbers.map(endedRound), eventsFor(numbers), ["partial extraction"]);
    expect(match.quality.partialParse).toBe(true);
    const { metrics, value } = survivalRate(match);
    expect(metrics.survivalRounds).toBeNull();
    expect(value).toBeNull();
  });

  it("TEST E: an unended round never becomes a survival nor a death", () => {
    const rounds = [endedRound(1), openRound(2)];
    const match = build(rounds, eventsFor([1, 2]));
    const metrics = computeMetrics(match, ME);
    // Deaths remain exactly the observed death events (none for ME here).
    expect(metrics.deaths).toBe(0);
    expect(metrics.survivalRounds).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Partial parse — observed counters vs whole-match rates              */
/* ------------------------------------------------------------------ */

describe("partial parse: observed counters stay, whole-match rates go NULL", () => {
  const numbers = [1, 2];
  const partial = () => build(numbers.map(endedRound), eventsFor(numbers), ["partial extraction"]);
  const complete = () => build(numbers.map(endedRound), eventsFor(numbers));

  it("TEST F: observed counters are NOT discarded by partial parse", () => {
    const metrics = computeMetrics(partial(), ME);
    expect(metrics.kills).toBe(2);
    expect(metrics.assists).toBe(0);
    expect(metrics.headshots).toBe(0);
  });

  it("TEST F: round-denominated rates are NULL under partial parse", () => {
    const match = partial();
    const features = extractFeatures(match, computeMetrics(match, ME));
    expect(features.dimensions["aim"]!["kills_per_round"]).toBeNull();
    expect(features.dimensions["aim"]!["damage_per_round"]).toBeNull();
    expect(features.dimensions["dueling"]!["opening_participation"]).toBeNull();
    expect(features.dimensions["survivability"]!["damage_taken_per_round"]).toBeNull();
    expect(features.dimensions["positioning"]!["first_death_rate"]).toBeNull();
    expect(features.dimensions["teamplay"]!["assists_per_round"]).toBeNull();
    expect(features.dimensions["clutch"]!["clutch_frequency"]).toBeNull();
    expect(features.dimensions["clutch"]!["multi_kill_rate"]).toBeNull();
    expect(features.dimensions["decision_making"]!["kast"]).toBeNull();
  });

  it("TEST F: event-denominated ratios stay observed under partial parse", () => {
    const match = partial();
    const features = extractFeatures(match, computeMetrics(match, ME));
    // headshots / observed kills is self-consistent over what was observed.
    expect(features.dimensions["aim"]!["hs_rate"]).toBe(0);
    expect(features.dimensions["dueling"]!["kd_balance"]).not.toBeNull();
  });

  it("TEST G: full coverage keeps computing the same rates as before", () => {
    const match = complete();
    const features = extractFeatures(match, computeMetrics(match, ME));
    expect(features.dimensions["aim"]!["kills_per_round"]).not.toBeNull();
    expect(features.dimensions["aim"]!["damage_per_round"]).not.toBeNull();
    expect(features.dimensions["teamplay"]!["assists_per_round"]).not.toBeNull();
    expect(features.dimensions["survivability"]!["survival_rate"]).not.toBeNull();
    expect(features.dimensions["decision_making"]!["kast"]).not.toBeNull();
  });

  it("TEST H: NULL ≠ ZERO — present evidence with zero activity emits 0", () => {
    const match = complete();
    const features = extractFeatures(match, computeMetrics(match, ME));
    // Coverage present, player simply had no assist and no clutch: observed 0.
    expect(features.dimensions["teamplay"]!["assists_per_round"]).toBe(0);
    expect(features.dimensions["clutch"]!["clutch_frequency"]).toBe(0);
    // Absent evidence class: NULL, not 0.
    const noUtility = features.dimensions["utility"]!["grenades_per_round"];
    expect(noUtility).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Parser version is a placeholder, not a provisioning promise         */
/* ------------------------------------------------------------------ */

describe("parser release selection", () => {
  it("pins the confirmed Gate 1D parser release", async () => {
    const config = await import("@/config/pipeline");
    expect(config.PARSER_VERSION).toBe("0.42.0");
    expect(config.PARSER_VERSION_CONFIRMED).toBe(true);
    // Contract version stays a SEPARATE concept and is untouched.
    expect(config.PARSER_CONTRACT_VERSION).toBe(1);
  });
});
