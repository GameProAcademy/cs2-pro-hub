/**
 * SYNTHETIC parser-output fixture.
 *
 * This is NOT a real CS2 demo and does not pretend to be one: the repository
 * ships no `.dem` binary. It is a hand-written `RawParserOutput` payload that
 * exercises the contract the parser worker must fulfil, so the normalizer,
 * metrics and feature layers are testable without the parser, the network or
 * the database. Validating against a real demo requires running the parser
 * worker (see docs/PHASE-2-DEMO-PIPELINE.md).
 */
import { PARSER_CONTRACT_VERSION } from "@/config/pipeline";
import type { RawParserEvent, RawParserOutput } from "@/lib/pipeline/types";

export const ME = "76561198000000001";
export const MATE = "76561198000000002";
export const ENEMY_A = "76561198000000101";
export const ENEMY_B = "76561198000000102";

function kill(
  round: number,
  time: number,
  attacker: string,
  victim: string,
  extra: Partial<RawParserEvent> = {},
): RawParserEvent {
  return { type: "player_death", round, time_seconds: time, attacker, victim, ...extra };
}

function damage(round: number, time: number, attacker: string, victim: string, dmg: number): RawParserEvent {
  return { type: "player_hurt", round, time_seconds: time, attacker, victim, damage: dmg };
}

const ROUND_COUNT = 10;

const rounds = Array.from({ length: ROUND_COUNT }, (_, index) => ({
  number: index + 1,
  winner_side: index % 2 === 0 ? "CT" : "T",
  start_tick: index * 6400,
  end_tick: index * 6400 + 5000,
  duration_seconds: 78,
  bomb_planted: index % 3 === 0,
  bomb_defused: false,
  bomb_exploded: index % 3 === 0,
  money_start: { [ME]: 4500, [MATE]: 3000, [ENEMY_A]: 2000, [ENEMY_B]: 2000 },
  equipment_value: { [ME]: 4200, [MATE]: 3800, [ENEMY_A]: 1500, [ENEMY_B]: 1200 },
  sides: {
    [ME]: index < 5 ? "CT" : "T",
    [MATE]: index < 5 ? "CT" : "T",
    [ENEMY_A]: index < 5 ? "T" : "CT",
    [ENEMY_B]: index < 5 ? "T" : "CT",
  },
}));

const events: RawParserEvent[] = [
  // Round 1: opening kill by ME, then a second kill (2k), ME survives.
  kill(1, 12, ME, ENEMY_A, { headshot: true, weapon: "ak47", distance: 900 }),
  kill(1, 30, ME, ENEMY_B, { headshot: false, weapon: "ak47" }),
  damage(1, 11, ME, ENEMY_A, 100),
  damage(1, 29, ME, ENEMY_B, 100),

  // Round 2: ME dies first (early death) and IS traded by MATE.
  kill(2, 8, ENEMY_A, ME, { weapon: "awp" }),
  kill(2, 10, MATE, ENEMY_A, { weapon: "m4a1" }),

  // Round 3: ME dies late and is NOT traded.
  kill(3, 55, ENEMY_B, ME, { weapon: "deagle", headshot: true }),

  // Round 4: assist for ME, teammate finishes.
  kill(4, 40, MATE, ENEMY_A, { assister: ME }),
  damage(4, 38, ME, ENEMY_A, 70),

  // Round 5: flash assist by ME.
  { type: "player_blind", round: 5, time_seconds: 20, attacker: ME, victim: ENEMY_B, players_flashed: 1 },
  kill(5, 21, MATE, ENEMY_B),

  // Round 6: 1v2 clutch won by ME.
  kill(6, 15, ENEMY_A, MATE),
  kill(6, 25, ME, ENEMY_A),
  kill(6, 33, ME, ENEMY_B),

  // Round 7: utility damage by ME.
  damage(7, 18, ME, ENEMY_A, 40, ),
  { type: "hegrenade_detonate", round: 7, time_seconds: 18, attacker: ME },
  kill(7, 45, ENEMY_B, ME),

  // Rounds 8-10: quiet rounds where ME survives without a kill.
  kill(8, 30, MATE, ENEMY_A),
  kill(9, 30, ENEMY_A, MATE),
  kill(10, 30, MATE, ENEMY_B),
];

// Utility damage weapon tagging for the metrics engine.
const utilityDamage: RawParserEvent = {
  type: "player_hurt",
  round: 7,
  time_seconds: 18,
  attacker: ME,
  victim: ENEMY_B,
  damage: 35,
  weapon: "hegrenade",
};

export const syntheticParserOutput: RawParserOutput = {
  parser: { name: "demoparser2", version: "0.31.4", revision: "synthetic-fixture" },
  contract_version: PARSER_CONTRACT_VERSION,
  header: {
    map: "de_mirage",
    game_version: "13980",
    tickrate: 64,
    duration_seconds: 2100,
    match_date: "2026-01-15T20:00:00.000Z",
    score: { team_a: 6, team_b: 4 },
    teams: { team_a: "Team Alpha", team_b: "Team Bravo" },
  },
  players: [
    { steam_id: ME, name: "me", team: "Team Alpha", side: "CT" },
    { steam_id: MATE, name: "mate", team: "Team Alpha", side: "CT" },
    { steam_id: ENEMY_A, name: "enemy_a", team: "Team Bravo", side: "T" },
    { steam_id: ENEMY_B, name: "enemy_b", team: "Team Bravo", side: "T" },
  ],
  rounds,
  events: [...events, utilityDamage],
  warnings: [],
};
