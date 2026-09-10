/**
 * FASE 2.7.1F — FINAL SEMANTIC CONTRACT CLEANUP.
 *
 * Last semantic barrier: the numbers the critical features really produce must
 * match the arithmetic the catalogue documents, the survival denominator must
 * stay a determinability claim, and every layer must keep answering "did this
 * round end?" with the ONE central rule.
 *
 * SYNTHETIC fixtures only — no real `.dem`, no parser worker, no network, no
 * database. These are unit/semantic tests, never an E2E proof.
 */
import { describe, expect, it } from "vitest";

import {
  PARSER_CONTRACT_VERSION,
  PARSER_NAME,
  PARSER_VERSION,
  PARSER_VERSION_CONFIRMED,
} from "@/config/pipeline";
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

const ended = (n: number) =>
  round(n, { winner_side: "CT", end_tick: 5000 * n, duration_seconds: 60 });

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

/** 4 ended rounds, ME kills in each, dies in round 4, damage both ways. */
const numbers = [1, 2, 3, 4];
const baseEvents: RawParserEvent[] = [
  ...numbers.flatMap((n) => [
    kill(n, 10 + n, ME, ENEMY_A),
    damage(n, ME, ENEMY_A, 100),
    damage(n, ENEMY_A, ME, 30),
  ]),
  kill(4, 40, ENEMY_B, ME),
];

const match = build(numbers.map(ended), baseEvents);
const metrics = computeMetrics(match, ME);
const features = extractFeatures(match, metrics);
const dim = (d: string, f: string) => features.dimensions[d]![f];
const clamp = (v: number) => Number(Math.max(0, Math.min(1, v)).toFixed(3));

/* ------------------------------------------------------------------ */
/* 1. Critical features: real numbers against the documented formulas  */
/* ------------------------------------------------------------------ */

describe("critical features match the catalogue arithmetic", () => {
  it("the fixture is fully covered (no partial parse)", () => {
    expect(match.quality.partialParse).toBe(false);
    expect(metrics.roundsPlayed).toBe(4);
    expect(metrics.kills).toBe(4);
    expect(metrics.deaths).toBe(1);
  });

  it("survival_rate = 1 - deaths / survivalRounds", () => {
    expect(metrics.survivalRounds).toBe(4);
    expect(dim("survivability", "survival_rate")).toBeCloseTo(1 - 1 / 4, 5);
    expect(FEATURE_CATALOG["survivability"]!["survival_rate"]!.formula).toContain("survivalRounds");
  });

  it("kills_per_round = min(1, kills / rounds_played)", () => {
    expect(dim("aim", "kills_per_round")).toBeCloseTo(clamp(4 / 4), 5);
  });

  it("damage_per_round = min(1, adr / 100)", () => {
    expect(metrics.adr).toBeCloseTo(400 / 4, 5);
    expect(dim("aim", "damage_per_round")).toBeCloseTo(clamp(metrics.adr! / 100), 5);
  });

  it("damage_taken_per_round = min(1, (damage_taken / rounds_played) / 120)", () => {
    expect(metrics.damageTaken).toBeCloseTo(120, 5);
    expect(dim("survivability", "damage_taken_per_round")).toBeCloseTo(clamp(120 / 4 / 120), 5);
  });

  it("first_death_rate = min(1, first_deaths / rounds_played) and its explicit complement", () => {
    const rate = dim("positioning", "first_death_rate");
    expect(rate).toBeCloseTo(clamp(metrics.firstDeaths! / 4), 5);
    expect(dim("positioning", "first_death_avoidance")).toBeCloseTo(clamp(1 - (rate as number)), 5);
  });

  it("trade_participation = min(1, trade_kills / rounds_played)", () => {
    expect(dim("teamplay", "trade_participation")).toBeCloseTo(clamp(metrics.tradeKills / 4), 5);
  });

  it("clutch_frequency = min(1, clutch_attempts / rounds_played)", () => {
    const expected = metrics.clutchAttempts > 0 ? clamp(metrics.clutchAttempts / 4) : null;
    expect(dim("clutch", "clutch_frequency")).toEqual(expected);
  });

  it("multi_kill_rate = min(1, multi_kills / rounds_played)", () => {
    const expected = metrics.multiKills > 0 ? clamp(metrics.multiKills / 4) : null;
    expect(dim("clutch", "multi_kill_rate")).toEqual(expected);
  });

  it("rating = min(1, source_rating / 1.6)", () => {
    expect(metrics.sourceRating).not.toBeNull();
    expect(dim("consistency", "rating")).toBeCloseTo(clamp(metrics.sourceRating! / 1.6), 5);
  });
});

/* ------------------------------------------------------------------ */
/* 2. survivalRounds is determinability, not roundsPlayed              */
/* ------------------------------------------------------------------ */

describe("survivalRounds is a determinability claim", () => {
  it("an ended round with no usable evidence for THIS player is not determinable", () => {
    // Round 2 ended, MATE played it, but ME has no event of any kind in it.
    const m = build(
      [ended(1), ended(2)],
      [kill(1, 12, ME, ENEMY_A), damage(1, ME, ENEMY_A, 100), kill(2, 20, MATE, ENEMY_B)],
    );
    expect(roundHasEndEvidence(m.rounds[1]!)).toBe(true);
    expect(playerSurvivedRound(m, ME, 2)).toBeNull();
  });

  it("a round with no end evidence is not determinable", () => {
    const m = build([round(1, {})], [kill(1, 12, ME, ENEMY_A), damage(1, ME, ENEMY_A, 100)]);
    expect(playerSurvivedRound(m, ME, 1)).toBeNull();
    expect(computeMetrics(m, ME).survivalRounds).toBeNull();
  });

  it("partial parse => survivalRounds NULL and survival_rate NULL, never 0", () => {
    const partial = build(numbers.map(ended), baseEvents, ["partial extraction"]);
    const pm = computeMetrics(partial, ME);
    expect(pm.survivalRounds).toBeNull();
    const rate = extractFeatures(partial, pm).dimensions["survivability"]!["survival_rate"];
    expect(rate).toBeNull();
    expect(rate).not.toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 3. One rule across the layers                                       */
/* ------------------------------------------------------------------ */

describe("round-end evidence stays a single rule across layers", () => {
  for (const [label, extra] of [
    ["winnerSide", { winner_side: "CT" }],
    ["winnerTeam", { winner_team: "A" }],
    ["endTick", { end_tick: 4200 }],
    ["durationSeconds", { duration_seconds: 55 }],
    ["endTick = 0", { end_tick: 0 }],
    ["durationSeconds = 0", { duration_seconds: 0 }],
  ] as const) {
    it(`${label} alone is accepted by normalizer quality, availability and the helper`, () => {
      const m = build(
        [round(1, extra as Record<string, unknown>)],
        [kill(1, 12, ME, ENEMY_A), damage(1, ME, ENEMY_A, 100)],
      );
      expect(hasRoundEndEvidence(m.rounds[0]!)).toBe(true);
      expect(m.quality.roundsValid).toBe(1);
      expect(computeMetrics(m, ME).availability.roundEndEvidence).toBe(true);
    });
  }

  it("no evidence at all is rejected consistently by every layer", () => {
    const m = build([round(1, {})], [kill(1, 12, ME, ENEMY_A), damage(1, ME, ENEMY_A, 100)]);
    expect(hasRoundEndEvidence(m.rounds[0]!)).toBe(false);
    expect(m.quality.roundsValid).toBe(0);
    const cm = computeMetrics(m, ME);
    expect(cm.availability.roundEndEvidence).toBe(false);
    expect(playerSurvivedRound(m, ME, 1)).toBeNull();
    expect(cm.survivalRounds).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* 4. Catalogue metadata semantics                                     */
/* ------------------------------------------------------------------ */

describe("catalogue metadata is semantically precise", () => {
  it("round-denominated covers round-derived denominators, not only rounds_played", () => {
    const spec = FEATURE_CATALOG["survivability"]!["survival_rate"]!;
    expect(spec.roundDenominated).toBe(true);
    expect(spec.denominator).toContain("survivalRounds");
    expect(spec.denominator).not.toContain("rounds_played");
  });

  it("every clamped ratio documents the clamp it really applies", () => {
    for (const [dimension, specs] of Object.entries(FEATURE_CATALOG)) {
      for (const [name, spec] of Object.entries(specs)) {
        if (spec.unit !== "ratio" && spec.unit !== "rate") continue;
        if (spec.denominator.startsWith("none")) continue;
        expect(spec.formula, `${dimension}.${name}`).toContain("min(1,");
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 5. Parser identity is still unconfirmed                             */
/* ------------------------------------------------------------------ */

describe("parser identity remains an unconfirmed placeholder", () => {
  it("PARSER_VERSION is not confirmed and is separate from the contract version", () => {
    expect(PARSER_VERSION_CONFIRMED).toBe(false);
    expect(typeof PARSER_VERSION).toBe("string");
    expect(typeof PARSER_CONTRACT_VERSION).toBe("number");
    expect(String(PARSER_CONTRACT_VERSION)).not.toBe(PARSER_VERSION);
  });
});
