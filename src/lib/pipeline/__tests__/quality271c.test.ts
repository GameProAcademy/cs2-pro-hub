/**
 * FASE 2.7.1C — rating evidence gates, opening determinability and coverage.
 *
 * Every case here is built from a SYNTHETIC `RawParserOutput`: no real `.dem`
 * file, no parser worker, no network, no database. The point is the honesty of
 * the NULL/ZERO decision, not the numeric value.
 */
import { describe, expect, it } from "vitest";

import { PARSER_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION } from "@/config/pipeline";
import { computeMetrics, openingDuels } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserEvent, RawParserOutput } from "@/lib/pipeline/types";

const ME = "76561198000000001";
const MATE = "76561198000000002";
const ENEMY_A = "76561198000000101";
const ENEMY_B = "76561198000000102";

const kill = (
  round: number,
  time: number | null,
  attacker: string,
  victim: string,
): RawParserEvent => ({
  type: "player_death",
  round,
  ...(time == null ? {} : { time_seconds: time }),
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

function build(events: RawParserEvent[], opts: { warnings?: string[] } = {}) {
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
    rounds: [1, 2].map((number) => ({
      number,
      winner_side: "CT",
      end_tick: 5000 * number,
      duration_seconds: 60,
      sides: { [ME]: "CT", [MATE]: "CT", [ENEMY_A]: "T", [ENEMY_B]: "T" },
    })),
    events,
    ...(opts.warnings ? { warnings: opts.warnings } : {}),
  } as RawParserOutput;
  return normalizeParserOutput(raw);
}

/* ------------------------------------------------------------------ */
/* Rating evidence gates                                               */
/* ------------------------------------------------------------------ */

describe("rating requires kill AND damage evidence AND complete coverage", () => {
  const kills = [kill(1, 10, ME, ENEMY_A), kill(2, 15, ENEMY_A, ME)];
  const damages = [damage(1, ME, ENEMY_A, 100), damage(2, ENEMY_A, ME, 100)];

  it("A: kills + damage + full coverage => rating is a number", () => {
    const metrics = computeMetrics(build([...kills, ...damages]), ME);
    expect(metrics.availability.completeCoverage).toBe(true);
    expect(metrics.sourceRating).not.toBeNull();
    expect(metrics.ctRating).not.toBeNull();
  });

  it("B: damage only (no kill events) => rating NULL, never a number from implicit zeros", () => {
    const metrics = computeMetrics(build(damages), ME);
    expect(metrics.availability.killEvents).toBe(false);
    expect(metrics.sourceRating).toBeNull();
    expect(metrics.ctRating).toBeNull();
    expect(metrics.tRating).toBeNull();
  });

  it("C: kills only (no damage events) => rating NULL", () => {
    const metrics = computeMetrics(build(kills), ME);
    expect(metrics.availability.damageEvents).toBe(false);
    expect(metrics.sourceRating).toBeNull();
    expect(metrics.ctRating).toBeNull();
  });

  it("D: partial parse => rating and KAST NULL even with kills and damage", () => {
    const match = build([...kills, ...damages], { warnings: ["partial extraction"] });
    expect(match.quality.partialParse).toBe(true);
    const metrics = computeMetrics(match, ME);
    expect(metrics.availability.completeCoverage).toBe(false);
    expect(metrics.sourceRating).toBeNull();
    expect(metrics.ctRating).toBeNull();
    expect(metrics.kast).toBeNull();
    // Raw observed counters stay observable: they are counts, not rates.
    expect(metrics.kills).toBe(1);
    expect(metrics.deaths).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Opening determinability                                             */
/* ------------------------------------------------------------------ */

describe("opening duels only over rounds with determinable ordering", () => {
  it("unknown instant is not late: the round is excluded, not resolved by order", () => {
    const result = openingDuels([
      { round: 1, time: null, attacker: ENEMY_A, victim: ME, assister: null, headshot: null, flashAssister: null },
      { round: 1, time: 30, attacker: ME, victim: ENEMY_B, assister: null, headshot: null, flashAssister: null },
    ]);
    expect(result.determinableRounds.size).toBe(0);
    expect(result.ambiguousRounds.has(1)).toBe(true);
    expect(result.openings.size).toBe(0);
  });

  it("a tie on the earliest instant is ambiguous", () => {
    const result = openingDuels([
      { round: 3, time: 10, attacker: ME, victim: ENEMY_A, assister: null, headshot: null, flashAssister: null },
      { round: 3, time: 10, attacker: ENEMY_B, victim: MATE, assister: null, headshot: null, flashAssister: null },
    ]);
    expect(result.ambiguousRounds.has(3)).toBe(true);
  });

  it("one ambiguous round does not invalidate the determinable rounds", () => {
    const metrics = computeMetrics(
      build([
        kill(1, 10, ME, ENEMY_A),
        kill(2, null, ENEMY_A, ME),
        kill(2, 40, ME, ENEMY_B),
        damage(1, ME, ENEMY_A, 100),
      ]),
      ME,
    );
    // Round 1 is determinable and the player won its opening duel.
    expect(metrics.firstKills).toBe(1);
    expect(metrics.firstDeaths).toBe(0);
    expect(metrics.openingAttempts).toBe(1);
    expect(metrics.openingSuccessRate).toBe(1);
  });

  it("no determinable round => opening sample is NULL, not zero", () => {
    const metrics = computeMetrics(build([kill(1, null, ENEMY_A, ME), kill(1, null, ME, ENEMY_B)]), ME);
    expect(metrics.firstKills).toBeNull();
    expect(metrics.firstDeaths).toBeNull();
    expect(metrics.openingAttempts).toBeNull();
    expect(metrics.openingSuccess).toBeNull();
    expect(metrics.openingSuccessRate).toBeNull();
  });

  it("no kill evidence at all => opening sample is NULL", () => {
    const metrics = computeMetrics(build([damage(1, ME, ENEMY_A, 50)]), ME);
    expect(metrics.availability.killEvents).toBe(false);
    expect(metrics.openingAttempts).toBeNull();
  });
});
