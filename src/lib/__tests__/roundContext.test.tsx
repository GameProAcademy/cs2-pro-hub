/**
 * Marco 1 — round-context-v1: side and outcome of each own round, own kills/deaths/damage per side.
 * The winner is never derived from kills; unknown never becomes a win, a loss or a zero; the CT+T
 * split adds up to the match totals; teams are only checked, never named; reads are RLS-only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dictionaries, type Locale } from "@/i18n/config";
import { buildCoachFacts, coachSystemPrompt } from "@/lib/coach/coachContext";
import { guardCoachReply } from "@/lib/coach/coachReplyGuard";
import { buildXRay } from "@/lib/diagnostics/xray";
import { buildPlayerDna } from "@/lib/playerDna";
import type { PlayerOverview } from "@/lib/playerOverview";
import {
  buildMatchRounds,
  checkTeams,
  ROUND_CONTEXT_VERSION,
  SIDE_MIN_ROUNDS,
  summarizeRoundContext,
  type RoundEventRow,
  type RoundPlayerRow,
} from "@/lib/roundContext";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const ME = "76561190000000001";
const A = [
  "76561190000000001",
  "76561190000000002",
  "76561190000000003",
  "76561190000000004",
  "76561190000000005",
];
const B = [
  "76561190000000006",
  "76561190000000007",
  "76561190000000008",
  "76561190000000009",
  "76561190000000010",
];

/** Team A is CT in rounds 1..half and T afterwards; B the opposite (a regular side switch). */
function roster(rounds: number, half: number): RoundPlayerRow[] {
  const rows: RoundPlayerRow[] = [];
  for (let r = 1; r <= rounds; r++) {
    const aSide = r <= half ? "CT" : "T";
    const bSide = r <= half ? "T" : "CT";
    for (const p of A) rows.push({ round_number: r, participant_key: p, side: aSide });
    for (const p of B) rows.push({ round_number: r, participant_key: p, side: bSide });
  }
  return rows;
}
const kill = (round: number, actor: string, victim: string, id?: string): RoundEventRow => ({
  ...(id === undefined ? {} : { id }),
  round_number: round,
  event_type: "kill",
  actor_steam_id: actor,
  victim_steam_id: victim,
  damage: null,
});
const dmg = (round: number, actor: string, victim: string, damage: number): RoundEventRow => ({
  round_number: round,
  event_type: "damage",
  actor_steam_id: actor,
  victim_steam_id: victim,
  damage,
});

describe("one match", () => {
  const rounds = [
    { round_number: 1, winner_side: "CT" },
    { round_number: 2, winner_side: "T" },
    { round_number: 3, winner_side: null },
    { round_number: 4, winner_side: "CT" },
  ];
  const ctx = buildMatchRounds({
    matchId: "m1",
    participantKey: ME,
    rounds,
    roundPlayers: roster(4, 2),
    events: [
      kill(1, ME, B[0]!),
      kill(1, B[1]!, ME),
      dmg(1, ME, B[0]!, 100),
      dmg(4, ME, B[2]!, 40),
      kill(4, B[3]!, A[2]!),
      dmg(2, B[0]!, ME, 30),
    ],
  });

  it("side per round follows the switch; outcome = winner side vs own side", () => {
    expect(ctx.rounds.map((r) => [r.round, r.side, r.outcome])).toEqual([
      [1, "CT", "WON"],
      [2, "CT", "LOST"],
      [3, "T", "UNKNOWN"], // no recorded winner: never a win or a loss
      [4, "T", "LOST"],
    ]);
  });

  it("only the player's own kills, deaths and damage are counted", () => {
    expect(ctx.rounds[0]).toMatchObject({ kills: 1, deaths: 1, damage: 100 });
    expect(ctx.rounds[1]).toMatchObject({ kills: 0, deaths: 0, damage: 0 }); // damage taken is not given
    expect(ctx.rounds[3]).toMatchObject({ kills: 0, deaths: 0, damage: 40 }); // a teammate's death is not mine
  });

  it("the winner is never derived from kills: a wipe without a recorded winner stays UNKNOWN", () => {
    const wipe = buildMatchRounds({
      matchId: "m2",
      participantKey: ME,
      rounds: [{ round_number: 1, winner_side: null }],
      roundPlayers: roster(1, 1),
      events: B.map((v) => kill(1, ME, v)),
    });
    expect(wipe.rounds[0]).toMatchObject({ outcome: "UNKNOWN", kills: 5 });
  });

  it("missing or contradictory own side → UNKNOWN side and UNKNOWN outcome", () => {
    const rows: RoundPlayerRow[] = [
      { round_number: 1, participant_key: ME, side: null },
      { round_number: 2, participant_key: ME, side: "CT" },
      { round_number: 2, participant_key: ME, side: "T" },
    ];
    const c = buildMatchRounds({
      matchId: "m3",
      participantKey: ME,
      rounds: [
        { round_number: 1, winner_side: "CT" },
        { round_number: 2, winner_side: "CT" },
      ],
      roundPlayers: rows,
      events: [],
    });
    expect(c.rounds.map((r) => [r.side, r.outcome])).toEqual([
      ["UNKNOWN", "UNKNOWN"],
      ["UNKNOWN", "UNKNOWN"],
    ]);
  });

  it("an event read twice counts once; events without a round are ignored", () => {
    const c = buildMatchRounds({
      matchId: "m4",
      participantKey: ME,
      rounds: [{ round_number: 1, winner_side: "CT" }],
      roundPlayers: roster(1, 1),
      events: [
        kill(1, ME, B[0]!, "e1"),
        kill(1, ME, B[0]!, "e1"),
        { ...kill(1, ME, B[1]!), round_number: null },
      ],
    });
    expect(c.rounds[0]!.kills).toBe(1);
  });

  it("rounds without an own row are not the player's rounds", () => {
    const c = buildMatchRounds({
      matchId: "m5",
      participantKey: "76561199999999999",
      rounds,
      roundPlayers: roster(4, 2),
      events: [],
    });
    expect(c.rounds).toEqual([]);
  });
});

describe("teams are checked, never named", () => {
  it("two groups that always face each other → CONSISTENT", () => {
    expect(checkTeams(roster(24, 12))).toBe("CONSISTENT");
  });
  it("a player who changes group mid-match → INCONSISTENT", () => {
    const rows = roster(4, 2).map((r) =>
      r.round_number === 4 && r.participant_key === A[1] ? { ...r, side: "CT" } : r,
    );
    expect(checkTeams(rows)).toBe("INCONSISTENT");
  });
  it("more than two groups (a player never seen with anyone) → INCONSISTENT", () => {
    const rows: RoundPlayerRow[] = [
      { round_number: 1, participant_key: A[0]!, side: "CT" },
      { round_number: 1, participant_key: B[0]!, side: "T" },
      { round_number: 2, participant_key: A[1]!, side: "CT" },
    ];
    expect(checkTeams(rows)).toBe("INCONSISTENT");
  });
  it("no side at all → UNAVAILABLE", () => {
    expect(checkTeams(roster(2, 1).map((r) => ({ ...r, side: null })))).toBe("UNAVAILABLE");
  });
});

describe("summary per side", () => {
  const full = buildMatchRounds({
    matchId: "m6",
    participantKey: ME,
    rounds: Array.from({ length: 24 }, (_, i) => ({
      round_number: i + 1,
      winner_side: i % 3 === 0 ? "T" : "CT",
    })),
    roundPlayers: roster(24, 12),
    events: [
      kill(1, ME, B[0]!),
      kill(13, ME, B[1]!),
      kill(14, ME, B[2]!),
      kill(20, B[0]!, ME),
      dmg(2, ME, B[0]!, 77),
      dmg(15, ME, B[0]!, 90),
    ],
  });

  it("counts are observed; rates derived only from SIDE_MIN_ROUNDS rounds", () => {
    const s = summarizeRoundContext([full]);
    expect(s).toMatchObject({
      version: ROUND_CONTEXT_VERSION,
      status: "OBSERVED",
      matches: 1,
      rounds: 24,
      roundsSideUnknown: 0,
    });
    expect(s.ct).toMatchObject({
      rounds: 12,
      roundsWon: 8,
      roundsLost: 4,
      kills: 1,
      deaths: 0,
      damage: 77,
      rateStatus: "DERIVED",
      roundWinRate: 66.7,
      killsPerRound: 0.08,
      damagePerRound: 6.4,
    });
    expect(s.t).toMatchObject({
      rounds: 12,
      roundsWon: 4,
      roundsLost: 8,
      kills: 2,
      deaths: 1,
      damage: 90,
    });
    expect(s.teamCheck).toEqual({ consistent: 1, inconsistent: 0, unavailable: 0 });
  });

  it("CT + T reproduce the match totals (same attribution as the pipeline)", () => {
    const s = summarizeRoundContext([full]);
    expect(s.ct.kills + s.t.kills).toBe(3);
    expect(s.ct.deaths + s.t.deaths).toBe(1);
    expect(s.ct.damage + s.t.damage).toBe(167);
  });

  it(`below ${SIDE_MIN_ROUNDS} rounds on a side: counts shown, rates null`, () => {
    const small = buildMatchRounds({
      matchId: "m7",
      participantKey: ME,
      rounds: [{ round_number: 1, winner_side: "CT" }],
      roundPlayers: roster(1, 1),
      events: [kill(1, ME, B[0]!)],
    });
    const s = summarizeRoundContext([small]);
    expect(s.ct).toMatchObject({
      rounds: 1,
      roundsWon: 1,
      kills: 1,
      rateStatus: "INSUFFICIENT_SAMPLE",
      roundWinRate: null,
      killsPerRound: null,
      damagePerRound: null,
    });
    expect(s.t).toMatchObject({ rounds: 0, rateStatus: "INSUFFICIENT_SAMPLE", roundWinRate: null });
  });

  it("only unknown outcomes → no win rate even with enough rounds", () => {
    const unknown = buildMatchRounds({
      matchId: "m8",
      participantKey: ME,
      rounds: [],
      roundPlayers: roster(12, 12),
      events: [],
    });
    expect(summarizeRoundContext([unknown]).ct).toMatchObject({
      rounds: 12,
      roundsOutcomeUnknown: 12,
      rateStatus: "DERIVED",
      roundWinRate: null,
    });
  });

  it("the same match twice counts once; no matches → EMPTY", () => {
    expect(summarizeRoundContext([full, full]).rounds).toBe(24);
    expect(summarizeRoundContext([])).toMatchObject({ status: "EMPTY", rounds: 0 });
  });
});

describe("surfaces", () => {
  const overview = { matches: [], aggregates: null } as unknown as PlayerOverview;
  const ctx = summarizeRoundContext([
    buildMatchRounds({
      matchId: "m9",
      participantKey: ME,
      rounds: Array.from({ length: 20 }, (_, i) => ({
        round_number: i + 1,
        winner_side: i < 7 ? "CT" : "T",
      })),
      roundPlayers: roster(20, 10),
      events: [kill(1, ME, B[0]!), dmg(1, ME, B[0]!, 120)],
    }),
  ]);

  it("X-ray carries the context and stops listing kills/damage per side as unsupported", () => {
    const x = buildXRay({ overview, dna: buildPlayerDna([]), sides: [], roundContext: ctx });
    expect(x.roundContext).toBe(ctx);
    expect(x.unsupported).not.toContain("sideSplitKills");
    const without = buildXRay({ overview, dna: buildPlayerDna([]), sides: [] });
    expect(without.roundContext).toBeNull();
    expect(without.unsupported).toContain("sideSplitKills");
  });

  it("Coach facts hold the same numbers, numerically, and the guard keeps them", () => {
    const xray = buildXRay({ overview, dna: buildPlayerDna([]), sides: [], roundContext: ctx });
    const facts = buildCoachFacts(overview, buildPlayerDna([]), "pt-BR", { xray });
    expect(facts.sides.roundContextVersion).toBe("round-context-v1");
    expect(facts.sides.ct.roundContext).toMatchObject({
      roundsWon: 7,
      roundsLost: 3,
      kills: 1,
      damage: 120,
      roundWinRatePercent: 70,
    });
    expect(facts.sides.t.roundContext).toMatchObject({
      roundsWon: 10,
      roundsLost: 0,
      roundWinRatePercent: 100,
    });
    const reply = guardCoachReply(
      "Dados\n\n- Como CT você venceu 7 rounds e perdeu 3 (70%).\n\nInterpretação\n\nok.\n\nRecomendação\n\nok.",
      facts,
      "pt-BR",
    );
    expect(reply.text).toContain("70%");
    expect(reply.removed.stats).toBe(0);
    const none = buildCoachFacts(overview, buildPlayerDna([]), "en");
    expect(none.sides).toMatchObject({
      roundContextVersion: null,
      ct: { roundContext: null },
      t: { roundContext: null },
    });
  });

  it("the Coach is told rounds won are the recorded winning side, never the score or teams", () => {
    const p = coachSystemPrompt("en");
    expect(p).toContain("23. Sides and rounds");
    expect(p).toContain("never derive who won from kills or deaths");
    expect(p).toContain("Never swap CT and T");
  });

  it("reads are RLS-only, per match, own events only, no writes, no service role", () => {
    const fn = read("src/lib/xray.functions.ts");
    const loader = fn.slice(fn.indexOf("export async function loadRoundContext"));
    expect(loader).toContain('.from("match_rounds")');
    expect(loader).toContain('.from("round_players")');
    expect(loader).toContain('.from("round_events")');
    expect(loader).toContain('.eq("match_id", matchId)');
    expect(loader).toContain(
      "actor_steam_id.eq.${participantKey},victim_steam_id.eq.${participantKey}",
    );
    expect(fn).toContain("/^\\d{1,20}$/.test(key)");
    expect(fn).not.toMatch(
      /service_role|client\.server|supabaseAdmin|\.(insert|update|upsert|delete|rpc)\(/,
    );
    expect(read("src/lib/coach.functions.ts")).toContain(
      "buildXRay({ overview, dna, sides, roundContext })",
    );
  });

  it.each<Locale>(["pt-BR", "pt-PT", "en", "es", "fr"])(
    "%s: every round-context label exists",
    (locale) => {
      const d = dictionaries[locale] as Record<string, string>;
      for (const k of [
        "note",
        "outcome",
        "outcomeValue",
        "outcomeUnknown",
        "killsDeaths",
        "winRate",
        "kpr",
        "adr",
        "insufficient",
      ])
        expect(d[`xray.roundContext.${k}`], `${locale} ${k}`).toBeTruthy();
      expect(d["xray.roundContext.note"]).toMatch(/L04/);
    },
  );
});
