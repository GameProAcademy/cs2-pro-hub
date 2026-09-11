/**
 * FASE 2.7.1 — QUALITY-AWARENESS MATRIX (NULL ≠ ZERO), TICKRATE MATH,
 * CLUTCH PARTICIPATION AND PARSER CONTRACT.
 *
 * Every test here asserts a CONCRETE value. There is deliberately no
 * `value === null || value >= 0` anywhere: that assertion proves nothing.
 *
 * The matrix has two columns per evidence class:
 *   UNAVAILABLE evidence -> dependent signal is NULL ("we cannot know");
 *   AVAILABLE evidence + observed zero -> dependent signal is 0 ("it is zero").
 */
import { describe, expect, it } from "vitest";

import { PARSER_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION } from "@/config/pipeline";
import { extractFeatures } from "@/lib/pipeline/features";
import { computeMetrics, eventTime } from "@/lib/pipeline/metrics";
import type { PipelineError } from "@/lib/pipeline/errors";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import {
  assertRawParserOutput,
  mapParserErrorCode,
  expectedParserIdentity,
} from "@/lib/pipeline/parser/adapter";
import type {
  CanonicalEvent,
  CanonicalMatch,
  CanonicalMetrics,
  MetricsAvailability,
  RawParserEvent,
  RawParserOutput,
} from "@/lib/pipeline/types";

import { ENEMY_A, ENEMY_B, MATE, ME, syntheticParserOutput } from "./fixture";

const match: CanonicalMatch = normalizeParserOutput(syntheticParserOutput);
const baseMetrics: CanonicalMetrics = computeMetrics(match, ME);

const availability = (over: Partial<MetricsAvailability>): MetricsAvailability => ({
  killEvents: true,
  damageEvents: true,
  utilityEvents: true,
  roundEndEvidence: true,
  economy: true,
  timing: true,
  completeCoverage: true,

  ...over,
});

const metricsWith = (over: Partial<CanonicalMetrics>): CanonicalMetrics => ({
  ...baseMetrics,
  roundsPlayed: 20,
  ...over,
});

const featuresOf = (metrics: CanonicalMetrics) => extractFeatures(match, metrics).dimensions;

/* ------------------------------------------------------------------ */
/* Case 1 — kill evidence UNAVAILABLE                                  */
/* ------------------------------------------------------------------ */

describe("case 1 — kill evidence unavailable yields NULL", () => {
  const dims = featuresOf(
    metricsWith({
      availability: availability({ killEvents: false, timing: false }),
      kills: 0,
      deaths: 0,
      assists: 0,
      headshots: 0,
      hsPercent: null,
      firstKills: 0,
      firstDeaths: 0,
      openingAttempts: 0,
      openingSuccessRate: null,
      multiKills: 0,
      kast: null,
      tradeKills: null,
      tradeDeaths: null,
      untradedDeaths: null,
      earlyDeaths: null,
      clutchAttempts: null,
      clutchWins: null,
    }),
  );

  it("nulls every kill-derived signal instead of reporting zero", () => {
    expect(dims["aim"]!["kills_per_round"]).toBeNull();
    expect(dims["aim"]!["hs_rate"]).toBeNull();
    expect(dims["survivability"]!["survival_rate"]).toBeNull();
    expect(dims["survivability"]!["early_death_rate"]).toBeNull();
    expect(dims["survivability"]!["early_death_avoidance"]).toBeNull();
    expect(dims["survivability"]!["untraded_death_rate"]).toBeNull();
    expect(dims["positioning"]!["traded_death_rate"]).toBeNull();
    expect(dims["positioning"]!["first_death_rate"]).toBeNull();
    expect(dims["positioning"]!["first_death_avoidance"]).toBeNull();
    expect(dims["dueling"]!["opening_success"]).toBeNull();
    expect(dims["dueling"]!["opening_participation"]).toBeNull();
    expect(dims["dueling"]!["trade_kill_share"]).toBeNull();
    expect(dims["dueling"]!["kd_balance"]).toBeNull();
    expect(dims["decision_making"]!["kast"]).toBeNull();
    expect(dims["decision_making"]!["opening_discipline"]).toBeNull();
    expect(dims["decision_making"]!["early_death_free_rate"]).toBeNull();
    expect(dims["teamplay"]!["assists_per_round"]).toBeNull();
    expect(dims["teamplay"]!["trade_participation"]).toBeNull();
    expect(dims["clutch"]!["clutch_win_rate"]).toBeNull();
    expect(dims["clutch"]!["clutch_frequency"]).toBeNull();
    expect(dims["clutch"]!["multi_kill_rate"]).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Case 2 — kill evidence AVAILABLE, observed zero                     */
/* ------------------------------------------------------------------ */

describe("case 2 — kill evidence available with observed zero yields ZERO", () => {
  const dims = featuresOf(
    metricsWith({
      availability: availability({}),
      kills: 0,
      deaths: 0,
      assists: 0,
      headshots: 0,
      hsPercent: null,
      firstKills: 0,
      firstDeaths: 0,
      openingAttempts: 0,
      openingSuccessRate: null,
      multiKills: 0,
      tradeKills: 0,
      tradeDeaths: 0,
      untradedDeaths: 0,
      earlyDeaths: 0,
      clutchAttempts: 0,
      clutchWins: 0,
      kast: 0,
    }),
  );

  it("reports 0 for observed-zero numerators over a real denominator", () => {
    expect(dims["aim"]!["kills_per_round"]).toBe(0);
    expect(dims["clutch"]!["multi_kill_rate"]).toBe(0);
    expect(dims["clutch"]!["clutch_frequency"]).toBe(0);
    expect(dims["teamplay"]!["assists_per_round"]).toBe(0);
    expect(dims["teamplay"]!["trade_participation"]).toBe(0);
    expect(dims["decision_making"]!["kast"]).toBe(0);
    // Survival is round-denominated: zero deaths over 20 rounds is a full 1.
    expect(dims["survivability"]!["survival_rate"]).toBe(1);
    expect(dims["decision_making"]!["early_death_free_rate"]).toBe(1);
    // Signals whose DENOMINATOR is the missing sample stay null (no kills at
    // all => no share of kills can exist).
    expect(dims["aim"]!["hs_rate"]).toBeNull();
    expect(dims["dueling"]!["trade_kill_share"]).toBeNull();
    expect(dims["clutch"]!["clutch_win_rate"]).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Cases 3 and 4 — damage evidence                                     */
/* ------------------------------------------------------------------ */

describe("cases 3/4 — damage evidence", () => {
  it("nulls damage signals when the class is unavailable", () => {
    const dims = featuresOf(
      metricsWith({
        availability: availability({ damageEvents: false }),
        adr: null,
        damageGiven: null,
        damageTaken: null,
        damageEfficiency: null,
      }),
    );
    expect(dims["aim"]!["damage_per_round"]).toBeNull();
    expect(dims["aim"]!["damage_efficiency"]).toBeNull();
    expect(dims["survivability"]!["damage_taken_per_round"]).toBeNull();
  });

  it("reports 0 when damage was observed and is zero", () => {
    const dims = featuresOf(
      metricsWith({
        availability: availability({}),
        adr: 0,
        damageGiven: 0,
        damageTaken: 0,
        damageEfficiency: null,
      }),
    );
    expect(dims["aim"]!["damage_per_round"]).toBe(0);
    expect(dims["survivability"]!["damage_taken_per_round"]).toBe(0);
    // damage_efficiency divides by damage taken: zero taken is no denominator.
    expect(dims["aim"]!["damage_efficiency"]).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Cases 5 and 6 — utility evidence                                    */
/* ------------------------------------------------------------------ */

describe("cases 5/6 — utility evidence", () => {
  it("nulls every utility signal when the class is unavailable", () => {
    const dims = featuresOf(
      metricsWith({
        availability: availability({ utilityEvents: false }),
        utilityDamage: null,
        flashAssists: null,
        enemiesFlashed: null,
        grenadesUsed: null,
      }),
    );
    expect(dims["utility"]!["utility_damage_per_round"]).toBeNull();
    expect(dims["utility"]!["flash_assists_per_round"]).toBeNull();
    expect(dims["utility"]!["enemies_flashed_per_round"]).toBeNull();
    expect(dims["utility"]!["grenades_per_round"]).toBeNull();
    expect(dims["teamplay"]!["flash_assist_share"]).toBeNull();
  });

  it("reports 0 when utility was observed and the player used none", () => {
    const dims = featuresOf(
      metricsWith({
        availability: availability({}),
        utilityDamage: 0,
        flashAssists: 0,
        enemiesFlashed: 0,
        grenadesUsed: 0,
        assists: 4,
      }),
    );
    expect(dims["utility"]!["utility_damage_per_round"]).toBe(0);
    expect(dims["utility"]!["flash_assists_per_round"]).toBe(0);
    expect(dims["utility"]!["enemies_flashed_per_round"]).toBe(0);
    expect(dims["utility"]!["grenades_per_round"]).toBe(0);
    expect(dims["teamplay"]!["flash_assist_share"]).toBe(0);
  });

  it("keeps normalizer quality and metrics availability consistent", () => {
    const withoutUtility = normalizeParserOutput({
      ...syntheticParserOutput,
      events: syntheticParserOutput.events.filter(
        (e) =>
          ![
            "player_blind",
            "flashbang_detonate",
            "hegrenade_detonate",
            "molotov_detonate",
            "smokegrenade_detonate",
            "inferno_startburn",
          ].includes(e.type),
      ),
    });
    const availabilityWithout = computeMetrics(withoutUtility, ME).availability;
    expect(withoutUtility.quality.flags.includes("missing_utility")).toBe(true);
    expect(availabilityWithout.utilityEvents).toBe(false);

    const availabilityWith = computeMetrics(match, ME).availability;
    expect(match.quality.flags.includes("missing_utility")).toBe(!availabilityWith.utilityEvents);
  });
});

/* ------------------------------------------------------------------ */
/* Case 7 — timing unavailable                                         */
/* ------------------------------------------------------------------ */

describe("case 7 — timing unavailable yields NULL for temporal signals", () => {
  const dims = featuresOf(
    metricsWith({
      availability: availability({ timing: false }),
      tradeKills: null,
      tradeDeaths: null,
      untradedDeaths: null,
      earlyDeaths: null,
      kast: null,
      deaths: 10,
    }),
  );

  it("nulls trades, early deaths and KAST", () => {
    expect(dims["dueling"]!["trade_kill_share"]).toBeNull();
    expect(dims["positioning"]!["traded_death_rate"]).toBeNull();
    expect(dims["survivability"]!["untraded_death_rate"]).toBeNull();
    expect(dims["survivability"]!["early_death_rate"]).toBeNull();
    expect(dims["survivability"]!["early_death_avoidance"]).toBeNull();
    expect(dims["decision_making"]!["early_death_free_rate"]).toBeNull();
    expect(dims["teamplay"]!["trade_participation"]).toBeNull();
    expect(dims["decision_making"]!["kast"]).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Cases 9 and 10 — economy and round-end evidence                     */
/* ------------------------------------------------------------------ */

describe("cases 9/10 — economy and round-end evidence", () => {
  it("never derives economy from a proxy", () => {
    const withoutEconomy = featuresOf(
      metricsWith({ availability: availability({ economy: false }) }),
    );
    expect(withoutEconomy["economy"]!["economy_data_available"]).toBe(0);
    expect(withoutEconomy["economy"]!["buy_discipline"]).toBeNull();
    expect(withoutEconomy["economy"]!["damage_per_dollar"]).toBeNull();

    const withEconomy = featuresOf(metricsWith({ availability: availability({}) }));
    expect(withEconomy["economy"]!["economy_data_available"]).toBe(1);
    expect(withEconomy["economy"]!["buy_discipline"]).toBeNull();
  });

  it("nulls survival when rounds are not provably finished", () => {
    const dims = featuresOf(
      // FASE 2.7.1D: the denominator itself is unknown when the rounds are not
      // provably finished, so `survivalRounds` is NULL (see metrics.ts).
      metricsWith({
        availability: availability({ roundEndEvidence: false }),
        deaths: 5,
        survivalRounds: null,
      }),
    );
    expect(dims["survivability"]!["survival_rate"]).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Part 6 — tickrate mathematics                                       */
/* ------------------------------------------------------------------ */

describe("tickrate mathematics", () => {
  const event = (over: Partial<CanonicalEvent>): CanonicalEvent => ({
    roundNumber: 1,
    type: "kill",
    tick: null,
    timeSeconds: null,
    actorSteamId: null,
    victimSteamId: null,
    assisterSteamId: null,
    weapon: null,
    headshot: null,
    distance: null,
    damage: null,
    data: {},
    ...over,
  });

  it("tick 1280 at 64 tick is 20 seconds", () => {
    expect(eventTime(event({ tick: 1280 }), 64)).toBe(20);
  });

  it("tick 1280 at 128 tick is 10 seconds", () => {
    expect(eventTime(event({ tick: 1280 }), 128)).toBe(10);
  });

  it("time_seconds takes precedence over tick math", () => {
    expect(eventTime(event({ tick: 1280, timeSeconds: 12.5 }), 64)).toBe(12.5);
  });

  it("returns null without time_seconds and without tickrate", () => {
    expect(eventTime(event({ tick: 1280 }), null)).toBeNull();
  });

  it("never fabricates a value from an invalid or missing tickrate", () => {
    for (const rate of [0, -64, Number.NaN]) {
      const value = eventTime(event({ tick: 1280 }), rate);
      expect(value).toBeNull();
    }
    expect(eventTime(event({}), 64)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Part 7 — clutch participation                                       */
/* ------------------------------------------------------------------ */

describe("clutch participation requires round evidence", () => {
  const ENEMY_C = "76561198000000103";
  const GHOST = "76561198000000999";

  function clutchMatch(kills: RawParserEvent[], enemies: string[]): CanonicalMatch {
    const sides: Record<string, string> = { [ME]: "CT", [MATE]: "CT" };
    for (const enemy of enemies) sides[enemy] = "T";
    return normalizeParserOutput({
      parser: { name: PARSER_NAME, version: PARSER_VERSION },
      contract_version: PARSER_CONTRACT_VERSION,
      header: { map: "de_mirage", tickrate: 64 },
      players: [
        { steam_id: ME, team: "A", side: "CT" },
        { steam_id: MATE, team: "A", side: "CT" },
        // GHOST belongs to team A in the roster but never appears in the round.
        { steam_id: GHOST, team: "A", side: "CT" },
        ...enemies.map((steam_id) => ({ steam_id, team: "B", side: "T" })),
      ],
      rounds: [
        {
          number: 1,
          winner_side: "CT",
          end_tick: 5000,
          duration_seconds: 60,
          sides,
        },
      ],
      events: kills,
    } satisfies RawParserOutput);
  }

  const kill = (time: number, attacker: string, victim: string): RawParserEvent => ({
    type: "player_death",
    round: 1,
    time_seconds: time,
    attacker,
    victim,
  });

  it("counts a 1v1 clutch attempt for the surviving participant", () => {
    const m = clutchMatch([kill(20, ENEMY_A, MATE), kill(30, ME, ENEMY_A)], [ENEMY_A, ENEMY_B]);
    const metrics = computeMetrics(m, ME);
    expect(metrics.clutchAttempts).toBe(1);
    expect(metrics.clutchWins).toBe(1);
  });

  it("counts a 1v2 clutch attempt", () => {
    const m = clutchMatch([kill(20, ENEMY_A, MATE)], [ENEMY_A, ENEMY_B]);
    const metrics = computeMetrics(m, ME);
    expect(metrics.clutchAttempts).toBe(1);
  });

  it("counts a 1v3 clutch attempt", () => {
    const m = clutchMatch([kill(20, ENEMY_A, MATE)], [ENEMY_A, ENEMY_B, ENEMY_C]);
    const metrics = computeMetrics(m, ME);
    expect(metrics.clutchAttempts).toBe(1);
  });

  it("does not count a clutch for a roster member absent from the round", () => {
    const m = clutchMatch([kill(20, ENEMY_A, MATE)], [ENEMY_A, ENEMY_B]);
    const ghost = computeMetrics(m, GHOST);
    expect(ghost.roundsPlayed).toBe(0);
    expect(ghost.clutchAttempts).toBe(0);
  });

  it("returns NULL clutch counters when kill evidence is missing entirely", () => {
    const m = clutchMatch([], [ENEMY_A, ENEMY_B]);
    const metrics = computeMetrics(m, ME);
    expect(metrics.availability.killEvents).toBe(false);
    expect(metrics.clutchAttempts).toBeNull();
    expect(metrics.clutchWins).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Part 16 — parser contract (no real parser involved)                 */
/* ------------------------------------------------------------------ */

describe("parser contract validation", () => {
  const deployedRevision = "git:790eaed77eb8cbed8efaa98e1a4f5f0ac33a8bdd";
  const valid = (): RawParserOutput => ({
    parser: { name: PARSER_NAME, version: PARSER_VERSION, revision: deployedRevision },
    contract_version: PARSER_CONTRACT_VERSION,
    header: { map: "de_mirage", tickrate: 64 },
    players: [],
    rounds: [],
    events: [],
  });

  it("accepts a valid payload", () => {
    expect(assertRawParserOutput(valid()).contract_version).toBe(PARSER_CONTRACT_VERSION);
  });

  it("exposes the expected identity as configuration", () => {
    const identity = expectedParserIdentity();
    expect(identity.name).toBe(PARSER_NAME);
    expect(identity.version).toBe(PARSER_VERSION);
  });

  /** The public message is the CODE; the reason lives in the internal detail. */
  function rejection(payload: unknown): { code: string; detail: string } {
    try {
      assertRawParserOutput(payload);
    } catch (error) {
      const e = error as PipelineError;
      return { code: e.code, detail: e.detail ?? "" };
    }
    throw new Error("expected assertRawParserOutput to reject");
  }

  // GATE 1E refined the taxonomy: contract/shape failures no longer hide behind
  // the generic transient PARSER_ERROR.
  it("rejects a wrong contract version", () => {
    const r = rejection({ ...valid(), contract_version: PARSER_CONTRACT_VERSION + 1 });
    expect(r.code).toBe("PARSER_CONTRACT_MISMATCH");
    expect(r.detail).toContain(`expected ${PARSER_CONTRACT_VERSION}`);
  });

  it("rejects a wrong parser name as an identity mismatch", () => {
    const r = rejection({ ...valid(), parser: { name: "other", version: PARSER_VERSION } });
    expect(r.code).toBe("PARSER_IDENTITY_MISMATCH");
    expect(r.detail).toContain("parser name mismatch");
  });

  it("rejects a wrong parser major/minor", () => {
    const r = rejection({ ...valid(), parser: { name: PARSER_NAME, version: "9.99.0" } });
    expect(r.code).toBe("PARSER_IDENTITY_MISMATCH");
    expect(r.detail).toContain("parser version mismatch");
  });

  it("rejects a missing parser identity", () => {
    const { parser: _parser, ...rest } = valid();
    const r = rejection(rest);
    expect(r.code).toBe("PARSER_INVALID_RESPONSE");
    expect(r.detail).toContain("missing parser identity");
  });

  it("rejects missing players / rounds / events arrays", () => {
    for (const key of ["players", "rounds", "events"] as const) {
      const payload: Record<string, unknown> = { ...valid() };
      delete payload[key];
      const r = rejection(payload);
      expect(r.code).toBe("PARSER_INVALID_RESPONSE");
      expect(r.detail).toContain(key);
    }
  });

  it("maps worker error identifiers onto the pipeline taxonomy", () => {
    expect(mapParserErrorCode("TIMEOUT").code).toBe("PARSER_TIMEOUT");
    expect(mapParserErrorCode("CORRUPTED_DEMO").code).toBe("CORRUPTED_DEMO");
    expect(mapParserErrorCode("UNSUPPORTED_DEMO").code).toBe("UNSUPPORTED_DEMO");
    expect(mapParserErrorCode("INVALID_DEMO_FORMAT").code).toBe("INVALID_DEMO_FORMAT");
    expect(mapParserErrorCode("something-else").code).toBe("PARSER_ERROR");
  });
});
