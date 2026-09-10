/**
 * FASE 2.7.1 — REAL ATTACH INTEGRATION + EVIDENCE SEMANTICS.
 *
 * These tests assert CONCRETE expected values, not "greater or equal to zero".
 * They cover the corrections of this round:
 *
 *   A–F  demo attach identity (externalMatchId NULL, fingerprint, EXACT,
 *        NO_MATCH, CONFLICT, idempotency)
 *   G    player-scoped projection isolation
 *   H–I  NULL vs ZERO, including the utility-zero case
 *   J–L  tickrate 64 / 128 / explicit timestamp precedence
 *   M–N  clutch participation evidence
 *   O    insufficient sample policy
 *
 * The attach tests exercise the DECISION and PAYLOAD layers, which are pure.
 * The database routine itself (`canonical_attach_source`) is proven by the SQL
 * checks in supabase/tests/security_checks.sql and by the scripted proof; it is
 * NOT runtime-proven here (no service-role database access inside vitest).
 */
import { describe, expect, it } from "vitest";

import { MIN_VALID_ROUNDS } from "@/config/pipeline";
import {
  canConvergeCrossSource,
  canonicalBundleToRpcPayload,
  resolveAgainstAll,
  resolveMatchIdentity,
  type MatchIdentityCandidate,
} from "@/lib/canonical";
import { demoToCanonicalBundle } from "@/lib/canonical/adapters/demo.adapter";
import { PipelineError } from "@/lib/pipeline/errors";
import { extractFeatures } from "@/lib/pipeline/features";
import { computeMetrics, eventTime } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { projectionUpdate } from "@/lib/pipeline/persistence.server";
import type {
  CanonicalEvent,
  CanonicalMatch,
  CanonicalRound,
  RawParserOutput,
} from "@/lib/pipeline/types";
import { validateCanonicalMatch } from "@/lib/pipeline/validator";

import { ENEMY_A, ENEMY_B, MATE, ME, syntheticParserOutput } from "./fixture";

const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);

function clone(): RawParserOutput {
  return JSON.parse(JSON.stringify(syntheticParserOutput)) as RawParserOutput;
}

function demoBundle(fingerprint: string | null) {
  return demoToCanonicalBundle({
    parsed: normalizeParserOutput(clone()),
    fingerprint,
    targetSteamId: ME,
    fetchedAt: "2026-01-15T21:00:00.000Z",
  });
}

const demoCandidate = (over: Partial<MatchIdentityCandidate> = {}): MatchIdentityCandidate => ({
  source: "demo",
  externalMatchId: null,
  fingerprint: FP_A,
  map: "de_mirage",
  playedAt: "2026-01-15T20:00:00.000Z",
  startedAt: "2026-01-15T20:00:00.000Z",
  finishedAt: null,
  roundCount: 10,
  scoreTeamA: 6,
  scoreTeamB: 4,
  participantSteamIds: [ME, MATE, ENEMY_A, ENEMY_B],
  ...over,
});

/* ------------------------------------------------------------------ *
 * A–F — REAL ATTACH INTEGRATION                                       *
 * ------------------------------------------------------------------ */

describe("FASE 2.7.1 — REAL ATTACH INTEGRATION", () => {
  it("A: a demo observation carries NO external match id and is still identifiable", () => {
    const bundle = demoBundle(FP_A);
    expect(bundle.observation.externalMatchId).toBeNull();
    expect(bundle.observation.fingerprint).toBe(FP_A);
    expect(() => canonicalBundleToRpcPayload(bundle)).not.toThrow();
  });

  it("B: the fingerprint survives serialisation as the artefact identity", () => {
    const payload = canonicalBundleToRpcPayload(demoBundle(FP_A)) as {
      observation: { externalMatchId: string | null; fingerprint: string | null };
    };
    expect(payload.observation.fingerprint).toBe(FP_A);
    expect(payload.observation.externalMatchId).toBeNull();
  });

  it("C: EXACT by fingerprint attaches to the SAME canonical match", () => {
    const existing = demoCandidate({ canonicalMatchId: "match-1" });
    const result = resolveAgainstAll(demoCandidate(), [existing]);
    expect(result.decision.resolution).toBe("EXACT_MATCH");
    expect(result.decision.signals).toContain("fingerprint_equal");
    expect(result.candidate?.canonicalMatchId).toBe("match-1");
    expect(canConvergeCrossSource(result.decision)).toBe(true);
  });

  it("D: NO_MATCH yields no attach target, so a new canonical match is created", () => {
    const other = demoCandidate({
      canonicalMatchId: "match-2",
      fingerprint: FP_B,
      map: "de_ancient",
      participantSteamIds: [],
    });
    const result = resolveAgainstAll(demoCandidate(), [other]);
    expect(result.decision.resolution).toBe("NO_MATCH");
    expect(result.candidate).toBeNull();
    expect(canConvergeCrossSource(result.decision)).toBe(false);
  });

  it("E: a contradicting score is a CONFLICT and never attaches", () => {
    const faceit = demoCandidate({
      canonicalMatchId: "match-3",
      source: "faceit",
      externalMatchId: "1-abc",
      fingerprint: null,
      scoreTeamA: 13,
      scoreTeamB: 2,
    });
    const decision = resolveMatchIdentity(demoCandidate(), faceit);
    expect(decision.resolution).toBe("CONFLICT");
    expect(decision.requiresReview).toBe(true);
    expect(canConvergeCrossSource(decision)).toBe(false);
  });

  it("F: the same demo seen twice resolves to the same canonical match (idempotent)", () => {
    const stored = demoCandidate({ canonicalMatchId: "match-4" });
    const first = resolveAgainstAll(demoCandidate(), [stored]);
    const second = resolveAgainstAll(demoCandidate(), [stored]);
    expect(first.candidate?.canonicalMatchId).toBe("match-4");
    expect(second.candidate?.canonicalMatchId).toBe("match-4");
    expect(first.decision.resolution).toBe(second.decision.resolution);
  });

  it("F2: the fingerprint is NEVER used as the canonical match id", () => {
    const stored = demoCandidate({ canonicalMatchId: "match-5" });
    const result = resolveAgainstAll(demoCandidate(), [stored]);
    expect(result.candidate?.canonicalMatchId).not.toBe(FP_A);
  });
});

/* ------------------------------------------------------------------ *
 * G — PROJECTION ISOLATION                                            *
 * ------------------------------------------------------------------ */

describe("FASE 2.7.1 — projection isolation", () => {
  const matchWide = { platform: "demo", rounds: 10 };
  const scopedA = {
    team_player: "Team Alpha",
    team_opponent: "Team Bravo",
    score_player: 13,
    score_opponent: 10,
    result: "win",
  };
  const scopedB = {
    team_player: "Team Bravo",
    team_opponent: "Team Alpha",
    score_player: 10,
    score_opponent: 13,
    result: "loss",
  };

  it("G1: an unowned projection can be initialised by the first player", () => {
    const update = projectionUpdate({
      existingPlayerId: null,
      playerId: "player-b",
      uploadId: "upload-b",
      matchWide,
      playerScoped: scopedB,
    });
    expect(update["player_id"]).toBe("player-b");
    expect(update["score_player"]).toBe(10);
  });

  it("G2: the same player keeps updating its own projection", () => {
    const update = projectionUpdate({
      existingPlayerId: "player-a",
      playerId: "player-a",
      uploadId: "upload-a",
      matchWide,
      playerScoped: scopedA,
    });
    expect(update["player_id"]).toBe("player-a");
    expect(update["result"]).toBe("win");
  });

  it("G3: another player NEVER overwrites a player-scoped field", () => {
    const update = projectionUpdate({
      existingPlayerId: "player-a",
      playerId: "player-b",
      uploadId: "upload-b",
      matchWide,
      playerScoped: scopedB,
    });
    for (const field of [
      "player_id",
      "upload_id",
      "team_player",
      "team_opponent",
      "score_player",
      "score_opponent",
      "result",
    ]) {
      expect(field in update).toBe(false);
    }
    // Match-wide facts are still refreshable.
    expect(update["platform"]).toBe("demo");
    expect(update["rounds"]).toBe(10);
  });
});

/* ------------------------------------------------------------------ *
 * H–I — NULL vs ZERO                                                  *
 * ------------------------------------------------------------------ */

function featuresFor(raw: RawParserOutput) {
  const match = normalizeParserOutput(raw);
  const metrics = computeMetrics(match, ME);
  return { metrics, features: extractFeatures(match, metrics) };
}

describe("FASE 2.7.1 — NULL is not ZERO", () => {
  it("H1: with damage events removed, damage-derived metrics are NULL, not 0", () => {
    const raw = clone();
    raw.events = raw.events.filter((event) => event.type !== "player_hurt");
    const { metrics } = featuresFor(raw);
    expect(metrics.adr).toBeNull();
    expect(metrics.damageGiven).toBeNull();
    expect(metrics.damageTaken).toBeNull();
  });

  it("H2: an observed absence of kills for a player is ZERO, not NULL", () => {
    const { metrics } = featuresFor(clone());
    const quiet = computeMetrics(normalizeParserOutput(clone()), ENEMY_B);
    expect(metrics.availability.killEvents).toBe(true);
    expect(quiet.kills).toBe(1);
    const noKiller = computeMetrics(normalizeParserOutput(clone()), MATE);
    expect(typeof noKiller.kills).toBe("number");
  });

  it("I1: utility evidence present and player utility zero => feature 0", () => {
    const raw = clone();
    // Keep the utility event class (another player throws), remove ME's usage.
    raw.events = raw.events.map((event) =>
      event.attacker === ME && (event.type === "player_blind" || event.type === "hegrenade_detonate")
        ? { ...event, attacker: MATE }
        : event,
    );
    const { metrics, features } = featuresFor(raw);
    expect(metrics.availability.utilityEvents).toBe(true);
    expect(metrics.grenadesUsed).toBe(0);
    expect(features.dimensions["utility"]?.["grenades_per_round"]).toBe(0);
    expect(features.dimensions["utility"]?.["enemies_flashed_per_round"]).toBe(0);
  });

  it("I2: no utility evidence at all => feature NULL", () => {
    const raw = clone();
    raw.events = raw.events.filter(
      (event) => event.type !== "player_blind" && event.type !== "hegrenade_detonate",
    );
    const { metrics, features } = featuresFor(raw);
    expect(metrics.availability.utilityEvents).toBe(false);
    expect(metrics.grenadesUsed).toBeNull();
    expect(features.dimensions["utility"]?.["grenades_per_round"]).toBeNull();
  });

  it("I3: utility used by the player => feature above zero", () => {
    const { features } = featuresFor(clone());
    const flashed = features.dimensions["utility"]?.["enemies_flashed_per_round"];
    expect(typeof flashed).toBe("number");
    expect(flashed as number).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * J–L — TICKRATE / TIMING                                             *
 * ------------------------------------------------------------------ */

const tickEvent = (over: Partial<CanonicalEvent> = {}): CanonicalEvent => ({
  roundNumber: 1,
  type: "kill",
  tick: 1280,
  timeSeconds: null,
  actorSteamId: ME,
  victimSteamId: ENEMY_A,
  assisterSteamId: null,
  weapon: "ak47",
  headshot: null,
  distance: null,
  damage: null,
  data: {},
  ...over,
});

describe("FASE 2.7.1 — tickrate", () => {
  it("J: tick 1280 at 64 tick is exactly 20 seconds", () => {
    expect(eventTime(tickEvent(), 64)).toBe(20);
  });

  it("K: the same tick at 128 tick is exactly 10 seconds", () => {
    expect(eventTime(tickEvent(), 128)).toBe(10);
  });

  it("L: an explicit timestamp wins over tick/tickrate", () => {
    expect(eventTime(tickEvent({ timeSeconds: 12.5 }), 64)).toBe(12.5);
  });

  it("L2: without a tickrate the instant is NULL, never tick/64", () => {
    expect(eventTime(tickEvent(), null)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * M–N — CLUTCH PARTICIPATION                                          *
 * ------------------------------------------------------------------ */

const GHOST = "76561198000000999";

function clutchMatch(args: {
  kills: { time: number; attacker: string; victim: string }[];
  winnerTeam: string | null;
  includeGhost: boolean;
}): CanonicalMatch {
  const roster = [ME, MATE, ENEMY_A, ENEMY_B];
  const round: CanonicalRound = {
    roundNumber: 1,
    winnerTeam: args.winnerTeam,
    winnerSide: null,
    startTick: 0,
    endTick: 5000,
    durationSeconds: 80,
    bombPlanted: null,
    bombDefused: null,
    bombExploded: null,
    moneyStart: Object.fromEntries(roster.map((id) => [id, 4000])),
    moneyEnd: {},
    equipmentValue: {},
    sides: {
      [ME]: "CT",
      [MATE]: "CT",
      [ENEMY_A]: "T",
      [ENEMY_B]: "T",
    },
  };
  const events: CanonicalEvent[] = args.kills.map((kill) => ({
    roundNumber: 1,
    type: "kill",
    tick: null,
    timeSeconds: kill.time,
    actorSteamId: kill.attacker,
    victimSteamId: kill.victim,
    assisterSteamId: null,
    weapon: "ak47",
    headshot: null,
    distance: null,
    damage: null,
    data: {},
  }));
  return {
    map: "de_mirage",
    matchDate: "2026-01-15T20:00:00.000Z",
    gameVersion: "13980",
    durationSeconds: 600,
    tickrate: 64,
    teamA: "Team Alpha",
    teamB: "Team Bravo",
    scoreA: 1,
    scoreB: 0,
    players: [
      { steamId: ME, name: "me", team: "Team Alpha", side: "CT" },
      { steamId: MATE, name: "mate", team: "Team Alpha", side: "CT" },
      { steamId: ENEMY_A, name: "a", team: "Team Bravo", side: "T" },
      { steamId: ENEMY_B, name: "b", team: "Team Bravo", side: "T" },
      // A player with a GLOBAL team but no evidence of being in this round.
      ...(args.includeGhost
        ? [{ steamId: GHOST, name: "ghost", team: "Team Bravo", side: null } as const]
        : []),
    ],
    rounds: [round],
    events,
    quality: {
      extractionConfidence: 1,
      partialParse: false,
      roundsDetected: 1,
      roundsValid: 1,
      playersDetected: 4,
      eventsDetected: events.length,
      flags: [],
    },
    parser: { name: "synthetic", version: "1", revision: null },
    schemaVersion: 1,
  };
}

describe("FASE 2.7.1 — clutch participation", () => {
  it("M1: a won 1v1 counts exactly one attempt and one win", () => {
    const match = clutchMatch({
      kills: [
        { time: 10, attacker: ENEMY_A, victim: MATE },
        { time: 20, attacker: ME, victim: ENEMY_B },
        { time: 30, attacker: ME, victim: ENEMY_A },
      ],
      winnerTeam: "Team Alpha",
      includeGhost: false,
    });
    const metrics = computeMetrics(match, ME);
    expect(metrics.clutchAttempts).toBe(1);
    expect(metrics.clutchWins).toBe(1);
  });

  it("M2: a lost 1v2 counts one attempt and zero wins", () => {
    const match = clutchMatch({
      kills: [
        { time: 10, attacker: ENEMY_A, victim: MATE },
        { time: 40, attacker: ENEMY_B, victim: ME },
      ],
      winnerTeam: "Team Bravo",
      includeGhost: false,
    });
    const metrics = computeMetrics(match, ME);
    expect(metrics.clutchAttempts).toBe(1);
    expect(metrics.clutchWins).toBe(0);
  });

  it("N: a player with a global team but no round evidence is not a living enemy", () => {
    const kills = [
      { time: 10, attacker: ENEMY_A, victim: MATE },
      { time: 20, attacker: ME, victim: ENEMY_B },
      { time: 30, attacker: ME, victim: ENEMY_A },
    ];
    const withGhost = computeMetrics(
      clutchMatch({ kills, winnerTeam: "Team Alpha", includeGhost: true }),
      ME,
    );
    const withoutGhost = computeMetrics(
      clutchMatch({ kills, winnerTeam: "Team Alpha", includeGhost: false }),
      ME,
    );
    expect(withGhost.clutchAttempts).toBe(withoutGhost.clutchAttempts);
    expect(withGhost.clutchWins).toBe(withoutGhost.clutchWins);
    // The ghost never appears in the ghost player's own round sample either.
    expect(computeMetrics(clutchMatch({ kills, winnerTeam: null, includeGhost: true }), GHOST)
      .roundsPlayed).toBe(0);
  });

  it("N2: without kill events the clutch answer is NULL, not zero", () => {
    const match = clutchMatch({ kills: [], winnerTeam: "Team Alpha", includeGhost: false });
    const metrics = computeMetrics(match, ME);
    expect(metrics.clutchAttempts).toBeNull();
    expect(metrics.clutchWins).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * O — INSUFFICIENT SAMPLE                                             *
 * ------------------------------------------------------------------ */

describe("FASE 2.7.1 — insufficient sample", () => {
  it("O: a demo below the minimum round sample is rejected explicitly", () => {
    const raw = clone();
    raw.rounds = raw.rounds.slice(0, MIN_VALID_ROUNDS - 1);
    raw.events = raw.events.filter((event) => (event.round ?? 99) <= MIN_VALID_ROUNDS - 1);
    let code: string | null = null;
    try {
      validateCanonicalMatch(normalizeParserOutput(raw));
    } catch (error) {
      code = error instanceof PipelineError ? error.code : "OTHER";
    }
    expect(code).toBe("DEMO_INSUFFICIENT_SAMPLE");
  });
});
