/**
 * PM4 — Coach integration of modules E/F/G: the latest match's rounds/economy and the
 * last-10-matches evolution reach the Coach compacted from the same reports the pages render.
 * Economy not measured, empty denominators, clutch with a sample of 1, incompatible methods and
 * partial windows carry null (never 0); no identity, match id, round or tick is sent; the numbers
 * sent are accepted by the reply guard; the system prompt carries rules 27/28 in every locale.
 */
import { describe, expect, it } from "vitest";

import { coachSystemPrompt } from "@/lib/coach/coachContext";
import { backed, factNumbers } from "@/lib/coach/coachReplyGuard";
import { compactEvolution, compactRounds } from "@/lib/coach/roundsEvolution";
import { buildEvolution } from "@/lib/evolution/evolution";
import type { OverviewMatch } from "@/lib/playerOverview";
import {
  buildRoundReports,
  summarizeRounds,
  type RoundKill,
  type RoundsInput,
} from "@/lib/rounds/roundImpact";

const ME = "76561190000000001";
const T = [ME, "76561190000000002", "76561190000000003", "76561190000000004", "76561190000000005"];
const CT = [
  "76561190000000006",
  "76561190000000007",
  "76561190000000008",
  "76561190000000009",
  "76561190000000010",
];
const MATCH = "44444444-4444-4444-8444-444444444444";
const overviewMatch = (o: Partial<OverviewMatch> = {}): OverviewMatch => ({
  matchId: MATCH,
  map: "de_nuke",
  playedAt: "2026-11-01T00:00:00Z",
  dateSource: "played",
  resultStatus: "UNKNOWN",
  result: null,
  scorePlayer: null,
  scoreOpponent: null,
  source: "demo",
  kills: 20,
  deaths: 10,
  assists: 5,
  adr: 80,
  kast: 70,
  hsPercent: 50,
  rating: 1.1,
  firstKills: 3,
  firstDeaths: 2,
  tradeKills: 2,
  flashAssists: 1,
  flashAssistMethod: "GAME_FLAG",
  utilityDamage: null,
  clutchAttempts: 1,
  clutchWins: 1,
  ctRating: 1.2,
  tRating: 1.0,
  roundsPlayed: 20,
  admission: null,
  limitations: [],
  ...o,
});
const kill = (tick: number, actor: string, victim: string): RoundKill => ({
  id: `k${tick}`,
  roundNumber: 1,
  tick,
  timeSeconds: tick / 64,
  actor,
  victim,
  assister: null,
  weapon: "ak47",
  headshot: false,
});
const roundsInput = (spend: boolean, kills: RoundKill[]): RoundsInput => ({
  matchId: MATCH,
  rounds: [{ roundNumber: 1, startTick: 10000, endTick: 19000, winnerSide: "T", winReason: null }],
  roundPlayers: [
    ...T.map((k) => ({
      roundNumber: 1,
      participantKey: k,
      side: "T" as const,
      moneyStart: 4000,
      equipmentStart: 1000,
    })),
    ...CT.map((k) => ({
      roundNumber: 1,
      participantKey: k,
      side: "CT" as const,
      moneyStart: 4000,
      equipmentStart: 1000,
    })),
  ],
  kills,
  damage: [],
  objectives: [],
  roundEnds: [
    {
      roundNumber: 1,
      moneySpent: spend ? Object.fromEntries([...T, ...CT].map((k) => [k, 3000])) : null,
      disconnected: null,
    },
  ],
});
// 1v1 clutch won by the player: four teammates die, then the player kills the last enemy.
const clutchKills = [
  ...CT.slice(0, 4).map((v, i) => kill(10100 + i, ME, v)),
  ...T.slice(1).map((v, i) => kill(10200 + i, CT[4]!, v)),
  kill(10300, ME, CT[4]!),
];
const rounds = (spend: boolean, kills = clutchKills) =>
  compactRounds(
    overviewMatch(),
    summarizeRounds(buildRoundReports(roundsInput(spend, kills), ME)),
    spend,
  );

describe("Coach rounds/economy", () => {
  it("spend recorded: team buy rate with n/of/percent; the player's facts apart", () => {
    const r = rounds(true);
    expect(r.spendRecorded).toBe(true);
    expect(r.team.byBuy["full_buy"]).toEqual({ n: 1, of: 1, percent: 100 });
    expect(r.me.clutches["1v1"]).toEqual({ n: 1, of: 1, percent: 100 });
    expect(r.me.kills).toBe(5);
  });

  it("economy NOT_MEASURED: no buy category at all, unknown rounds counted", () => {
    const r = rounds(false);
    expect(r.spendRecorded).toBe(false);
    expect(r.team.byBuy).toEqual({});
    expect(r.team.unknownBuyRounds).toBe(1);
  });

  it("an empty denominator is percent null, never 0", () => {
    const r = rounds(true, []);
    expect(r.team.retakeCt).toEqual({ n: 0, of: 0, percent: null });
    expect(r.me.deathsTraded.percent).toBeNull();
  });

  it("no identity, match id or tick leaves the module; numbers are guard-backed", () => {
    const r = rounds(true);
    const json = JSON.stringify(r);
    for (const k of [...T, ...CT, MATCH, "10300"]) expect(json).not.toContain(k);
    const facts = factNumbers({ latestMatchRounds: r });
    expect(backed(100, 0, facts)).toBe(true);
  });
});

describe("Coach evolution", () => {
  const matches = (n: number, o: Partial<OverviewMatch> = {}) =>
    Array.from({ length: n }, (_, i) =>
      overviewMatch({
        matchId: `m${i}`,
        playedAt: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        ...o,
      }),
    );
  it("partial window keeps the real N and has no previous period", () => {
    const e = compactEvolution(buildEvolution(matches(7), { window: 10, map: null, side: "ALL" }));
    expect(e.window).toEqual({ requested: 10, n: 7, status: "PARTIAL" });
    const kd = e.metrics.find((m) => m.metric === "kd")!;
    expect(kd.value).toBe(2);
    expect(kd.comparison).toMatchObject({ status: "NO_PREVIOUS_PERIOD", delta: null });
    expect(JSON.stringify(e)).not.toContain("m3");
  });

  it("incompatible methods carry no value; zero denominators are NO_SAMPLE", () => {
    const ms = [
      ...matches(3, { flashAssistMethod: "TIMED_ATTRIBUTION" }),
      ...matches(3, { clutchAttempts: 0, clutchWins: 0 }),
    ].map((m, i) => ({
      ...m,
      clutchAttempts: 0,
      clutchWins: 0,
      playedAt: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const e = compactEvolution(buildEvolution(ms, { window: 10, map: null, side: "ALL" }));
    expect(e.metrics.find((m) => m.metric === "flashAssistsPerRound")).toMatchObject({
      status: "INCOMPATIBLE_METHODS",
      value: null,
    });
    expect(e.metrics.find((m) => m.metric === "clutchWinRate")).toMatchObject({
      status: "NO_SAMPLE",
      value: null,
    });
  });

  it("the system prompt states rules 27 and 28 in every locale", () => {
    for (const l of ["pt-BR", "pt-PT", "en", "es", "fr"] as const) {
      const prompt = coachSystemPrompt(l);
      expect(prompt).toContain("27. Rounds and economy");
      expect(prompt).toContain("28. Evolution");
      expect(prompt).toContain("never attribute a change to training");
    }
  });
});
