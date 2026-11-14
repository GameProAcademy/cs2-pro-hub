/**
 * PM6 C — the match-integrity gate on REAL worker output (flow, not the evaluator alone).
 *
 * `fixtures/match_end_corpus.json` was produced by running the worker of this branch
 * (parser.parse_demo_file → hot_payload.build_hot_payload) on the PM6 corpus demos in the sandbox
 * and keeping only identity-free fields: round number, ticks, winning side and the
 * `match_end_evidence` block (reason, game phase, win panel, voided rounds). The test runs the
 * same functions the app runs on that payload: the HOT sanitizer (hotToRawParserOutput), the
 * evidence builder and the evaluator used by processJob before any canonical write.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  evaluateMatchIntegrity,
  matchEndEvidenceFromOutput,
  matchIntegrityBlockReason,
  sanitizeMatchEndEvidence,
} from "../matchIntegrity";

type CorpusDemo = {
  sha256_prefix: string;
  players: number;
  rounds: { number: number; start_tick?: number; end_tick?: number; winner_side?: string }[];
  match_end_evidence: unknown;
};
const corpus = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/match_end_corpus.json"), "utf8"),
) as Record<string, CorpusDemo>;

function decide(demo: CorpusDemo) {
  return evaluateMatchIntegrity(
    matchEndEvidenceFromOutput({
      rounds: demo.rounds,
      players: Array.from({ length: demo.players }, () => ({})),
      match_end_evidence: sanitizeMatchEndEvidence(demo.match_end_evidence),
    }),
  );
}

describe("cs2.match-integrity.v1 on real worker output (PM6 corpus)", () => {
  it("fixture carries no Steam identity", () => {
    expect(JSON.stringify(corpus)).not.toMatch(/7656119\d{10}/);
  });

  it("FACEIT: officially completed, 28 valid rounds, 1 reset round excluded", () => {
    const d = decide(corpus["faceit"]!);
    expect([d.status, d.eligible, d.endedBy, d.validRounds]).toEqual([
      "MATCH_COMPLETED",
      true,
      "NORMAL",
      28,
    ]);
    expect(d.excluded.voided).toBe(1);
    expect(d.signals.map((s) => s.signal)).toContain("GAME_PHASE_MATCH_ENDED");
    expect(d.signals.map((s) => s.signal)).toContain("WIN_PANEL_MATCH");
  });

  it("GamersClub Mirage: completed by game phase alone (no cs_win_panel_match)", () => {
    const d = decide(corpus["gamersclub_mirage"]!);
    expect([d.status, d.eligible, d.validRounds]).toEqual(["MATCH_COMPLETED", true, 34]);
    expect(d.signals.map((s) => s.signal)).not.toContain("WIN_PANEL_MATCH");
  });

  it("GamersClub Cache stays blocked (no round ends, no players)", () => {
    const d = decide(corpus["gamersclub_cache"]!);
    expect(d.eligible).toBe(false);
    expect(d.status).toBe("MATCH_FINAL_ROUND_INCOMPLETE");
    expect(matchIntegrityBlockReason(d)).toBe("MATCH_INTEGRITY:MATCH_FINAL_ROUND_INCOMPLETE");
  });

  it("BLAST GOTV: officially completed with win panel", () => {
    const d = decide(corpus["blast_gotv"]!);
    expect([d.status, d.eligible, d.endedBy]).toEqual(["MATCH_COMPLETED", true, "NORMAL"]);
    expect(d.validRounds).toBeGreaterThanOrEqual(9);
  });

  it("an older worker without match_end_evidence fails closed", () => {
    const faceit = corpus["faceit"]!;
    const d = evaluateMatchIntegrity(
      matchEndEvidenceFromOutput({
        rounds: faceit.rounds,
        players: Array.from({ length: faceit.players }, () => ({})),
      }),
    );
    expect([d.status, d.eligible]).toEqual(["MATCH_END_UNVERIFIED", false]);
  });

  it("malformed evidence is discarded, never trusted", () => {
    expect(sanitizeMatchEndEvidence({ schema_version: 2, rounds: [] })).toBeNull();
    expect(sanitizeMatchEndEvidence("x")).toBeNull();
    const s = sanitizeMatchEndEvidence({
      schema_version: 1,
      game_phase_available: "yes",
      rounds: [{ number: 1, end_tick: 10.5, reason: 7, game_phase: "5" }],
      win_panel_ticks: "nope",
      voided_rounds: -3,
    });
    expect(s).toEqual({
      schema_version: 1,
      game_phase_available: false,
      rounds: [{ number: 1, end_tick: null, reason: null, game_phase: null }],
      win_panel_ticks: null,
      voided_rounds: 0,
    });
  });

  it("disconnect-and-return does not change eligibility (players are not rounds)", () => {
    const faceit = corpus["faceit"]!;
    // Fewer players in the inventory than 10 (someone left) is not a round defect.
    const d = evaluateMatchIntegrity(
      matchEndEvidenceFromOutput({
        rounds: faceit.rounds,
        players: Array.from({ length: 9 }, () => ({})),
        match_end_evidence: sanitizeMatchEndEvidence(faceit.match_end_evidence),
      }),
    );
    expect(d.status).toBe("MATCH_COMPLETED");
  });
});
