/**
 * FASE 2.6.8 — Match Identity Resolver.
 *
 * A wrong EXACT_MATCH corrupts history permanently, so ambiguity must never be
 * promoted into certainty.
 */
import { describe, expect, it } from "vitest";

import {
  canAttachAutomatically,
  resolveAgainstAll,
  resolveMatchIdentity,
  type MatchIdentityCandidate,
} from "../canonical.resolver";

const roster = Array.from({ length: 10 }, (_, i) => `7656119800000000${i}`);

function candidate(overrides: Partial<MatchIdentityCandidate> = {}): MatchIdentityCandidate {
  return {
    source: "faceit",
    externalMatchId: "1-abc",
    map: "de_mirage",
    playedAt: "2026-01-01T20:00:00.000Z",
    roundCount: 21,
    scoreTeamA: 13,
    scoreTeamB: 8,
    participantSteamIds: roster,
    ...overrides,
  };
}

describe("FASE 2.6.4 — match identity resolution", () => {
  it("identical demo fingerprints are an EXACT_MATCH", () => {
    const result = resolveMatchIdentity(
      candidate({ source: "demo", externalMatchId: null, fingerprint: "f".repeat(64) }),
      candidate({ source: "demo", externalMatchId: null, fingerprint: "f".repeat(64) }),
    );
    expect(result.resolution).toBe("EXACT_MATCH");
    expect(canAttachAutomatically(result)).toBe(true);
  });

  it("the same source with the same external id is an EXACT_MATCH", () => {
    expect(resolveMatchIdentity(candidate(), candidate()).resolution).toBe("EXACT_MATCH");
  });

  it("the same source with different external ids is NO_MATCH", () => {
    expect(
      resolveMatchIdentity(candidate(), candidate({ externalMatchId: "1-zzz" })).resolution,
    ).toBe("NO_MATCH");
  });

  it("FASE 2.6.11.3 — cross-source with same map, close time and a FULL identical proven roster is EXACT", () => {
    const result = resolveMatchIdentity(
      candidate({ source: "demo", externalMatchId: null, fingerprint: "a".repeat(64) }),
      candidate({ fingerprint: null }),
    );
    expect(result.resolution).toBe("EXACT_MATCH");
    expect(result.signals).toContain("cross_source_roster_identical");
    expect(canAttachAutomatically(result)).toBe(true);
  });

  it("cross-source with an incomplete roster stays PROBABLE_MATCH and is not attached", () => {
    const result = resolveMatchIdentity(
      candidate({
        source: "demo",
        externalMatchId: null,
        participantSteamIds: roster.slice(0, 9),
      }),
      candidate({ participantSteamIds: roster.slice(0, 9) }),
    );
    expect(result.resolution).toBe("PROBABLE_MATCH");
    expect(canAttachAutomatically(result)).toBe(false);
  });

  it("partial roster overlap only reaches POSSIBLE_MATCH and requires review", () => {
    const result = resolveMatchIdentity(
      candidate({ source: "demo", externalMatchId: null, participantSteamIds: roster.slice(0, 2) }),
      candidate(),
    );
    expect(result.resolution).toBe("POSSIBLE_MATCH");
    expect(result.requiresReview).toBe(true);
  });

  it("a contradictory score is a CONFLICT, never a merge", () => {
    const result = resolveMatchIdentity(
      candidate({ source: "demo", externalMatchId: null, scoreTeamA: 13, scoreTeamB: 2 }),
      candidate(),
    );
    expect(result.resolution).toBe("CONFLICT");
    expect(canAttachAutomatically(result)).toBe(false);
  });

  it("a swapped score is NOT a contradiction (team slots are perspective-free)", () => {
    const result = resolveMatchIdentity(
      candidate({ source: "demo", externalMatchId: null, scoreTeamA: 8, scoreTeamB: 13 }),
      candidate(),
    );
    expect(result.resolution).toBe("EXACT_MATCH");
  });

  it("an unknown score is not a contradiction, and the full roster still identifies the match", () => {
    const result = resolveMatchIdentity(
      candidate({ source: "demo", externalMatchId: null, scoreTeamA: null, scoreTeamB: null }),
      candidate(),
    );
    expect(result.resolution).toBe("EXACT_MATCH");
  });

  it("a different map with the same roster and time is escalated as CONFLICT", () => {
    const result = resolveMatchIdentity(
      candidate({ source: "demo", externalMatchId: null, map: "de_inferno" }),
      candidate(),
    );
    expect(result.resolution).toBe("CONFLICT");
    expect(result.requiresReview).toBe(true);
  });

  it("a different map far apart in time is simply NO_MATCH", () => {
    const result = resolveMatchIdentity(
      candidate({
        source: "demo",
        externalMatchId: null,
        map: "de_inferno",
        playedAt: "2026-01-05T20:00:00.000Z",
      }),
      candidate(),
    );
    expect(result.resolution).toBe("NO_MATCH");
  });

  it("the same map on the same day but hours apart is NO_MATCH", () => {
    const result = resolveMatchIdentity(
      candidate({ source: "demo", externalMatchId: null, playedAt: "2026-01-01T23:30:00.000Z" }),
      candidate(),
    );
    expect(result.resolution).toBe("NO_MATCH");
  });

  it("an unknown map with a close timestamp never exceeds POSSIBLE_MATCH", () => {
    const result = resolveMatchIdentity(
      candidate({
        source: "demo",
        externalMatchId: null,
        map: null,
        participantSteamIds: [],
        scoreTeamA: null,
        scoreTeamB: null,
      }),
      candidate({ map: null }),
    );
    expect(result.resolution).toBe("POSSIBLE_MATCH");
    expect(result.requiresReview).toBe(true);
  });

  it("resolveAgainstAll never hides a CONFLICT behind a weaker positive", () => {
    const incoming = candidate({
      source: "demo",
      externalMatchId: null,
      scoreTeamA: 13,
      scoreTeamB: 2,
    });
    const result = resolveAgainstAll(incoming, [
      candidate(),
      candidate({ externalMatchId: "1-x" }),
    ]);
    expect(result.decision.resolution).toBe("CONFLICT");
  });

  it("resolveAgainstAll prefers an EXACT_MATCH over everything else", () => {
    const incoming = candidate({ fingerprint: "b".repeat(64) });
    const result = resolveAgainstAll(incoming, [
      candidate({ externalMatchId: "1-other", source: "demo", map: "de_inferno" }),
      candidate({ fingerprint: "b".repeat(64) }),
    ]);
    expect(result.decision.resolution).toBe("EXACT_MATCH");
  });

  it("no candidates at all is NO_MATCH, never an optimistic guess", () => {
    const result = resolveAgainstAll(candidate(), []);
    expect(result.decision.resolution).toBe("NO_MATCH");
    expect(result.candidate).toBeNull();
  });
});
