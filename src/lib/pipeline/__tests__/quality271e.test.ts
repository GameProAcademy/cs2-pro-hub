/**
 * FASE 2.7.1E — one definition of round-end evidence, survival determinability,
 * and a catalogue that matches the implementation.
 *
 * SYNTHETIC fixtures only: no real `.dem`, no parser worker, no network, no
 * database. These are unit/semantic tests, never an E2E proof.
 */
import { describe, expect, it } from "vitest";

import { PARSER_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION } from "@/config/pipeline";
import { extractFeatures } from "@/lib/pipeline/features";
import { FEATURE_CATALOG } from "@/lib/pipeline/features.catalog";
import { computeMetrics, playerSurvivedRound, roundHasEndEvidence } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { hasRoundEndEvidence } from "@/lib/pipeline/roundEvidence";
import type { RawParserEvent, RawParserOutput, RawParserRound } from "@/lib/pipeline/types";

const ME = "76561198000000001";
const MATE = "76561198000000002";
const ENEMY_A = "76561198000000101";
const ENEMY_B = "76561198000000102";

const sides = { [ME]: "CT", [MATE]: "CT", [ENEMY_A]: "T", [ENEMY_B]: "T" } as const;

const round = (number: number, extra: Record<string, unknown>): RawParserRound =>
  ({ number, sides: { ...sides }, ...extra }) as RawParserRound;

const kill = (r: number, time: number, attacker: string, victim: string): RawParserEvent => ({
  type: "player_death",
  round: r,
  time_seconds: time,
  attacker,
  victim,
});

const damage = (r: number, attacker: string, victim: string, dmg: number): RawParserEvent => ({
  type: "player_hurt",
  round: r,
  time_seconds: 20,
  attacker,
  victim,
  damage: dmg,
});

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

const eventsFor = (numbers: number[]): RawParserEvent[] =>
  numbers.flatMap((n) => [
    kill(n, 10 + n, ME, ENEMY_A),
    damage(n, ME, ENEMY_A, 100),
    damage(n, ENEMY_A, ME, 40),
  ]);

/* ------------------------------------------------------------------ */
/* 1. THE central round-end evidence definition                        */
/* ------------------------------------------------------------------ */

describe("hasRoundEndEvidence is the single definition", () => {
  it("accepts winnerSide alone", () => {
    expect(hasRoundEndEvidence({ winnerSide: "CT" })).toBe(true);
  });

  it("accepts winnerTeam alone", () => {
    expect(hasRoundEndEvidence({ winnerTeam: "A" })).toBe(true);
  });

  it("accepts endTick alone", () => {
    expect(hasRoundEndEvidence({ endTick: 5000 })).toBe(true);
  });

  it("accepts durationSeconds alone", () => {
    expect(hasRoundEndEvidence({ durationSeconds: 42 })).toBe(true);
  });

  it("treats numeric ZERO as evidence, not as absence", () => {
    expect(hasRoundEndEvidence({ endTick: 0 })).toBe(true);
    expect(hasRoundEndEvidence({ durationSeconds: 0 })).toBe(true);
  });

  it("returns false only when every field is absent", () => {
    expect(hasRoundEndEvidence({})).toBe(false);
    expect(
      hasRoundEndEvidence({
        winnerSide: null,
        winnerTeam: null,
        endTick: null,
        durationSeconds: null,
      }),
    ).toBe(false);
  });

  it("metrics re-export delegates to the same rule (no second implementation)", () => {
    const match = build([round(1, { duration_seconds: 30 })], eventsFor([1]));
    const r = match.rounds[0]!;
    expect(roundHasEndEvidence(r)).toBe(hasRoundEndEvidence(r));
    expect(roundHasEndEvidence(r)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Every layer answers with the SAME rule                           */
/* ------------------------------------------------------------------ */

describe("normalizer quality and metrics availability share the rule", () => {
  it("a duration-only round counts as valid for the normalizer (no false partial_parse)", () => {
    const match = build([round(1, { duration_seconds: 30 }), round(2, { duration_seconds: 30 })], eventsFor([1, 2]));
    expect(match.quality.roundsValid).toBe(2);
    expect(match.quality.partialParse).toBe(false);
  });

  it("a winnerTeam-only round counts as valid for the normalizer", () => {
    const match = build([round(1, { winner_team: "A" })], eventsFor([1]));
    expect(match.quality.roundsValid).toBe(1);
  });

  it("availability.roundEndEvidence is true for a duration-only round", () => {
    const match = build([round(1, { duration_seconds: 30 })], eventsFor([1]));
    expect(computeMetrics(match, ME).availability.roundEndEvidence).toBe(true);
  });

  it("availability.roundEndEvidence is false with no evidence anywhere", () => {
    const match = build([round(1, {}), round(2, {})], eventsFor([1, 2]));
    expect(computeMetrics(match, ME).availability.roundEndEvidence).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Survival denominator = DETERMINABLE rounds only                  */
/* ------------------------------------------------------------------ */

describe("survivalRounds counts only rounds whose survival is determinable", () => {
  const ended = (n: number) => round(n, { winner_side: "CT", end_tick: 5000 * n, duration_seconds: 60 });

  it("all rounds determinable => denominator equals the participated rounds", () => {
    const numbers = [1, 2, 3];
    const match = build(numbers.map(ended), eventsFor(numbers));
    const metrics = computeMetrics(match, ME);
    for (const n of numbers) expect(playerSurvivedRound(match, ME, n)).not.toBeNull();
    expect(metrics.survivalRounds).toBe(metrics.roundsPlayed);
    expect(extractFeatures(match, metrics).dimensions["survivability"]!["survival_rate"]).not.toBeNull();
  });

  it("an indeterminable round is EXCLUDED, never counted as survived", () => {
    // Round 3 has no end evidence at all: its outcome for ME is unknown.
    const match = build([ended(1), ended(2), round(3, {})], eventsFor([1, 2, 3]));
    const metrics = computeMetrics(match, ME);
    expect(playerSurvivedRound(match, ME, 3)).toBeNull();
    // Incomplete coverage => the whole denominator is unknown, so NULL, not 2.
    expect(metrics.survivalRounds).toBeNull();
    expect(extractFeatures(match, metrics).dimensions["survivability"]!["survival_rate"]).toBeNull();
  });

  it("an explicit death is determinable and stays in the denominator", () => {
    const numbers = [1, 2];
    const match = build(numbers.map(ended), [...eventsFor(numbers), kill(2, 40, ENEMY_B, ME)]);
    const metrics = computeMetrics(match, ME);
    expect(playerSurvivedRound(match, ME, 2)).toBe(false);
    expect(metrics.deaths).toBe(1);
    expect(metrics.survivalRounds).toBe(metrics.roundsPlayed);
    const rate = extractFeatures(match, metrics).dimensions["survivability"]!["survival_rate"];
    expect(rate).toBeCloseTo(0.5, 5);
  });

  it("partial parse keeps the denominator NULL even when every round ended", () => {
    const numbers = [1, 2];
    const match = build(numbers.map(ended), eventsFor(numbers), ["partial extraction"]);
    expect(match.quality.partialParse).toBe(true);
    expect(computeMetrics(match, ME).survivalRounds).toBeNull();
  });

  it("NULL denominator means unknown, never zero survival", () => {
    const match = build([round(1, {})], eventsFor([1]));
    const metrics = computeMetrics(match, ME);
    expect(metrics.survivalRounds).toBeNull();
    const rate = extractFeatures(match, metrics).dimensions["survivability"]!["survival_rate"];
    expect(rate).toBeNull();
    expect(rate).not.toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 4. The catalogue agrees with the implementation                     */
/* ------------------------------------------------------------------ */

describe("feature catalogue is semantically synchronized with features.ts", () => {
  const numbers = [1, 2];
  const ended = (n: number) => round(n, { winner_side: "CT", end_tick: 5000 * n, duration_seconds: 60 });

  it("every emitted feature has catalogue metadata", () => {
    const match = build(numbers.map(ended), eventsFor(numbers));
    const features = extractFeatures(match, computeMetrics(match, ME));
    for (const [dimension, values] of Object.entries(features.dimensions)) {
      for (const name of Object.keys(values)) {
        expect(FEATURE_CATALOG[dimension]?.[name], `${dimension}.${name}`).toBeDefined();
      }
    }
  });

  it("every catalogue entry declares a denominator and a round-denomination flag", () => {
    for (const [dimension, features] of Object.entries(FEATURE_CATALOG)) {
      for (const [name, spec] of Object.entries(features)) {
        expect(spec.denominator, `${dimension}.${name}`).toBeTruthy();
        expect(typeof spec.roundDenominated, `${dimension}.${name}`).toBe("boolean");
      }
    }
  });

  it("every round-denominated entry documents the partial-parse NULL rule", () => {
    for (const [dimension, features] of Object.entries(FEATURE_CATALOG)) {
      for (const [name, spec] of Object.entries(features)) {
        if (!spec.roundDenominated) continue;
        expect(spec.nullBehavior.toLowerCase(), `${dimension}.${name}`).toContain("partial");
      }
    }
  });

  it("EXACTLY the round-denominated entries go NULL under a partial parse", () => {
    const partial = build(numbers.map(ended), eventsFor(numbers), ["partial extraction"]);
    const complete = build(numbers.map(ended), eventsFor(numbers));
    const partialFeatures = extractFeatures(partial, computeMetrics(partial, ME));
    const completeFeatures = extractFeatures(complete, computeMetrics(complete, ME));
    for (const [dimension, values] of Object.entries(completeFeatures.dimensions)) {
      for (const [name, completeValue] of Object.entries(values)) {
        if (completeValue === null) continue; // already unknown with full coverage
        const spec = FEATURE_CATALOG[dimension]![name]!;
        const partialValue = partialFeatures.dimensions[dimension]![name];
        if (spec.roundDenominated) {
          expect(partialValue, `${dimension}.${name} must be null under partial parse`).toBeNull();
        } else {
          expect(partialValue, `${dimension}.${name} must survive partial parse`).not.toBeNull();
        }
      }
    }
  });

  it("survival_rate is documented against survivalRounds, not rounds_played", () => {
    const spec = FEATURE_CATALOG["survivability"]!["survival_rate"]!;
    expect(spec.formula).toContain("survivalRounds");
    expect(spec.denominator).toContain("survivalRounds");
    expect(spec.roundDenominated).toBe(true);
  });
});
