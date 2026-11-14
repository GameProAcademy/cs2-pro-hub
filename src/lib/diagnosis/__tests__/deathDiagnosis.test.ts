import { describe, expect, it } from "vitest";
import {
  buildDeathContexts,
  DEATH_CONTEXT_CONTRACT,
  type DeathContextInput,
  type KillEventRow,
} from "../deathContext";
import {
  aggregateDeathPatterns,
  DEATH_RULES,
  evaluateDeathRules,
  PATTERN_POLICY,
} from "../deathRules";

// Synthetic identities only (no real SteamIDs).
const ME = "p-me";
const MATE = ["p-m1", "p-m2", "p-m3", "p-m4"];
const OPP = ["p-o1", "p-o2", "p-o3", "p-o4", "p-o5"];
const roster = (roundNumber: number) => [
  { roundNumber, participantKey: ME, side: "CT" as const },
  ...MATE.map((participantKey) => ({ roundNumber, participantKey, side: "CT" as const })),
  ...OPP.map((participantKey) => ({ roundNumber, participantKey, side: "T" as const })),
];
let seq = 0;
const kill = (over: Partial<KillEventRow>): KillEventRow => ({
  id: `k${String(++seq).padStart(4, "0")}`,
  roundNumber: 1,
  tick: 1000,
  timeSeconds: 10,
  actor: "p-o1",
  victim: ME,
  weapon: "ak47",
  headshot: true,
  distance: 12.5,
  attackerPosition: null,
  victimPosition: null,
  blind: false,
  wallbang: false,
  ...over,
});
const base = (over: Partial<DeathContextInput> = {}): DeathContextInput => ({
  matchId: "m1",
  map: "de_dust2",
  mapValidation: "VALIDATED",
  integrity: { status: "MATCH_COMPLETED", eligible: true, endedBy: "NORMAL", validRounds: 24 },
  rounds: [{ roundNumber: 1, startTick: 0, endTick: 9000, winnerSide: "T", winReason: "t_killed" }],
  roundPlayers: roster(1),
  kills: [],
  objectives: [],
  ...over,
});
const only = (input: DeathContextInput) => {
  const out = buildDeathContexts(input, ME);
  expect(out).toHaveLength(1);
  return out[0]!;
};

describe("cs2.death-context.v1", () => {
  it("reuses the pipeline trade window", () => {
    expect(DEATH_CONTEXT_CONTRACT.tradeWindowSeconds).toBe(5);
  });

  it("detects a trade by a teammate inside the window, same round", () => {
    const d = kill({ tick: 1000, timeSeconds: 10 });
    const t = kill({ tick: 1200, timeSeconds: 13, actor: "p-m1", victim: "p-o1" });
    const ctx = only(base({ kills: [d, t] }));
    expect(ctx.kind).toBe("ENEMY_KILL");
    expect(ctx.trade).toMatchObject({ status: "TRADED", tradeTick: 1200 });
  });

  it("reports NOT_OBSERVED when the revenge comes after the window", () => {
    const d = kill({ timeSeconds: 10 });
    const late = kill({ tick: 2000, timeSeconds: 15.1, actor: "p-m1", victim: "p-o1" });
    expect(only(base({ kills: [d, late] })).trade.status).toBe("NOT_OBSERVED");
  });

  it("never associates a kill from another round as a trade", () => {
    const d = kill({ roundNumber: 1, timeSeconds: 10 });
    const other = kill({
      roundNumber: 2,
      tick: 1001,
      timeSeconds: 11,
      actor: "p-m1",
      victim: "p-o1",
    });
    expect(
      only(base({ kills: [d, other], roundPlayers: [...roster(1), ...roster(2)] })).trade.status,
    ).toBe("NOT_OBSERVED");
  });

  it("an enemy killing the killer is not a trade", () => {
    const d = kill({ timeSeconds: 10 });
    const tk = kill({ tick: 1100, timeSeconds: 11, actor: "p-o2", victim: "p-o1" });
    expect(only(base({ kills: [d, tk] })).trade.status).toBe("NOT_OBSERVED");
  });

  it("without time_seconds the trade is NOT_MEASURED, never NOT_OBSERVED", () => {
    const ctx = only(base({ kills: [kill({ timeSeconds: null })] }));
    expect(ctx.trade.status).toBe("NOT_MEASURED");
    expect(ctx.missing).toContain("trade");
  });

  it("classifies self, team, world and unknown-attacker deaths and skips trade for them", () => {
    expect(only(base({ kills: [kill({ actor: ME })] })).kind).toBe("SELF_KILL");
    expect(only(base({ kills: [kill({ actor: "p-m1" })] })).kind).toBe("TEAM_KILL");
    expect(only(base({ kills: [kill({ actor: null, weapon: "world" })] })).kind).toBe("WORLD_KILL");
    expect(only(base({ kills: [kill({ actor: null, weapon: "planted_c4" })] })).kind).toBe(
      "WORLD_KILL",
    );
    const unknown = only(base({ kills: [kill({ actor: null, weapon: null })] }));
    expect(unknown.kind).toBe("UNKNOWN_ATTACKER");
    expect(unknown.trade.status).toBe("NOT_APPLICABLE");
    for (const r of evaluateDeathRules(unknown))
      expect(["INCONCLUSIVE", "NOT_SUPPORTED"]).toContain(r.outcome);
  });

  it("does not assume an enemy kill when the attacker is not in the roster", () => {
    expect(only(base({ kills: [kill({ actor: "p-stranger" })] })).kind).toBe("UNCLASSIFIED");
  });

  it("derives alive counts from strictly earlier deaths only", () => {
    const k1 = kill({ tick: 500, timeSeconds: 5, actor: "p-o1", victim: "p-m1" });
    const k2 = kill({ tick: 600, timeSeconds: 6, actor: "p-m2", victim: "p-o5" });
    const same = kill({ tick: 1000, timeSeconds: 10, actor: "p-o2", victim: "p-m2" });
    const d = kill({ tick: 1000, timeSeconds: 10 });
    const ctx = only(base({ kills: [k1, k2, same, d] }));
    expect(ctx.alive.teammates).toEqual({ value: 4, provenance: "DERIVED" }); // 5 - 1 (same tick not counted)
    expect(ctx.alive.enemies).toEqual({ value: 4, provenance: "DERIVED" });
    expect(ctx.round.openingDeath.value).toBe(false);
  });

  it("alive counts are NOT_MEASURED with an incomplete roster or an untimed kill", () => {
    const noSide = base({
      kills: [kill({})],
      roundPlayers: roster(1).map((p) => (p.participantKey === "p-o3" ? { ...p, side: null } : p)),
    });
    expect(only(noSide).alive.teammates.provenance).toBe("NOT_MEASURED");
    const untimed = base({ kills: [kill({ tick: null, victim: "p-m1" }), kill({})] });
    const ctx = only(untimed);
    expect(ctx.alive.teammates.provenance).toBe("NOT_MEASURED");
    expect(ctx.round.openingDeath.provenance).toBe("NOT_MEASURED");
  });

  it("marks the opening death and the post-plant context", () => {
    const ctx = only(
      base({
        kills: [kill({ tick: 3000 })],
        objectives: [{ roundNumber: 1, tick: 2500, type: "bomb_plant" }],
      }),
    );
    expect(ctx.round.openingDeath).toEqual({ value: true, provenance: "DERIVED" });
    expect(ctx.round.bombPlantedBeforeDeath.value).toBe(true);
    expect(ctx.round.won).toEqual({ value: false, provenance: "DERIVED" });
  });

  it("a round missing from match_rounds is invalid and gets no derived context", () => {
    const ctx = only(base({ kills: [kill({ roundNumber: 7 })], roundPlayers: roster(7) }));
    expect(ctx.round.valid).toBe(false);
    expect(ctx.trade.status).toBe("NOT_MEASURED");
    expect(ctx.alive.enemies.provenance).toBe("NOT_MEASURED");
    expect(ctx.missing).toContain("round");
    expect(evaluateDeathRules(ctx).every((r) => r.outcome !== "MATCH")).toBe(true);
  });

  it("keeps absent facts as NOT_MEASURED, never zero or false", () => {
    const ctx = only(base({ kills: [kill({ distance: null, headshot: null, blind: null })] }));
    expect(ctx.facts.distance).toEqual({ value: null, provenance: "NOT_MEASURED" });
    expect(ctx.facts.headshot.value).toBeNull();
    expect(ctx.missing).toEqual(expect.arrayContaining(["distance", "headshot", "blind"]));
  });

  it("draws positions only on a VALIDATED map", () => {
    const pos = { x: 1, y: 2, z: 3 };
    const k = kill({ victimPosition: pos, attackerPosition: pos });
    expect(only(base({ kills: [k] })).positions.drawable).toBe(true);
    const mirage = only(base({ map: "de_mirage", mapValidation: "NOT_VALIDATED", kills: [k] }));
    expect(mirage.positions.drawable).toBe(false);
    expect(mirage.positions.victim.provenance).toBe("OBSERVED");
  });

  it("carries the integrity decision, NOT_MEASURED for pre-contract matches", () => {
    expect(only(base({ kills: [kill({})], integrity: null })).integrity.status).toBeNull();
  });

  it("lists the unsupported analyses explicitly", () => {
    expect(only(base({ kills: [kill({})] })).unsupported).toEqual([
      "exposure",
      "isolation",
      "re_peek",
      "rotation_timing",
    ]);
  });
});

describe("cs2.death-rules.v1", () => {
  it("catalogues unsupported rules with the data they would need", () => {
    const unsupported = DEATH_RULES.filter((r) => r.provenance === "NOT_SUPPORTED");
    expect(unsupported.map((r) => r.id)).toEqual([
      "POSSIBLE_EXPOSURE",
      "POSSIBLE_ISOLATION",
      "RE_PEEK",
      "ROTATION_TIMING",
    ]);
    for (const r of unsupported) {
      expect(r.evaluate).toBeUndefined();
      expect(r.requires.length).toBeGreaterThan(0);
    }
  });

  it("evaluates a non-traded opening death in numeric disadvantage", () => {
    const k1 = kill({ tick: 500, timeSeconds: 5, actor: "p-o1", victim: "p-m1" });
    const d = kill({ tick: 1000, timeSeconds: 10 });
    const out = Object.fromEntries(
      evaluateDeathRules(only(base({ kills: [k1, d] }))).map((r) => [r.ruleId, r.outcome]),
    );
    expect(out).toMatchObject({
      TRADE_NOT_OBSERVED: "MATCH",
      OPENING_DEATH: "NO_MATCH",
      NUMERIC_DISADVANTAGE: "MATCH",
      POST_PLANT_DEATH: "NO_MATCH",
      POSSIBLE_EXPOSURE: "NOT_SUPPORTED",
    });
  });
});

describe("pattern aggregation", () => {
  const deathsIn = (matchId: string, n: number, eligible = true) =>
    Array.from(
      { length: n },
      (_, i) =>
        buildDeathContexts(
          base({
            matchId,
            integrity: {
              status: eligible ? "MATCH_COMPLETED" : "MATCH_END_UNVERIFIED",
              eligible,
              endedBy: null,
              validRounds: 20,
            },
            kills: [kill({ tick: 1000 + i })],
          }),
          ME,
        )[0]!,
    );

  it("never reports a pattern from a small sample", () => {
    const p = aggregateDeathPatterns(deathsIn("m1", 3)).find(
      (x) => x.ruleId === "TRADE_NOT_OBSERVED",
    )!;
    expect(p.status).toBe("INSUFFICIENT_SAMPLE");
    expect(p.occurrences).toBe(3);
  });

  it("reports recurrence with enough deaths across enough matches", () => {
    const all = [...deathsIn("m1", 4), ...deathsIn("m2", 4), ...deathsIn("m3", 4)];
    expect(all.length).toBeGreaterThanOrEqual(PATTERN_POLICY.minDeaths);
    const p = aggregateDeathPatterns(all).find((x) => x.ruleId === "TRADE_NOT_OBSERVED")!;
    expect(p).toMatchObject({ status: "RECURRENT", occurrences: 12, matches: 3 });
    expect(p.examples).toHaveLength(5);
  });

  it("excludes matches refused by the integrity gate", () => {
    const all = [...deathsIn("m1", 4), ...deathsIn("m2", 4), ...deathsIn("bad", 8, false)];
    const p = aggregateDeathPatterns(all).find((x) => x.ruleId === "TRADE_NOT_OBSERVED")!;
    expect(p.evaluatedDeaths).toBe(8);
    expect(p.status).toBe("INSUFFICIENT_SAMPLE");
  });

  it("does not count one match many times as a recurrent pattern", () => {
    const p = aggregateDeathPatterns(deathsIn("m1", 30)).find(
      (x) => x.ruleId === "TRADE_NOT_OBSERVED",
    )!;
    expect(p.status).toBe("INSUFFICIENT_SAMPLE");
  });
});
