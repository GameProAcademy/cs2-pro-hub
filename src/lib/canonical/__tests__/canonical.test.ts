/**
 * FASE 2.6.8 — Canonical Match Engine: domain, quality, projection, adapters.
 * Every test encodes a rule that must never regress.
 */
import { describe, expect, it } from "vitest";

import { buildFixture } from "@/lib/pipeline/__tests__/fixture";

import { demoToCanonicalBundle } from "../adapters/demo.adapter";
import { faceitToCanonicalBundles } from "../adapters/faceit.adapter";
import { gamersClubCanonicalAdapter } from "../adapters/gamersclub.adapter";
import { projectAllPlayers, projectPlayerMatch } from "../canonical.projection";
import { computeCoverage, hasAnalyticalCoverage, quality, worstQuality } from "../canonical.quality";
import type { CanonicalFaceitMatch } from "@/lib/faceit/faceit.mapper";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { CANONICAL_SCHEMA_VERSION, SOURCE_CONTRACT_VERSIONS } from "../canonical.versions";

function demoBundle() {
  const parsed = normalizeParserOutput(buildFixture());
  return demoToCanonicalBundle({
    parsed,
    fingerprint: "a".repeat(64),
    targetSteamId: parsed.players[0]?.steamId ?? null,
    internalPlayerId: "player-1",
    fetchedAt: "2026-01-02T03:04:05.000Z",
  });
}

function faceitMapped(overrides: Partial<CanonicalFaceitMatch> = {}): CanonicalFaceitMatch {
  return {
    external_match_id: "1-abc",
    platform: "faceit",
    map: "de_mirage",
    match_date: "2026-01-01T20:00:00.000Z",
    score_player: 13,
    score_opponent: 8,
    result: "win",
    rounds: 21,
    finished: true,
    terminal: true,
    team_player: "Team Alpha",
    team_opponent: "Team Beta",
    duration_seconds: 2400,
    source_fetched_at: "2026-01-02T00:00:00.000Z",
    source_version: "faceit-data-v4",
    metadata: {
      is_series: false,
      best_of: 1,
      status: "finished",
      score_unit: "rounds",
      map_scores: null,
      started_at: "2026-01-01T20:00:00.000Z",
      finished_at: "2026-01-01T20:40:00.000Z",
    },
    ...overrides,
  };
}

describe("FASE 2.6 — canonical domain invariants", () => {
  it("A canonical match belongs to no player: it carries no player-relative field", () => {
    const bundle = demoBundle();
    const keys = Object.keys(bundle.match);
    expect(keys).not.toContain("player_id");
    expect(keys).not.toContain("playerId");
    expect(keys).not.toContain("scorePlayer");
    expect(keys).not.toContain("result");
    expect(keys).toContain("scoreTeamA");
    expect(keys).toContain("scoreTeamB");
  });

  it("the canonical schema version is stamped on match and series shapes", () => {
    expect(demoBundle().match.schemaVersion).toBe(CANONICAL_SCHEMA_VERSION);
  });

  it("provenance is a separate observation, never merged into the match", () => {
    const bundle = demoBundle();
    expect(bundle.observation.source).toBe("demo");
    expect(bundle.observation.sourceContractVersion).toBe(SOURCE_CONTRACT_VERSIONS.demo);
    expect(bundle.observation.fingerprint).toHaveLength(64);
    expect(Object.keys(bundle.match)).not.toContain("source");
  });
});

describe("FASE 2.6 — quality is never a magic number", () => {
  it("absence of data degrades quality and states the reason", () => {
    const coverage = computeCoverage({
      roundCount: null,
      participants: [],
      rounds: [],
      roundPlayers: [],
      events: [],
    });
    expect(coverage.hasRoundData).toBe(false);
    expect(coverage.roundsObserved).toBeNull();
    expect(coverage.participantsObserved).toBeNull();
  });

  it("worstQuality keeps the weakest status and merges reasons", () => {
    const merged = worstQuality(quality("complete", [], 1), quality("degraded", ["no_round_data"]));
    expect(merged.status).toBe("degraded");
    expect(merged.reasons).toContain("no_round_data");
  });

  it("a match without round or player-round data is not analytically usable", () => {
    const [bundle] = faceitToCanonicalBundles({
      mapped: faceitMapped(),
      targetTeamSlot: "team_a",
    });
    expect(hasAnalyticalCoverage(bundle!.match)).toBe(false);
  });

  it("a parsed demo with rounds and player state IS analytically usable", () => {
    expect(hasAnalyticalCoverage(demoBundle().match)).toBe(true);
  });
});

describe("FASE 2.6 — player-match projection", () => {
  it("derives the player's own score and result without storing it on the match", () => {
    const [bundle] = faceitToCanonicalBundles({
      mapped: faceitMapped(),
      targetTeamSlot: "team_a",
      participants: [
        {
          externalPlayerId: "p1",
          nickname: "alpha",
          steamId64: "76561198000000001",
          team: "team_a",
          isTargetPlayer: true,
        },
        {
          externalPlayerId: "p2",
          nickname: "beta",
          steamId64: "76561198000000002",
          team: "team_b",
          isTargetPlayer: false,
        },
      ],
    });
    const own = projectPlayerMatch(bundle!, "76561198000000001");
    const foe = projectPlayerMatch(bundle!, "76561198000000002");
    expect(own?.scorePlayer).toBe(13);
    expect(own?.result).toBe("win");
    expect(foe?.scorePlayer).toBe(8);
    expect(foe?.result).toBe("loss");
  });

  it("one match with ten participants yields ten projections and one match", () => {
    const bundle = demoBundle();
    expect(projectAllPlayers(bundle).length).toBe(bundle.participants.length);
  });

  it("an unfinished match has no result at all (never a fabricated draw)", () => {
    const [bundle] = faceitToCanonicalBundles({
      mapped: faceitMapped({ finished: false, terminal: false, result: null }),
      targetTeamSlot: "team_a",
      participants: [
        {
          externalPlayerId: "p1",
          nickname: "alpha",
          steamId64: "76561198000000001",
          team: "team_a",
          isTargetPlayer: true,
        },
      ],
    });
    expect(projectPlayerMatch(bundle!, "76561198000000001")?.result).toBeNull();
  });
});

describe("FASE 2.6 — demo adapter", () => {
  it("preserves the external identifiers of every event", () => {
    const bundle = demoBundle();
    const kill = bundle.events.find((event) => event.type === "kill");
    expect(kill?.sourceActorExternalId).toBe(kill?.actorParticipantKey);
    expect(kill?.sourceVictimExternalId).toBe(kill?.victimParticipantKey);
  });

  it("never claims survival without positive evidence", () => {
    expect(demoBundle().roundPlayers.every((row) => row.survived === null)).toBe(true);
  });

  it("keeps unreported per-round metrics as null, never zero", () => {
    const row = demoBundle().roundPlayers[0]!;
    expect(row.kills).toBeNull();
    expect(row.deaths).toBeNull();
    expect(row.damage).toBeNull();
  });

  it("a demo never invents a series", () => {
    expect(demoBundle().series).toBeNull();
  });

  it("participants exist without an internal player id", () => {
    const bundle = demoBundle();
    expect(bundle.participants.some((p) => p.internalPlayerId === null)).toBe(true);
    expect(bundle.participants.filter((p) => p.isTargetPlayer)).toHaveLength(1);
  });
});

describe("FASE 2.6 — FACEIT adapter", () => {
  it("a BO1 produces exactly one canonical match with the ROUND score", () => {
    const bundles = faceitToCanonicalBundles({ mapped: faceitMapped(), targetTeamSlot: "team_a" });
    expect(bundles).toHaveLength(1);
    expect(bundles[0]!.match.scoreTeamA).toBe(13);
    expect(bundles[0]!.match.roundCount).toBe(21);
    expect(bundles[0]!.series).toBeNull();
  });

  it("a BO3 produces a series plus one canonical match per reported map", () => {
    const bundles = faceitToCanonicalBundles({
      mapped: faceitMapped({
        map: null,
        score_player: 2,
        score_opponent: 1,
        rounds: 68,
        metadata: {
          is_series: true,
          best_of: 3,
          status: "finished",
          score_unit: "maps",
          map_scores: [
            { player: 13, opponent: 9 },
            { player: 10, opponent: 13 },
            { player: 13, opponent: 10 },
          ],
        },
      }),
      targetTeamSlot: "team_a",
      mapNames: ["de_mirage", "de_inferno", "de_nuke"],
    });
    expect(bundles).toHaveLength(3);
    expect(bundles[0]!.series?.mapsWonTeamA).toBe(2);
    // Maps won never leak into a map's round score.
    expect(bundles.map((b) => b.match.scoreTeamA)).toEqual([13, 10, 13]);
    expect(bundles.map((b) => b.match.roundCount)).toEqual([22, 23, 23]);
    expect(bundles.map((b) => b.match.mapNumber)).toEqual([1, 2, 3]);
  });

  it("a series with no per-map score yields no invented map rows", () => {
    const bundles = faceitToCanonicalBundles({
      mapped: faceitMapped({
        map: null,
        metadata: { is_series: true, best_of: 3, status: "finished", map_scores: null },
      }),
      targetTeamSlot: "team_a",
    });
    expect(bundles).toHaveLength(0);
  });

  it("is honest that a match-level source has no rounds or events", () => {
    const [bundle] = faceitToCanonicalBundles({
      mapped: faceitMapped(),
      targetTeamSlot: "team_a",
    });
    expect(bundle!.rounds).toEqual([]);
    expect(bundle!.events).toEqual([]);
    expect(bundle!.roundPlayers).toEqual([]);
    expect(bundle!.match.quality.reasons).toContain("no_round_data");
    expect(bundle!.observation.status).not.toBe("complete");
  });

  it("never upgrades a FACEIT participant to a verified identity", () => {
    const [bundle] = faceitToCanonicalBundles({
      mapped: faceitMapped(),
      targetTeamSlot: "team_a",
      participants: [
        {
          externalPlayerId: "p1",
          nickname: "alpha",
          steamId64: "76561198000000001",
          team: "team_a",
          isTargetPlayer: true,
        },
      ],
    });
    expect(bundle!.participants[0]!.identityStatus).toBe("correlated");
  });
});

describe("FASE 2.6 — Gamers Club stays blocked", () => {
  it("reports itself unavailable with an honest reason", () => {
    const availability = gamersClubCanonicalAdapter.availability();
    expect(availability.available).toBe(false);
    expect(availability.reason).toBe("external_access_blocked");
  });

  it("rejects instead of returning fabricated matches", async () => {
    await expect(gamersClubCanonicalAdapter.collect()).rejects.toThrow(
      /CANONICAL_ADAPTER_UNAVAILABLE/,
    );
  });
});
