/**
 * FASE 2.6.11.4 — temporal semantics + multiple-EXACT ambiguity.
 *
 * Unit level only: the real database proof for the same rules lives in
 * `scripts/canonical-proof.ts` (gates 17, 18 and 19).
 */
import { describe, expect, it } from "vitest";

import {
  canConvergeCrossSource,
  canonicalEndTimestamp,
  canonicalStartTimestamp,
  resolveAgainstAll,
  resolveMatchIdentity,
  type MatchIdentityCandidate,
} from "../canonical.resolver";

const ROSTER = Array.from({ length: 10 }, (_, i) => `7656119800000${110 + i}`);

const DEMO_START = "2026-01-15T20:00:00.000Z";
const FACEIT_START = "2026-01-15T20:01:00.000Z";
const FACEIT_FINISH = "2026-01-15T20:42:00.000Z";

const demo: MatchIdentityCandidate = {
  canonicalMatchId: "demo-match",
  source: "demo",
  externalMatchId: null,
  fingerprint: "demo-sha256",
  map: "de_mirage",
  playedAt: DEMO_START,
  startedAt: DEMO_START,
  finishedAt: null,
  scoreTeamA: 13,
  scoreTeamB: 9,
  participantSteamIds: ROSTER,
};

/** FACEIT `match_date` is `finished_at ?? started_at`, so it may be the END. */
const faceit: MatchIdentityCandidate = {
  source: "faceit",
  externalMatchId: "faceit-1",
  fingerprint: null,
  map: "de_mirage",
  playedAt: FACEIT_FINISH,
  startedAt: FACEIT_START,
  finishedAt: FACEIT_FINISH,
  scoreTeamA: 13,
  scoreTeamB: 9,
  participantSteamIds: ROSTER,
};

describe("temporal semantics", () => {
  it("uses startedAt as the identity reference", () => {
    expect(canonicalStartTimestamp(faceit)).toBe(FACEIT_START);
    expect(canonicalEndTimestamp(faceit)).toBe(FACEIT_FINISH);
  });

  it("refuses playedAt as a start when it is demonstrably the end instant", () => {
    expect(
      canonicalStartTimestamp({
        ...faceit,
        startedAt: null,
      }),
    ).toBeNull();
  });

  it("accepts playedAt as the start when no end contradicts it", () => {
    expect(canonicalStartTimestamp({ ...demo, startedAt: null })).toBe(DEMO_START);
  });

  it("converges DEMO start with FACEIT start instead of FACEIT finish", () => {
    const result = resolveMatchIdentity(faceit, demo);
    expect(result.resolution).toBe("EXACT_MATCH");
    expect(result.signals).toContain("time_close");
  });

  it("does not invent a start: an end-only FACEIT observation never reaches EXACT", () => {
    const result = resolveMatchIdentity({ ...faceit, startedAt: null }, demo);
    expect(result.resolution).not.toBe("EXACT_MATCH");
  });

  it("keeps a genuinely distant match apart", () => {
    const later = {
      ...demo,
      canonicalMatchId: "other",
      startedAt: "2026-01-15T23:30:00.000Z",
      playedAt: "2026-01-15T23:30:00.000Z",
    };
    expect(resolveMatchIdentity(faceit, later).resolution).not.toBe("EXACT_MATCH");
  });
});

describe("multiple EXACT candidates", () => {
  const twinA = { ...demo, canonicalMatchId: "twin-a" };
  const twinB = { ...demo, canonicalMatchId: "twin-b" };

  it("attaches when exactly ONE candidate is EXACT", () => {
    const resolved = resolveAgainstAll(faceit, [twinA]);
    expect(resolved.decision.resolution).toBe("EXACT_MATCH");
    expect(resolved.candidate?.canonicalMatchId).toBe("twin-a");
    expect(canConvergeCrossSource(resolved.decision)).toBe(true);
  });

  it("never attaches when TWO candidates are EXACT", () => {
    const resolved = resolveAgainstAll(faceit, [twinA, twinB]);
    expect(resolved.decision.resolution).toBe("CONFLICT");
    expect(resolved.decision.requiresReview).toBe(true);
    expect(resolved.decision.signals).toContain("ambiguous_multiple_exact_candidates");
    expect(resolved.candidate).toBeNull();
    expect(canConvergeCrossSource(resolved.decision)).toBe(false);
  });

  it("lets a single EXACT win over a weaker PROBABLE candidate", () => {
    const probable: MatchIdentityCandidate = {
      ...demo,
      canonicalMatchId: "probable",
      participantSteamIds: ROSTER.slice(0, 7),
      fingerprint: null,
      scoreTeamA: null,
      scoreTeamB: null,
    };
    const resolved = resolveAgainstAll(faceit, [twinA, probable]);
    expect(resolved.decision.resolution).toBe("EXACT_MATCH");
    expect(resolved.candidate?.canonicalMatchId).toBe("twin-a");
  });

  it("attaches to nothing when there is no candidate at all", () => {
    const resolved = resolveAgainstAll(faceit, []);
    expect(resolved.decision.resolution).toBe("NO_MATCH");
    expect(canConvergeCrossSource(resolved.decision)).toBe(false);
  });
});
