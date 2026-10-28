import { describe, expect, it } from "vitest";

import type { CanonicalMatchBundle } from "@/lib/canonical/canonical.types";
import {
  CANONICAL_CONTRACT_V3,
  CANONICAL_CONTRACT_V3_DIGEST,
  SERVER_FIXED_FIELDS_V3,
  applyServerPolicyV3,
} from "@/lib/canonical/canonicalContractV3";

function bundle(): CanonicalMatchBundle {
  return {
    observation: {
      source: "demo",
      sourceContractVersion: "demo-v1",
      externalMatchId: null,
      externalParentId: null,
      sourceVersion: "demoparser2@0.42.0",
      fetchedAt: "2026-10-28T00:00:00.000Z",
      sourceUpdatedAt: null,
      status: "complete",
      quality: { status: "complete", reasons: [], confidence: 1 },
      fingerprint: "f".repeat(64),
      metadata: { parser_revision: "git:x" },
    },
    series: null,
    match: {
      game: "cs2",
      map: "de_dust2",
      mapNumber: null,
      playedAt: null,
      startedAt: null,
      finishedAt: null,
      durationSeconds: null,
      status: "completed",
      finished: true,
      terminal: true,
      teamA: null,
      teamB: null,
      scoreTeamA: null,
      scoreTeamB: null,
      winnerTeam: null,
      roundCount: 1,
      quality: { status: "complete", reasons: [], confidence: 1 },
      coverage: {
        roundsExpected: 1,
        roundsObserved: 1,
        participantsExpected: null,
        participantsObserved: 1,
        participantsResolved: 0,
        eventsObserved: 0,
        hasRoundData: true,
        hasEventData: false,
        hasPlayerRoundState: true,
      },
      schemaVersion: 2,
    },
    participants: [],
    rounds: [
      {
        roundNumber: 1,
        startTick: 1,
        endTick: 2,
        startTimeSeconds: null,
        endTimeSeconds: null,
        durationSeconds: null,
        winningTeam: null,
        winningSide: "CT",
        winReason: "unknown",
        bombPlanted: false,
        bombDefused: false,
        bombExploded: false,
        quality: { status: "complete", reasons: [], confidence: 1 },
        metadata: {},
      },
    ],
    roundPlayers: [
      {
        roundNumber: 1,
        participantKey: "76561198000000001",
        side: "CT",
        survived: null,
        moneyStart: 0,
        moneyEnd: 800,
        equipmentValue: 200,
        buyContext: null,
        kills: null,
        deaths: null,
        assists: null,
        damage: null,
        flashAssists: null,
        openingKill: null,
        openingDeath: null,
        traded: null,
        tradeKill: null,
        metadata: {},
      },
    ],
    events: [],
  } as unknown as CanonicalMatchBundle;
}

describe("canonical-demo-v3 server policy", () => {
  it("leaves a conforming bundle unchanged apart from the contract tag", () => {
    const input = bundle();
    const { bundle: out, withheld } = applyServerPolicyV3(input);
    expect(withheld).toEqual({});
    expect(out.observation.metadata).toEqual({
      parser_revision: "git:x",
      canonical_contract: CANONICAL_CONTRACT_V3,
      canonical_contract_digest: CANONICAL_CONTRACT_V3_DIGEST,
    });
    expect(out.roundPlayers[0]!.moneyStart).toBe(0); // available field: zero kept
    expect(out.rounds).toEqual(input.rounds);
    expect(input.observation.metadata).toEqual({ parser_revision: "git:x" }); // not mutated
  });

  it("withholds a value in a fixed field and records it, never silently", () => {
    const input = bundle();
    (input.match as unknown as Record<string, unknown>)["durationSeconds"] = 1800;
    (input.match.coverage as unknown as Record<string, unknown>)["participantsExpected"] = 10;
    (input.roundPlayers[0] as unknown as Record<string, unknown>)["kills"] = 0;
    (input.rounds[0] as unknown as Record<string, unknown>)["winReason"] = "elimination";
    (input.rounds[0] as unknown as Record<string, unknown>)["metadata"] = { x: 1 };
    const { bundle: out, withheld } = applyServerPolicyV3(input);
    expect(out.match.durationSeconds).toBeNull();
    expect(out.match.coverage.participantsExpected).toBeNull();
    expect(out.roundPlayers[0]!.kills).toBeNull(); // a 0 is not a fact the bundle may carry
    expect(out.rounds[0]!.winReason).toBe("unknown");
    expect(out.rounds[0]!.metadata).toEqual({});
    expect(withheld).toEqual({
      "CanonicalMatch.durationSeconds": 1,
      "CanonicalMatch.coverage.participantsExpected": 1,
      "CanonicalRoundPlayer.kills": 1,
      "CanonicalRound.winReason": 1,
      "CanonicalRound.metadata": 1,
    });
    expect(out.observation.metadata["canonical_v3_withheld"]).toEqual(withheld);
  });

  it("covers exactly the 34 non-available server fields of the contract", () => {
    expect(SERVER_FIXED_FIELDS_V3).toHaveLength(34);
    expect(new Set(SERVER_FIXED_FIELDS_V3.map((f) => f.id)).size).toBe(34);
  });
});
