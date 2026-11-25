import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { demoToCanonicalBundle } from "@/lib/canonical/adapters/demo.adapter";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { syntheticParserOutput } from "@/lib/pipeline/__tests__/fixture";
import type { RawParserOutput } from "@/lib/pipeline/types";
import { buildMatchRounds, summarizeRoundContext } from "@/lib/roundContext";
import {
  ROUND_WINNER_EVIDENCE_VERSION,
  confirmedSide,
  determinedWinnerSide,
  winnerEvidenceErrors,
  winnerEvidenceFromMetadata,
} from "@/lib/rounds/winnerEvidence";

/** Parser output with the five R-07 scenarios on rounds 1–5 (as adapter.py emits them). */
function scenarios(): RawParserOutput {
  const raw = structuredClone(syntheticParserOutput) as RawParserOutput;
  const set = (n: number, fields: Record<string, unknown>) => {
    const r = raw.rounds.find((x) => x.number === n) as unknown as Record<string, unknown>;
    delete r["winner_side"];
    Object.assign(r, fields);
  };
  set(1, {
    winner_side: "CT",
    winner_method: "game_state",
    winner_status: "confirmed",
    winner_sources: { round_end_event: null, game_state: "CT" },
  });
  set(2, {
    winner_side: "T",
    winner_method: "round_end_event",
    winner_status: "confirmed",
    winner_sources: { round_end_event: "T", game_state: null },
  });
  set(3, {
    winner_side: "CT",
    winner_method: "both",
    winner_status: "confirmed",
    winner_sources: { round_end_event: "CT", game_state: "CT" },
  });
  // A conflict: even a stray winner_side must not survive.
  set(4, {
    winner_side: "T",
    winner_method: "both",
    winner_status: "conflicting",
    winner_sources: { round_end_event: "T", game_state: "CT" },
  });
  set(5, { winner_status: "absent", winner_sources: { round_end_event: null, game_state: null } });
  return raw;
}

describe("R-07 round-winner-evidence-v1 through the pipeline", () => {
  const match = normalizeParserOutput(scenarios());
  const byNumber = new Map(match.rounds.map((r) => [r.roundNumber, r]));

  it("game state, round_end event and both agreeing are confirmed winners", () => {
    expect(
      [1, 2, 3].map((n) => [byNumber.get(n)!.winnerSide, byNumber.get(n)!.winnerEvidence?.method]),
    ).toEqual([
      ["CT", "game_state"],
      ["T", "round_end_event"],
      ["CT", "both"],
    ]);
  });

  it("conflict and absence give no winner and keep both sources", () => {
    expect(byNumber.get(4)!.winnerSide).toBeNull();
    expect(byNumber.get(4)!.winnerEvidence).toMatchObject({
      status: "conflicting",
      sources: { roundEndEvent: "T", gameState: "CT" },
    });
    expect(byNumber.get(5)!.winnerSide).toBeNull();
    expect(byNumber.get(5)!.winnerEvidence?.status).toBe("absent");
  });

  it("the canonical bundle persists the origin in match_rounds.metadata", () => {
    const bundle = demoToCanonicalBundle({ parsed: match, fingerprint: null });
    const r4 = bundle.rounds.find((r) => r.roundNumber === 4)!;
    expect(r4.winningSide).toBeNull();
    expect(winnerEvidenceFromMetadata(r4.metadata)).toMatchObject({
      version: ROUND_WINNER_EVIDENCE_VERSION,
      status: "conflicting",
    });
    const r1 = bundle.rounds.find((r) => r.roundNumber === 1)!;
    expect(r1.winningSide).toBe("CT");
    expect(winnerEvidenceFromMetadata(r1.metadata)?.method).toBe("game_state");
  });
});

describe("readers honour the evidence", () => {
  // Valid round-winner-evidence-v1 objects (closed schema) for each status.
  const SHAPES: Record<
    string,
    { method: string | null; sources: { roundEndEvent: string | null; gameState: string | null } }
  > = {
    confirmed: { method: "both", sources: { roundEndEvent: "CT", gameState: "CT" } },
    conflicting: { method: "both", sources: { roundEndEvent: "T", gameState: "CT" } },
    inconclusive: { method: "game_state", sources: { roundEndEvent: null, gameState: null } },
    absent: { method: null, sources: { roundEndEvent: null, gameState: null } },
  };
  const ev = (status: string) => ({
    winnerEvidence: { version: ROUND_WINNER_EVIDENCE_VERSION, status, ...SHAPES[status] },
  });
  it("a stale winner_side kept by COALESCE after a reprocessed conflict is ignored", () => {
    expect(determinedWinnerSide({ winner_side: "T", metadata: ev("conflicting") })).toBeNull();
    expect(determinedWinnerSide({ winner_side: "T", metadata: ev("inconclusive") })).toBeNull();
    expect(determinedWinnerSide({ winner_side: "ct", metadata: ev("confirmed") })).toBe("CT");
  });
  it("rows persisted before the contract keep their recorded winner (origin not recorded)", () => {
    expect(determinedWinnerSide({ winner_side: "T", metadata: {} })).toBe("T");
    expect(determinedWinnerSide({ winner_side: null })).toBeNull();
  });
  it("O8: a present but malformed evidence fails closed (no winner)", () => {
    expect(
      determinedWinnerSide({ winner_side: "T", metadata: { winnerEvidence: { version: "x" } } }),
    ).toBeNull();
    const bad = {
      ...ev("confirmed").winnerEvidence,
      sources: { roundEndEvent: "T", gameState: "CT" },
    };
    expect(
      determinedWinnerSide({ winner_side: "T", metadata: { winnerEvidence: bad } }),
    ).toBeNull();
  });
  it("the aggregate never counts a round without a determined winner", () => {
    const rounds = [1, 2, 3, 4].map((n) => ({
      round_number: n,
      winner_side: "CT",
      metadata: ev(n <= 2 ? "confirmed" : n === 3 ? "conflicting" : "absent"),
    }));
    const roundPlayers = [1, 2, 3, 4].map((n) => ({
      round_number: n,
      participant_key: "ME",
      side: n === 2 ? "T" : "CT",
    }));
    const ctx = buildMatchRounds({
      matchId: "m1",
      participantKey: "ME",
      rounds,
      roundPlayers,
      events: [],
    } as never);
    expect(ctx.rounds.map((r) => r.outcome)).toEqual(["WON", "LOST", "UNKNOWN", "UNKNOWN"]);
    const s = summarizeRoundContext([ctx]);
    const decided = s.ct.roundsWon + s.ct.roundsLost + s.t.roundsWon + s.t.roundsLost;
    expect(decided).toBe(2);
    expect(s.ct.roundsOutcomeUnknown + s.t.roundsOutcomeUnknown).toBe(2);
  });
});

describe("O8 closed schema (shared cases with scripts/canonical_v3/harness.py)", () => {
  const cases = (
    JSON.parse(
      readFileSync("docs/client-parser/canonical-demo-v3/o8-winner-evidence-cases.json", "utf8"),
    ) as { cases: { name: string; ok: boolean; side?: string | null; metadata: unknown }[] }
  ).cases;
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(winnerEvidenceErrors(c.metadata).length === 0).toBe(c.ok);
    if (c.ok) {
      const evidence = winnerEvidenceFromMetadata(c.metadata)!;
      expect(confirmedSide(evidence)).toBe(c.side);
    }
  });
});
