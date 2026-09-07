/**
 * FASE 2.6.11 — FACEIT canonical convergence contract.
 *
 * These tests protect the two rules that make canonical FACEIT data honest:
 * a proven series with unreported maps yields a SERIES and ZERO matches, and an
 * observation only joins an existing canonical match when the evidence is
 * unambiguous.
 */
import { describe, expect, it } from "vitest";

import { faceitToCanonicalObservation } from "../adapters/faceit.adapter";
import { canConvergeCrossSource, resolveAgainstAll } from "../canonical.resolver";
import { CANONICAL_SCHEMA_VERSION } from "../canonical.versions";
import type { CanonicalFaceitMatch } from "@/lib/faceit/faceit.mapper";

function mapped(overrides: Partial<CanonicalFaceitMatch> = {}): CanonicalFaceitMatch {
  return {
    external_match_id: "1-abc",
    platform: "faceit",
    map: "de_mirage",
    match_date: "2026-02-01T20:00:00.000Z",
    score_player: 13,
    score_opponent: 9,
    result: "win",
    rounds: 22,
    finished: true,
    terminal: true,
    team_player: "Team A",
    team_opponent: "Team B",
    duration_seconds: 2400,
    source_fetched_at: "2026-02-01T21:00:00.000Z",
    source_version: "faceit-v1",
    metadata: { is_series: false, best_of: 1 },
    ...overrides,
  };
}

describe("faceit canonical observation", () => {
  it("BO1 yields exactly one match and no series", () => {
    const out = faceitToCanonicalObservation({ mapped: mapped(), targetTeamSlot: "team_a" });
    expect(out.series).toBeNull();
    expect(out.bundles).toHaveLength(1);
    expect(out.bundles[0]?.match.map).toBe("de_mirage");
    expect(out.bundles[0]?.match.schemaVersion).toBe(CANONICAL_SCHEMA_VERSION);
  });

  it("SERIES-ONLY: a proven bo3 with no per-map score keeps the series and invents no match", () => {
    const out = faceitToCanonicalObservation({
      mapped: mapped({
        map: null,
        score_player: 2,
        score_opponent: 1,
        rounds: null,
        metadata: { is_series: true, best_of: 3, map_scores: null },
      }),
      targetTeamSlot: "team_a",
    });

    expect(out.bundles).toHaveLength(0);
    expect(out.series).not.toBeNull();
    expect(out.externalSeriesId).toBe("1-abc");
    expect(out.series?.bestOf).toBe(3);
    expect(out.series?.mapsWonTeamA).toBe(2);
    expect(out.series?.mapsWonTeamB).toBe(1);
    expect(out.series?.winnerTeam).toBe("team_a");
  });

  it("series with reported maps yields one match per map, never a series score as rounds", () => {
    const out = faceitToCanonicalObservation({
      mapped: mapped({
        map: null,
        score_player: 2,
        score_opponent: 0,
        metadata: { is_series: true, best_of: 3 },
      }),
      targetTeamSlot: "team_a",
      mapScores: [
        { player: 13, opponent: 7 },
        { player: 13, opponent: 11 },
      ],
      mapNames: ["de_nuke", "de_ancient"],
    });

    expect(out.bundles).toHaveLength(2);
    expect(out.bundles.map((b) => b.match.roundCount)).toEqual([20, 24]);
    expect(out.bundles.map((b) => b.match.mapNumber)).toEqual([1, 2]);
    expect(out.bundles.map((b) => b.observation.externalMatchId)).toEqual([
      "1-abc:map1",
      "1-abc:map2",
    ]);
    expect(out.series?.mapsWonTeamA).toBe(2);
  });

  it("never fabricates rounds or per-map duration for a series map", () => {
    const out = faceitToCanonicalObservation({
      mapped: mapped({ map: null, metadata: { is_series: true, best_of: 3 } }),
      targetTeamSlot: "team_a",
      mapScores: [{ player: 13, opponent: 4 }],
    });
    expect(out.bundles[0]?.match.durationSeconds).toBeNull();
    expect(out.bundles[0]?.rounds).toEqual([]);
    expect(out.bundles[0]?.events).toEqual([]);
  });
});

describe("cross-source convergence gate", () => {
  const demoCandidate = {
    canonicalMatchId: "match-demo",
    source: "demo" as const,
    externalMatchId: null,
    fingerprint: "sha-demo",
    map: "de_mirage",
    playedAt: "2026-02-01T20:00:00.000Z",
    scoreTeamA: 13,
    scoreTeamB: 9,
    participantSteamIds: ["1", "2", "3", "4", "5", "6", "7"],
  };

  it("PROBABLE_MATCH (map, time and roster agree) is NEVER auto-attached", () => {
    const resolved = resolveAgainstAll(
      {
        source: "faceit",
        externalMatchId: "1-abc",
        map: "de_mirage",
        playedAt: "2026-02-01T20:05:00.000Z",
        scoreTeamA: 13,
        scoreTeamB: 9,
        participantSteamIds: ["1", "2", "3", "4", "5", "6", "8"],
      },
      [demoCandidate],
    );
    expect(resolved.decision.resolution).toBe("PROBABLE_MATCH");
    // FASE 2.6.11.1 — only EXACT_MATCH authorises an attach.
    expect(canConvergeCrossSource(resolved.decision)).toBe(false);
    expect(resolved.candidate?.canonicalMatchId).toBe("match-demo");
  });

  it("EXACT_MATCH (identical content fingerprint) is the only auto-attach", () => {
    const resolved = resolveAgainstAll(
      {
        source: "faceit",
        externalMatchId: "1-abc",
        fingerprint: "sha-demo",
        map: "de_mirage",
        playedAt: "2026-02-01T20:00:00.000Z",
      },
      [demoCandidate],
    );
    expect(resolved.decision.resolution).toBe("EXACT_MATCH");
    expect(canConvergeCrossSource(resolved.decision)).toBe(true);
  });

  it("each resolution class maps to an explicit attach authorisation", () => {
    const base = { confidence: 1, signals: [] as string[], requiresReview: false };
    expect(canConvergeCrossSource({ ...base, resolution: "EXACT_MATCH" })).toBe(true);
    expect(canConvergeCrossSource({ ...base, resolution: "EXACT_MATCH", requiresReview: true })).toBe(
      false,
    );
    expect(canConvergeCrossSource({ ...base, resolution: "PROBABLE_MATCH" })).toBe(false);
    expect(
      canConvergeCrossSource({ ...base, resolution: "PROBABLE_MATCH", requiresReview: true }),
    ).toBe(false);
    expect(canConvergeCrossSource({ ...base, resolution: "POSSIBLE_MATCH" })).toBe(false);
    expect(canConvergeCrossSource({ ...base, resolution: "CONFLICT" })).toBe(false);
    expect(canConvergeCrossSource({ ...base, resolution: "NO_MATCH", confidence: 0 })).toBe(false);
  });

  it("a weaker positive never overturns a CONFLICT decision", () => {
    const resolved = resolveAgainstAll(
      {
        source: "faceit",
        externalMatchId: "1-zzz",
        map: "de_mirage",
        playedAt: "2026-02-01T20:05:00.000Z",
        scoreTeamA: 13,
        scoreTeamB: 2,
        participantSteamIds: ["1", "2", "3", "4", "5", "6", "7"],
      },
      [
        demoCandidate,
        { ...demoCandidate, canonicalMatchId: "match-weak", participantSteamIds: ["1", "2"] },
      ],
    );
    expect(resolved.decision.resolution).toBe("CONFLICT");
    expect(canConvergeCrossSource(resolved.decision)).toBe(false);
  });

  it("refuses to attach when the roster is unknown", () => {
    const resolved = resolveAgainstAll(
      {
        source: "faceit",
        externalMatchId: "1-abc",
        map: "de_mirage",
        playedAt: "2026-02-01T20:05:00.000Z",
      },
      [{ ...demoCandidate, participantSteamIds: [] }],
    );
    expect(canConvergeCrossSource(resolved.decision)).toBe(false);
    expect(resolved.decision.requiresReview).toBe(true);
  });

  it("refuses to attach on contradictory scores", () => {
    const resolved = resolveAgainstAll(
      {
        source: "faceit",
        externalMatchId: "1-abc",
        map: "de_mirage",
        playedAt: "2026-02-01T20:05:00.000Z",
        scoreTeamA: 13,
        scoreTeamB: 2,
        participantSteamIds: ["1", "2", "3", "4", "5", "6", "7"],
      },
      [demoCandidate],
    );
    expect(resolved.decision.resolution).toBe("CONFLICT");
    expect(canConvergeCrossSource(resolved.decision)).toBe(false);
  });
});
