/**
 * PM4 4.2.7 — `cs2.rounds.v1`: opening (ties, world/self), trades in/out of the window, alive
 * counts (5v4, 4v5, 1vN, never negative), disconnect, clutch 1v1/1v2/1v3, post-plant/retake,
 * plant/defuse authorship, survival denominator, invalid rounds, overtime, and the summary.
 */
import { describe, expect, it } from "vitest";

import {
  buildRoundReports,
  summarizeRounds,
  type RoundKill,
  type RoundObjective,
  type RoundsInput,
} from "@/lib/rounds/roundImpact";

const ME = "me";
const T = ["me", "t1", "t2", "t3", "t4"];
const CT = ["c0", "c1", "c2", "c3", "c4"];
let seq = 0;
const kill = (
  round: number,
  tick: number,
  actor: string | null,
  victim: string,
  o: Partial<RoundKill> = {},
): RoundKill => ({
  id: `k${++seq}`,
  roundNumber: round,
  tick,
  timeSeconds: tick / 64,
  actor,
  victim,
  assister: null,
  weapon: actor ? "ak47" : "world",
  headshot: false,
  ...o,
});
const roster = (round: number, t = T, ct = CT) => [
  ...t.map((k) => ({
    roundNumber: round,
    participantKey: k,
    side: "T" as const,
    moneyStart: 4000,
    equipmentStart: 1000,
  })),
  ...ct.map((k) => ({
    roundNumber: round,
    participantKey: k,
    side: "CT" as const,
    moneyStart: 4000,
    equipmentStart: 1000,
  })),
];
const input = (
  o: Partial<RoundsInput> & { kills: RoundKill[] },
  rounds = [1],
  winner: "T" | "CT" = "T",
): RoundsInput => ({
  matchId: "m",
  rounds: rounds.map((n) => ({
    roundNumber: n,
    startTick: n * 10000,
    endTick: n * 10000 + 9000,
    winnerSide: winner,
    winReason: null,
  })),
  roundPlayers: rounds.flatMap((n) => roster(n)),
  damage: [],
  objectives: [],
  roundEnds: rounds.map((n) => ({
    roundNumber: n,
    moneySpent: Object.fromEntries([...T, ...CT].map((k) => [k, 3000])),
    disconnected: null,
  })),
  ...o,
});
const one = (i: RoundsInput) => buildRoundReports(i, ME)[0]!;

describe("opening", () => {
  it("first unique death: an enemy kill by me is my opening kill and the team's", () => {
    const r = one(input({ kills: [kill(1, 10100, "me", "c0"), kill(1, 10200, "c1", "t1")] }));
    expect(r.opening).toMatchObject({
      status: "OK",
      byMe: true,
      onMe: false,
      teamWon: true,
      kind: "ENEMY",
    });
  });
  it("two deaths on the same first tick are AMBIGUOUS (no arbitrary tie-break)", () => {
    const r = one(input({ kills: [kill(1, 10100, "me", "c0"), kill(1, 10100, "c1", "t1")] }));
    expect(r.opening.status).toBe("AMBIGUOUS");
  });
  it("a world/self first death is an opening death without an opening kill", () => {
    const w = one(input({ kills: [kill(1, 10100, null, "c0"), kill(1, 10200, "me", "c1")] }));
    expect(w.opening).toMatchObject({ status: "OK", kind: "WORLD", byMe: false, teamWon: null });
    const s = one(input({ kills: [kill(1, 10100, "me", "me")] }));
    expect(s.opening).toMatchObject({ kind: "SELF", onMe: true, byMe: false });
    expect(s.me?.kills).toBe(0);
  });
});

describe("trades", () => {
  it("a teammate's revenge within 5 s trades the death; after 5 s it does not", () => {
    const inside = one(
      input({ kills: [kill(1, 10000, "c0", "me"), kill(1, 10000 + 4 * 64, "t1", "c0")] }),
    );
    expect(inside.me?.deathTraded).toBe(true);
    const outside = one(
      input({ kills: [kill(1, 10000, "c0", "me"), kill(1, 10000 + 6 * 64, "t1", "c0")] }),
    );
    expect(outside.me?.deathTraded).toBe(false);
  });
  it("my kill of a teammate's killer inside the window is a trade kill", () => {
    const r = one(input({ kills: [kill(1, 10000, "c0", "t1"), kill(1, 10064, "me", "c0")] }));
    expect(r.me?.tradeKills).toBe(1);
  });
  it("a team kill is never traded", () => {
    const r = one(input({ kills: [kill(1, 10000, "t1", "me"), kill(1, 10064, "t2", "t1")] }));
    expect(r.me?.deathTraded).toBeNull();
  });
});

describe("alive counts, advantage and clutch", () => {
  it("5v4 after my opening kill is an advantage held; the round won converts it", () => {
    const r = one(input({ kills: [kill(1, 10100, "me", "c0")] }));
    expect(r.timeline[0]!.alive).toEqual({ T: 5, CT: 4 });
    expect(r.advantage).toEqual({ status: "OK", held: true, disadvantage: false });
  });
  it("4v5 is a disadvantage; deaths on one tick are applied together", () => {
    const r = one(
      input(
        {
          kills: [
            kill(1, 10100, "c0", "t1"),
            kill(1, 10200, "c0", "t2"),
            kill(1, 10200, "me", "c1"),
          ],
        },
        [1],
        "CT",
      ),
    );
    expect(r.timeline.find((x) => x.tick === 10200)!.alive).toEqual({ T: 3, CT: 4 });
    expect(r.advantage.disadvantage).toBe(true);
    expect(r.won).toBe(false);
  });
  it.each([1, 2, 3])(
    "1v%i clutch: last alive with N enemies; won needs round won and survival",
    (n) => {
      const deaths = ["t1", "t2", "t3", "t4"].map((v, i) => kill(1, 10100 + i, "c0", v));
      const enemyDeaths = CT.slice(0, 5 - n).map((v, i) => kill(1, 10000 + i, "me", v));
      const r = one(input({ kills: [...enemyDeaths, ...deaths] }));
      expect(r.clutch).toMatchObject({ opponents: n, won: true });
    },
  );
  it("a victim outside the roster invalidates the round (counts never go negative)", () => {
    const r = one(input({ kills: [kill(1, 10100, "me", "ghost")] }));
    expect(r).toMatchObject({ valid: false, invalidReason: "KILL_DATA" });
    expect(r.advantage.status).toBe("NOT_MEASURED");
  });
  it("a disconnect in the round: advantage NOT_MEASURED and the disconnected survival excluded", () => {
    const i = input({ kills: [kill(1, 10100, "c0", "t1")] });
    i.roundEnds[0]!.disconnected = { me: 10500 };
    const r = one(i);
    expect(r.disconnect).toBe(true);
    expect(r.advantage).toEqual({ status: "NOT_MEASURED", held: null, disadvantage: null });
    expect(r.me?.survived).toBeNull();
    expect(r.clutch).toBeNull();
  });
  it("a round that starts 4v5 counts the initial disadvantage", () => {
    const i = input({ kills: [] });
    i.roundPlayers = roster(1, T, CT).filter((p) => p.participantKey !== "t4");
    expect(one(i).advantage.disadvantage).toBe(true);
  });
});

describe("objective and survival", () => {
  const obj = (
    type: RoundObjective["type"],
    tick: number,
    actor: string | null,
  ): RoundObjective => ({ roundNumber: 1, tick, type, actor });
  it("post-plant: alive at the plant tick, planter authorship, defuse/explode", () => {
    const r = one(
      input({
        kills: [kill(1, 10100, "me", "c0")],
        objectives: [obj("bomb_plant", 10200, "me"), obj("bomb_explode", 12000, null)],
      }),
    );
    expect(r.postPlant).toMatchObject({
      plantedBy: "ME",
      alive: { own: 5, enemy: 4 },
      exploded: true,
      defused: false,
    });
    expect(r.me?.planted).toBe(true);
  });
  it("CT retake with a defuse by me", () => {
    const i = input(
      { kills: [], objectives: [obj("bomb_plant", 10200, "c0"), obj("bomb_defuse", 13000, "me")] },
      [1],
      "T",
    );
    i.roundPlayers = roster(1, CT, T);
    const r = one(i);
    expect(r.side).toBe("CT");
    expect(r.me?.defused).toBe(true);
    expect(r.postPlant?.plantedBy).toBe("ENEMY");
  });
  it("survival denominator: only valid rounds where the player's end state is known", () => {
    const i = input(
      { kills: [kill(1, 10100, "c0", "me"), kill(3, 30100, "me", "ghost")] },
      [1, 2, 3],
    );
    const s = summarizeRounds(buildRoundReports(i, ME));
    expect(s.me.survival).toEqual({ numerator: 1, denominator: 2 });
    expect(s.validRounds).toBe(2);
  });
  it("a round without boundary ticks is invalid", () => {
    const i = input({ kills: [] });
    i.rounds[0]!.endTick = null;
    expect(one(i)).toMatchObject({ valid: false, invalidReason: "ROUND_BOUNDARY" });
  });
  it("rounds after 24 are flagged overtime", () => {
    const i = input({ kills: [] }, [24, 25]);
    expect(buildRoundReports(i, ME).map((r) => r.overtime)).toEqual([false, true]);
  });
});

describe("summary keeps team and player apart", () => {
  it("buy results are team results; the player's numbers are his own", () => {
    const i = input({ kills: [kill(1, 10100, "me", "c0"), kill(1, 10200, "t1", "c1")] });
    const s = summarizeRounds(buildRoundReports(i, ME));
    expect(s.team.byBuy["full_buy"]).toEqual({ numerator: 1, denominator: 1 });
    expect(s.me.kills).toBe(1);
    expect(s.team.openingWon).toEqual({ numerator: 1, denominator: 1 });
  });
  it("spend not recorded => unknown buy rounds, never a category", () => {
    const i = input({ kills: [] });
    i.roundEnds[0]!.moneySpent = null;
    const s = summarizeRounds(buildRoundReports(i, ME));
    expect(s.team.unknownBuyRounds).toBe(1);
    expect(Object.keys(s.team.byBuy)).toEqual([]);
  });
});
