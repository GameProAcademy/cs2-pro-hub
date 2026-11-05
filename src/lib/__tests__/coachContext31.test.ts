/**
 * Fase 3.1 — integrity of the AI Coach context (coach-context-v1).
 *
 * No provisional Player DNA (no index, no "N / 100", no strongest/weakest) below the canonical
 * minimum sample; flash assists carry their real provenance; every overall value comes from the
 * xray-v1 contract with status, unit, sample and source; minimal, question-specific context;
 * deterministic rounding; the player's identity and data come only from the caller's session.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCoachFacts,
  buildCoachMessages,
  coachDnaReadings,
  coachSystemPrompt,
  COACH_CONTEXT_CONTRACT,
  mapsNamedIn,
} from "@/lib/coach/coachContext";
import { coachNeeds } from "@/lib/catalog/catalogSelect";
import { buildXRay } from "@/lib/diagnostics/xray";
import { buildPlayerDna, type RealPlayerDna } from "@/lib/playerDna";
import { aggregate, type OverviewMatch, type PlayerOverview } from "@/lib/playerOverview";

const read = (p: string) => readFileSync(resolve(p), "utf8");
const L04 = [
  "L01-CAPABILITY-SURFACE-UNENUMERABLE",
  "L02-TICK-DOMAIN-AUTHORITY-UNAVAILABLE",
  "L03-USERCMD-UNAVAILABLE",
  "L04-MATCH-RESULT-UNRESOLVED",
];

function m(id: string, over: Partial<OverviewMatch> = {}): OverviewMatch {
  return {
    matchId: id,
    map: "de_nuke",
    playedAt: "2026-11-03T05:35:03Z",
    dateSource: "processed",
    resultStatus: "UNRESOLVED_BY_DEMO",
    result: null,
    scorePlayer: null,
    scoreOpponent: null,
    source: "demo",
    kills: 18,
    deaths: 10,
    assists: 4,
    adr: 117.6,
    kast: 84.2,
    hsPercent: 27.8,
    rating: 1.13,
    firstKills: 3,
    firstDeaths: 0,
    tradeKills: 3,
    flashAssists: 0,
    utilityDamage: 38,
    clutchAttempts: 1,
    clutchWins: 1,
    ctRating: 0.78,
    tRating: 1.72,
    roundsPlayed: 19,
    admission: "LIMITED",
    limitations: L04,
    ...over,
  };
}
const ancient = m("ancient", {
  map: "de_ancient",
  playedAt: "2026-11-03T23:31:36Z",
  kills: 2,
  deaths: 13,
  adr: 34.4,
  kast: 40,
  hsPercent: 0,
  rating: 0.18,
  firstKills: 1,
  tradeKills: 0,
  utilityDamage: 71,
  clutchAttempts: null,
  clutchWins: null,
  ctRating: 0.2,
  tRating: 0.08,
  roundsPlayed: 15,
});
const overview = (matches: OverviewMatch[]): PlayerOverview => ({
  state: matches.length ? "READY" : "EMPTY",
  generatedAt: "2026-11-04T00:00:00Z",
  counts: {
    total: 0,
    inFlight: 0,
    processed: 0,
    failed: 0,
    blocked: 0,
    cancelled: 0,
    identityPending: 0,
  },
  latestJobs: [],
  matches,
  aggregates: aggregate(matches),
});

const VALUES: Record<string, number | null> = {
  aim: 0.45,
  dueling: 0.69,
  survivability: 0.52,
  positioning: 0.71,
  utility: 0.27,
  decision_making: 0.87,
  teamplay: 0.24,
  economy: null,
  clutch: 0.57,
  consistency: 0.44,
};
function dna(
  state: RealPlayerDna["state"],
  matches: number,
  values: Record<string, number | null> = VALUES,
): RealPlayerDna {
  return {
    state,
    matches,
    rounds: 34,
    partialMatches: 0,
    minimumMatches: 3,
    dimensions: Object.entries(values).map(([dimension, value]) => ({
      dimension: dimension as never,
      value,
      signals: [
        {
          name: "damage_per_round",
          mean: value,
          matches: value === null ? 0 : matches,
          unit: "rate",
          direction: "up",
          foldedIntoDimension: true,
        },
      ],
    })),
  };
}
const two = overview([m("nuke"), ancient]);
const PROVISIONAL = /\d+ \/ 100/;

describe("3.1.1 provisional Player DNA never reaches the model", () => {
  for (const [label, d] of [
    ["INSUFFICIENT_SAMPLE (2 of 3)", dna("INSUFFICIENT_SAMPLE", 2)],
    ["IN_FORMATION via a real 2-match build", dna("INSUFFICIENT_SAMPLE", 2)],
  ] as const) {
    it(`${label}: no index, no "/ 100", no strongest/weakest, no inference, in any form`, () => {
      const facts = buildCoachFacts(two, d, "pt-BR", {
        message: "qual minha maior fraqueza no perfil?",
      });
      expect(facts.contract).toBe(COACH_CONTEXT_CONTRACT);
      expect(facts.dataState).toBe("INSUFFICIENT_SAMPLE");
      expect(facts.playerDna).toEqual({
        status: "INSUFFICIENT_SAMPLE",
        matches: 2,
        minimumMatches: 3,
        dimensions: [],
        strongest: [],
        weakest: [],
      });
      expect(facts.inferences).toEqual([]);
      const system = buildCoachMessages(facts, [], "x", "pt-BR")[0]!.content;
      const factsJson = system.slice(system.indexOf("PLAYER_FACTS = "));
      expect(factsJson).not.toMatch(PROVISIONAL);
      expect(factsJson).not.toMatch(/"(index|strongest|weakest)":\s*(\d|\[\{)/);
    });
  }

  it("a real 2-match DNA built from features is INSUFFICIENT_SAMPLE and leaks nothing", () => {
    const rows = ["nuke", "ancient"].map((id) => ({
      match_id: id,
      partial_parse: false,
      sample_rounds: 17,
      features: { aim: { damage_per_round: 0.672, hs_rate: 0.139 } },
    }));
    const facts = buildCoachFacts(two, buildPlayerDna(rows), "en", { message: "my aim profile" });
    expect(facts.playerDna.status).toBe("INSUFFICIENT_SAMPLE");
    expect(JSON.stringify(facts)).not.toMatch(PROVISIONAL);
  });

  it("READY with the minimum sample: dimensions, ranking and inferences are sent", () => {
    const facts = buildCoachFacts(two, dna("READY", 3), "en", { message: "my profile" });
    expect(facts.dataState).toBe("READY");
    expect(facts.playerDna.status).toBe("READY");
    expect(facts.playerDna.weakest.map((w) => w.shown)).toEqual(["24 / 100"]);
    expect(facts.playerDna.strongest.map((w) => w.shown)).toEqual(["87 / 100"]);
    expect(facts.inferences.map((i) => i.shown)).toEqual(["24 / 100", "27 / 100", "44 / 100"]);
    expect(facts.inferences.every((i) => i.status === "INFERRED")).toBe(true);
  });

  it("a null dimension is never sent (not observed, never 0) even when READY", () => {
    const facts = buildCoachFacts(two, dna("READY", 3), "en", { message: "economy profile" });
    expect(facts.playerDna.dimensions.find((d) => /econom/i.test(d.dimension))).toBeUndefined();
    expect(JSON.stringify(facts.playerDna)).not.toMatch(/"0 \/ 100"/);
  });

  it("incomplete signals stay as measured means with their sample, only when READY", () => {
    const partial = dna("READY", 3, { aim: 0.45, utility: null });
    const facts = buildCoachFacts(two, partial, "en", { message: "aim profile" });
    expect(facts.playerDna.dimensions).toHaveLength(1);
    expect(facts.playerDna.dimensions[0]!.signals[0]).toMatchObject({ matches: 3 });
  });

  it("no history (no matches): NOT_OBSERVED, nothing to rank", () => {
    const facts = buildCoachFacts(overview([]), buildPlayerDna([]), "fr");
    expect(facts.dataState).toBe("NO_MATCHES");
    expect(facts.playerDna.status).toBe("NOT_OBSERVED");
    expect(facts.playerDna.dimensions).toEqual([]);
  });

  it("a state that contradicts its own sample (READY with 2 of 3) is treated as not ready", () => {
    const facts = buildCoachFacts(two, dna("READY", 2), "en", { message: "my profile" });
    expect(facts.playerDna.status).toBe("INSUFFICIENT_SAMPLE");
    expect(facts.playerDna.strongest).toEqual([]);
    expect(facts.playerDna.weakest).toEqual([]);
    expect(JSON.stringify(facts)).not.toMatch(PROVISIONAL);
  });

  it("the catalog never picks lessons from a provisional weakest dimension", () => {
    const readings = coachDnaReadings(dna("INSUFFICIENT_SAMPLE", 2));
    expect(readings.every((r) => r.index === null)).toBe(true);
    expect(coachNeeds("como posso melhorar?", readings)).toEqual([]);
    const ready = coachDnaReadings(dna("READY", 3));
    expect(coachNeeds("como posso melhorar?", ready).map((n) => n.detail)).toEqual([
      "teamplay",
      "teamplay",
      "utility",
    ]);
    expect(read("src/lib/coach.functions.ts")).toContain(
      "coachNeeds(input.message, coachDnaReadings(dna))",
    );
  });

  it("the prompt forbids DNA scores and rankings unless READY", () => {
    const p = coachSystemPrompt("en");
    expect(p).toContain("Player DNA values exist only when playerDna.status is READY");
    expect(p).toContain("never name a strongest or weakest dimension");
  });
});

describe("3.1.2 flash assists and unproven metrics", () => {
  // Fase 3 closeout (intentional): the count comes from the game flag OR a timed attribution
  // and (Fase 4.0.1) only an all-GAME_FLAG history may be called a game report.
  it("flash assists carry their real provenance; enemies flashed is NOT MEASURED", () => {
    const facts = buildCoachFacts(two, dna("INSUFFICIENT_SAMPLE", 2), "en");
    const fa = facts.observations.find((o) => o.metric === "flashAssists")!;
    expect(fa).toMatchObject({
      status: "DERIVED",
      value: 0,
      matches: 2,
      source: "match_metrics.flash_assists",
      provenance: "GAME_FLAG_OR_TIMED_ATTRIBUTION",
    });
    expect(fa.note).toContain("timed attribution");
    // Fase 3.5 B (intentional): the note separates count, unstored method, zero and
    // the unmeasured "enemies flashed" instead of quoting an English phrase.
    expect(fa.note).toContain("a count of 0 means no kill was credited as flash-assisted");
    // Fase 4.0.1 (intentional): the method is now recorded per match; older matches read
    // NOT_RECORDED, which still says nothing about whether flash assists happened.
    expect(fa.note).toContain(
      "the METHOD of each match is recorded from flash-assist-provenance-v1 on",
    );
    expect(fa.note).toContain("matches processed earlier read NOT_RECORDED");
    expect(fa.note).toContain("never as proof that the player does not flash for teammates");
    expect(facts.matches.every((x) => x.enemiesFlashed === null)).toBe(true);
    expect(facts.notAvailable.find((n) => n.startsWith("enemies flashed"))).toContain(
      "NOT MEASURED",
    );
    expect(coachSystemPrompt("en")).toContain(
      "never conclude from a 0 that the player does not flash for teammates",
    );
  });

  it("a match without flash-assist evidence is null, and the total is null, never 0", () => {
    const facts = buildCoachFacts(
      overview([m("a"), m("b", { flashAssists: null })]),
      dna("INSUFFICIENT_SAMPLE", 2),
      "en",
    );
    expect(facts.matches.map((x) => x.flashAssists)).toEqual([0, null]);
    expect(facts.totals.flashAssists).toBeNull();
  });

  it("win rate is UNAVAILABLE (L04) and the prompt forbids inferring a result", () => {
    const facts = buildCoachFacts(two, dna("INSUFFICIENT_SAMPLE", 2), "en");
    expect(facts.observations.find((o) => o.metric === "winRate")).toMatchObject({
      status: "UNAVAILABLE",
      value: null,
      numerator: null,
      denominator: null,
    });
    expect(coachSystemPrompt("en")).toContain("never infer a win, a loss or a score");
  });
});

describe("3.1.3 versioned contract with status, unit, sample and source", () => {
  it("every observation is complete; only OBSERVED/DERIVED carry a value", () => {
    const facts = buildCoachFacts(two, dna("INSUFFICIENT_SAMPLE", 2), "en");
    expect(facts.observations.length).toBeGreaterThanOrEqual(12);
    for (const o of facts.observations) {
      expect(o.metric && o.unit && o.aggregation && o.source).toBeTruthy();
      expect(["OBSERVED", "DERIVED", "NOT_MEASURED", "UNAVAILABLE"]).toContain(o.status);
      if (o.status !== "OBSERVED" && o.status !== "DERIVED") expect(o.value).toBeNull();
    }
    expect(facts.observations.find((o) => o.metric === "deaths")!.status).toBe("OBSERVED");
    expect(facts.observations.find((o) => o.metric === "hsPercent")).toMatchObject({
      status: "DERIVED",
      value: 13.9,
      aggregation: "mean_of_matches",
    });
    expect(JSON.stringify(facts)).not.toContain('"index"');
  });

  it("period says the dates are processing dates; sample counts rounds", () => {
    const facts = buildCoachFacts(two, dna("INSUFFICIENT_SAMPLE", 2), "en");
    expect(facts.period).toEqual({
      from: "2026-11-03T05:35:03Z",
      to: "2026-11-03T23:31:36Z",
      dateBasis: "processed",
    });
    expect(facts.sample.rounds).toBe(34);
    expect(facts.matches.every((x) => x.dateBasis === "processed")).toBe(true);
  });

  it("CT/T sides come from the X-ray contract the caller built", () => {
    const xray = buildXRay({
      overview: two,
      dna: dna("INSUFFICIENT_SAMPLE", 2),
      sides: [
        { matchId: "nuke", ct: 12, t: 7 },
        { matchId: "ancient", ct: 12, t: 3 },
      ],
    });
    const facts = buildCoachFacts(two, dna("INSUFFICIENT_SAMPLE", 2), "en", { xray });
    expect(facts.sides.ct).toMatchObject({
      rounds: 24,
      rating: { value: 0.49, status: "DERIVED", unit: "relative_score" },
    });
    expect(facts.sides.t).toMatchObject({ rounds: 10, rating: { value: 0.9 } });
  });

  it("declared preferences are marked as declared, never as measurements", () => {
    const facts = buildCoachFacts(two, dna("INSUFFICIENT_SAMPLE", 2), "en", {
      declared: {
        goals: ["AIM_MECHANICS"],
        primaryGoal: "AIM_MECHANICS",
        level: "INTERMEDIATE",
        experience: "1_3Y",
        roles: ["ENTRY"],
        mainDifficulty: null,
        mapsOfInterest: [],
      },
    });
    expect(facts.declared).toMatchObject({ status: "DECLARED_BY_PLAYER", roles: ["ENTRY"] });
    expect(coachSystemPrompt("en")).toContain("it is a preference, never a measurement");
  });
});

describe("3.1.4/3.1.5 minimal context, sample rules and rounding", () => {
  it("per-match rows follow the maps named in the question; totals still cover all matches", () => {
    const facts = buildCoachFacts(two, dna("INSUFFICIENT_SAMPLE", 2), "en", {
      message: "How do I play better on Ancient?",
    });
    expect(facts.matchesIncluded).toBe(1);
    expect(facts.matches.map((x) => x.map)).toEqual(["de_ancient"]);
    expect(facts.totals.kills).toBe(20);
    expect(facts.sample.matches).toBe(2);
    expect(mapsNamedIn("de_nuke e mirage", ["de_nuke", "de_mirage", "de_ancient"])).toEqual([
      "de_nuke",
      "de_mirage",
    ]);
    expect(mapsNamedIn("nukes everywhere", ["de_nuke"])).toEqual([]);
  });

  it("without a named map, at most the 10 most recent matches are sent", () => {
    const many = overview(Array.from({ length: 15 }, (_, i) => m(`m${i}`)));
    const facts = buildCoachFacts(many, dna("READY", 15), "en", { message: "hi" });
    expect(facts.matchesIncluded).toBe(10);
    expect(facts.totals.matches).toBe(15);
  });

  it("aggregates use the deterministic rounding of Fase 2.1 (0.655, not 0.6549999)", () => {
    const facts = buildCoachFacts(two, dna("INSUFFICIENT_SAMPLE", 2), "en");
    expect(facts.observations.find((o) => o.metric === "rating")!.value).toBe(0.655);
    expect(facts.observations.find((o) => o.metric === "kd")).toMatchObject({
      value: 0.87,
      numerator: 20,
      denominator: 23,
    });
    // 4 opening kills over 34 rounds = 0.1176… → 0.118 (half-up), never ×100 twice.
    expect(facts.totals.perRound.openingKills).toBe(0.118);
    expect(facts.matches.find((x) => x.map === "de_nuke")!.headshotPercent).toBe(27.8);
  });
});

describe("3.1.6 multi-user safety of the context", () => {
  it("identity, history and data come only from the caller's session", () => {
    const src = read("src/lib/coach.functions.ts");
    expect(src).toMatch(/ownPlayerIds\(db, context\.userId, "COACH"\)/);
    expect(src).toContain("loadPlayerOverview(db, context.userId)");
    expect(src).toContain("loadPlayerDna(db, context.userId)");
    expect(src).toContain("loadDeclaredProfile(db, playerId)");
    expect(src).toContain("loadSideRounds(");
    // The conversation is proved to be the caller's before any history is read or written.
    expect(src.indexOf('.eq("player_id", playerId)')).toBeLessThan(
      src.indexOf("conversationMessages(db, conversationId, COACH_MAX_HISTORY)"),
    );
    // Nothing from the client identifies the player.
    expect(src).not.toMatch(/data\.(playerId|userId|player_id|user_id)/);
  });

  it("no free text from other people (nicknames, file names, steam ids) enters the facts", () => {
    const facts = buildCoachFacts(two, dna("READY", 3), "en", { message: "my profile" });
    expect(JSON.stringify(facts)).not.toMatch(/nickname|fileName|steam|user_id|player_id|matchId/i);
  });
});
