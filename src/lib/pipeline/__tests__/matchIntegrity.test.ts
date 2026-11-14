import { describe, expect, it } from "vitest";
import {
  MATCH_INTEGRITY_CONTRACT,
  evaluateMatchIntegrity,
  type MatchEndEvidenceV1,
  type MatchEndRoundEvidence,
} from "../matchIntegrity";

type RoundPatch = Partial<MatchEndRoundEvidence>;

function rounds(n: number, last: RoundPatch = {}, phase = 2): MatchEndRoundEvidence[] {
  return Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    startTick: 1000 + i * 5000,
    endTick: 1000 + i * 5000 + 4000,
    winner: i % 2 ? "T" : "CT",
    reason: i % 2 ? "ct_killed" : "t_killed",
    gamePhaseAtEnd: i === n - 1 ? 5 : phase,
    ...(i === n - 1 ? last : {}),
  }));
}

function evidence(patch: Partial<MatchEndEvidenceV1> = {}): MatchEndEvidenceV1 {
  const r = patch.rounds ?? rounds(24);
  return {
    rounds: r,
    winPanelTicks: [r.at(-1)!.endTick! + 200],
    playerCoverage: "COMPLETE",
    ...patch,
  };
}

describe("cs2.match-integrity.v1 — eligibility", () => {
  it("contract carries the configurable minimum", () => {
    expect(MATCH_INTEGRITY_CONTRACT.minValidRounds).toBe(9);
    expect(MATCH_INTEGRITY_CONTRACT.id).toBe("cs2.match-integrity.v1");
  });

  it("1. normal match with >= 9 rounds is eligible", () => {
    const d = evaluateMatchIntegrity(evidence());
    expect([d.status, d.eligible, d.endedBy, d.validRounds]).toEqual([
      "MATCH_COMPLETED",
      true,
      "NORMAL",
      24,
    ]);
    expect(d.signals.map((s) => s.signal)).toEqual([
      "GAME_PHASE_MATCH_ENDED",
      "WIN_PANEL_MATCH",
      "END_OF_FILE",
    ]);
  });

  it("2. normal end with fewer than 9 rounds is rejected for sample size", () => {
    const d = evaluateMatchIntegrity(evidence({ rounds: rounds(8) }));
    expect([d.status, d.eligible, d.validRounds]).toEqual(["MATCH_INSUFFICIENT_ROUNDS", false, 8]);
  });

  it("3. official surrender with >= 9 rounds is eligible as a surrender", () => {
    const d = evaluateMatchIntegrity(
      evidence({ rounds: rounds(11, { reason: "t_surrender", winner: "CT" }) }),
    );
    expect([d.status, d.eligible, d.endedBy, d.validRounds]).toEqual([
      "MATCH_SURRENDER_COMPLETED",
      true,
      "SURRENDER",
      11,
    ]);
  });

  it("4. official surrender with fewer than 9 rounds is rejected", () => {
    const d = evaluateMatchIntegrity(
      evidence({ rounds: rounds(8, { reason: "ct_surrender", winner: "T" }) }),
    );
    expect([d.status, d.eligible]).toEqual(["MATCH_INSUFFICIENT_ROUNDS", false]);
  });

  it("5. a player leaving and returning does not by itself affect eligibility", () => {
    // Participation gaps are not rounds: the round stream is intact and the coverage gate decides players.
    const d = evaluateMatchIntegrity(evidence({ playerCoverage: "PARTIAL" }));
    expect([d.status, d.eligible]).toEqual(["MATCH_COMPLETED", true]);
  });

  it("6. interrupted match without official result is blocked", () => {
    const d = evaluateMatchIntegrity(
      evidence({ rounds: rounds(14, { gamePhaseAtEnd: 2 }), winPanelTicks: [] }),
    );
    expect([d.status, d.eligible]).toEqual(["MATCH_END_UNVERIFIED", false]);
  });

  it("7. truncated file is blocked", () => {
    expect(evaluateMatchIntegrity(evidence({ truncated: true })).status).toBe(
      "MATCH_DEMO_TRUNCATED",
    );
  });

  it("8. EOF in the middle of a round (start without end) is blocked", () => {
    const r = [
      ...rounds(15, { gamePhaseAtEnd: 2 }),
      {
        number: 16,
        startTick: 90000,
        endTick: null,
        winner: null,
        reason: null,
        gamePhaseAtEnd: null,
      },
    ];
    const d = evaluateMatchIntegrity(evidence({ rounds: r, winPanelTicks: [] }));
    expect([d.status, d.validRounds, d.excluded.incomplete]).toEqual([
      "MATCH_FINAL_ROUND_INCOMPLETE",
      15,
      1,
    ]);
  });

  it("9. final round without a winner is blocked", () => {
    const d = evaluateMatchIntegrity(
      evidence({ rounds: rounds(20, { winner: null }), winPanelTicks: [] }),
    );
    expect(d.status).toBe("MATCH_FINAL_ROUND_INCOMPLETE");
  });

  it("10. duplicated round_officially_ended / round rows are counted once", () => {
    const r = rounds(10);
    const d = evaluateMatchIntegrity(
      evidence({ rounds: [...r, { ...r[3]! }, { ...r[3]!, number: 99 }] }),
    );
    expect([d.status, d.validRounds, d.excluded.duplicate]).toEqual(["MATCH_COMPLETED", 10, 2]);
  });

  it("11. rounds voided by a match reset are excluded from the count", () => {
    const r = rounds(9).map((x) => ({ ...x, number: x.number + 1 }));
    const voided = {
      number: 1,
      startTick: 10,
      endTick: 900,
      winner: "CT" as const,
      reason: "t_killed",
      gamePhaseAtEnd: 1,
      voided: true,
    };
    const d = evaluateMatchIntegrity(evidence({ rounds: [voided, ...r] }));
    expect([d.status, d.validRounds, d.excluded.voided]).toEqual(["MATCH_COMPLETED", 9, 1]);
  });

  it("12. a voided reset round cannot lift a short match over the minimum", () => {
    const r = rounds(8).map((x) => ({ ...x, number: x.number + 1 }));
    const voided = {
      number: 1,
      startTick: 10,
      endTick: 900,
      winner: "CT" as const,
      reason: "t_killed",
      gamePhaseAtEnd: 1,
      voided: true,
    };
    expect(evaluateMatchIntegrity(evidence({ rounds: [voided, ...r] })).status).toBe(
      "MATCH_INSUFFICIENT_ROUNDS",
    );
  });

  it("13. absence of cs_win_panel_match is accepted when the game phase proves the end", () => {
    const d = evaluateMatchIntegrity(evidence({ winPanelTicks: [] }));
    expect([d.status, d.eligible]).toEqual(["MATCH_COMPLETED", true]);
    expect(evaluateMatchIntegrity(evidence({ winPanelTicks: null })).status).toBe(
      "MATCH_COMPLETED",
    );
  });

  it("14. contradictory end events are blocked", () => {
    // Win panel present while the final round_end says the match is still being played.
    const a = evaluateMatchIntegrity(evidence({ rounds: rounds(20, { gamePhaseAtEnd: 2 }) }));
    expect(a.status).toBe("MATCH_LIFECYCLE_INCONSISTENT");
    // Surrender recorded before the final round.
    const r = rounds(20);
    r[10] = { ...r[10]!, reason: "t_surrender" };
    expect(evaluateMatchIntegrity(evidence({ rounds: r })).status).toBe(
      "MATCH_LIFECYCLE_INCONSISTENT",
    );
  });

  it("15. match-ended phase before the final round is an inconsistent lifecycle", () => {
    const r = rounds(20);
    r[5] = { ...r[5]!, gamePhaseAtEnd: 5 };
    expect(evaluateMatchIntegrity(evidence({ rounds: r })).status).toBe(
      "MATCH_LIFECYCLE_INCONSISTENT",
    );
  });

  it("EOF alone is never an official end", () => {
    const d = evaluateMatchIntegrity(
      evidence({ rounds: rounds(24, { gamePhaseAtEnd: null }), winPanelTicks: null }),
    );
    expect(d.status).toBe("MATCH_END_UNVERIFIED");
    expect(d.signals).toEqual([{ signal: "END_OF_FILE", reliability: "NONE", tick: null }]);
  });

  it("insufficient player coverage blocks an otherwise complete match", () => {
    expect(evaluateMatchIntegrity(evidence({ playerCoverage: "INSUFFICIENT" })).status).toBe(
      "MATCH_PLAYER_COVERAGE_INSUFFICIENT",
    );
  });

  it("corrupted demo is blocked before anything else", () => {
    expect(evaluateMatchIntegrity(evidence({ corrupted: true, truncated: true })).status).toBe(
      "MATCH_DEMO_CORRUPTED",
    );
  });
});

// Shapes measured on the PM6 corpus with demoparser2 0.42.2 (counts and codes only; see
// docs/pm6/PM6_MATCH_INTEGRITY.md). They pin the hierarchy to real lifecycles.
describe("cs2.match-integrity.v1 — PM6 corpus shapes", () => {
  it("FACEIT (28 rounds after a reset, phase 5 at the final round_end, win panel) is completed", () => {
    const r = rounds(28);
    const voided = {
      number: 0,
      startTick: 3150,
      endTick: 2811,
      winner: "CT" as const,
      reason: "t_killed",
      gamePhaseAtEnd: 1,
      voided: true,
    };
    const d = evaluateMatchIntegrity({
      rounds: [voided, ...r],
      winPanelTicks: [r.at(-1)!.endTick! + 193],
      playerCoverage: "COMPLETE",
    });
    expect([d.status, d.validRounds]).toEqual(["MATCH_COMPLETED", 28]);
  });

  it("GamersClub Mirage (34 rounds, phase 5, no cs_win_panel_match) is completed", () => {
    const d = evaluateMatchIntegrity({
      rounds: rounds(34),
      winPanelTicks: [],
      playerCoverage: "COMPLETE",
    });
    expect([d.status, d.validRounds]).toEqual(["MATCH_COMPLETED", 34]);
  });

  it("GamersClub Cache (11 rounds, final round_end in phase 2, no panel) has no verified end", () => {
    const d = evaluateMatchIntegrity({
      rounds: rounds(11, { gamePhaseAtEnd: 2 }),
      winPanelTicks: [],
      playerCoverage: "INSUFFICIENT",
    });
    expect([d.status, d.eligible, d.validRounds]).toEqual(["MATCH_END_UNVERIFIED", false, 11]);
  });

  it("BLAST GOTV (23 rounds, phase 5, win panel) is completed", () => {
    const d = evaluateMatchIntegrity({
      rounds: rounds(23),
      winPanelTicks: [999999],
      playerCoverage: "COMPLETE",
    });
    expect(d.status).toBe("MATCH_COMPLETED");
  });
});
