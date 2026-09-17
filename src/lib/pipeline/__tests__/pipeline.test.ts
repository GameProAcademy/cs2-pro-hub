import { describe, expect, it } from "vitest";

import { MIN_DEMO_SIZE_BYTES, PARSER_NAME, PARSER_VERSION } from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import { extractFeatures } from "@/lib/pipeline/features";
import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { ownScores } from "@/lib/pipeline/persistence.server";
import { safeResetPasswordUrl } from "@/lib/safe-redirect";
import { assertRawParserOutput } from "@/lib/pipeline/parser/adapter";
import {
  resolveOwnSteamId,
  validateCanonicalMatch,
  validateDemoFile,
} from "@/lib/pipeline/validator";

import { ENEMY_A, ME, syntheticParserOutput } from "./fixture";

const match = normalizeParserOutput(syntheticParserOutput);
const metrics = computeMetrics(match, ME);

describe("parser contract", () => {
  it("accepts a payload with the expected contract version", () => {
    expect(assertRawParserOutput(syntheticParserOutput).parser.name).toBe("demoparser2");
  });

  it("rejects a payload from a different contract version", () => {
    expect(() => assertRawParserOutput({ ...syntheticParserOutput, contract_version: 99 })).toThrow(
      PipelineError,
    );
  });
});

describe("normalizer", () => {
  it("produces canonical rounds, players and events", () => {
    expect(match.map).toBe("de_mirage");
    expect(match.rounds).toHaveLength(10);
    expect(match.players).toHaveLength(4);
    expect(match.events.every((event) => event.roundNumber > 0)).toBe(true);
  });

  it("maps parser aliases onto canonical event types", () => {
    expect(match.events.some((event) => event.type === "kill")).toBe(true);
    expect(match.events.some((event) => event.type === "damage")).toBe(true);
    expect(match.events.some((event) => event.type === "flash")).toBe(true);
  });

  it("reports extraction quality instead of assuming a perfect parse", () => {
    expect(match.quality.roundsDetected).toBe(10);
    expect(match.quality.extractionConfidence).toBeGreaterThan(0);
    expect(match.quality.extractionConfidence).toBeLessThanOrEqual(1);
    expect(match.quality.flags).toContain("missing_positions");
  });

  it("refuses an empty parse", () => {
    expect(() =>
      normalizeParserOutput({ ...syntheticParserOutput, players: [], rounds: [] }),
    ).toThrow(PipelineError);
  });

  it("preserves a source participant without fabricating a Steam ID", () => {
    const normalized = normalizeParserOutput({
      ...syntheticParserOutput,
      players: [
        ...syntheticParserOutput.players,
        { participant_key: "source-player-5", name: "observed-name", team: "Team Alpha" },
      ],
    });
    expect(normalized.players.at(-1)).toMatchObject({
      participantKey: "source-player-5",
      steamId: null,
      name: "observed-name",
    });
  });

  it("drops a player row that has neither a participant key nor Steam evidence", () => {
    const normalized = normalizeParserOutput({
      ...syntheticParserOutput,
      players: [...syntheticParserOutput.players, { name: "nickname-is-not-identity" }],
    });
    expect(normalized.players).toHaveLength(syntheticParserOutput.players.length);
  });
});

describe("metrics", () => {
  it("counts kills, deaths and assists for the owning player", () => {
    expect(metrics.kills).toBe(4);
    expect(metrics.deaths).toBe(3);
    expect(metrics.assists).toBe(1);
  });

  it("computes headshot percentage from kill events", () => {
    expect(metrics.headshots).toBe(1);
    expect(metrics.hsPercent).toBe(25);
  });

  it("detects opening duels", () => {
    expect(metrics.firstKills).toBe(1);
    expect(metrics.firstDeaths).toBe(3);
    expect(metrics.openingAttempts).toBe(4);
  });

  it("detects traded and untraded deaths within the configured window", () => {
    expect(metrics.tradeDeaths).toBe(1);
    expect(metrics.untradedDeaths).toBe(2);
  });

  it("counts early deaths", () => {
    expect(metrics.earlyDeaths).toBe(1);
  });

  it("computes KAST over the documented definition", () => {
    // Rounds qualifying: 1 (K), 2 (traded), 4 (A), 5 (flash A), 6 (K),
    // 8, 9, 10 (survived) => 8 of 10.
    expect(metrics.kast).toBe(80);
  });

  it("detects multi-kills", () => {
    expect(metrics.multiKillBreakdown.k2).toBe(2);
    expect(metrics.multiKills).toBe(2);
  });

  it("detects clutches", () => {
    expect(metrics.clutchAttempts).toBeGreaterThanOrEqual(1);
  });

  it("aggregates utility damage from utility weapons only", () => {
    expect(metrics.utilityDamage).toBe(35);
  });

  it("resolves participantKey before using separate Steam event evidence", () => {
    const decoupled = {
      ...match,
      players: match.players.map((player) =>
        player.steamId === ME ? { ...player, participantKey: "participant-local" } : player,
      ),
    };
    const scoped = computeMetrics(decoupled, "participant-local");
    expect(scoped.participantKey).toBe("participant-local");
    expect(scoped.steamId).toBe(ME);
    expect(scoped.kills).toBe(metrics.kills);
    expect(scoped.damageGiven).toBe(metrics.damageGiven);
  });

  it("fails closed when the requested participant key does not exist", () => {
    expect(() => computeMetrics(match, "missing-participant")).toThrowError(
      expect.objectContaining({ code: "PLAYER_IDENTITY_UNRESOLVED" }),
    );
  });

  it("computes correlated metrics for a canonical participant without Steam", () => {
    const sourceKey = "participant-local";
    const withoutSteam = {
      ...match,
      players: match.players.map((player) =>
        player.steamId === ME ? { ...player, participantKey: sourceKey, steamId: null } : player,
      ),
      rounds: match.rounds.map((round) => ({
        ...round,
        sides: Object.fromEntries(
          Object.entries(round.sides).map(([key, value]) => [key === ME ? sourceKey : key, value]),
        ),
        moneyStart: Object.fromEntries(
          Object.entries(round.moneyStart).map(([key, value]) => [
            key === ME ? sourceKey : key,
            value,
          ]),
        ),
        moneyEnd: Object.fromEntries(
          Object.entries(round.moneyEnd).map(([key, value]) => [
            key === ME ? sourceKey : key,
            value,
          ]),
        ),
        equipmentValue: Object.fromEntries(
          Object.entries(round.equipmentValue).map(([key, value]) => [
            key === ME ? sourceKey : key,
            value,
          ]),
        ),
      })),
      events: match.events.map((event) => ({
        ...event,
        actorSteamId: event.actorSteamId === ME ? sourceKey : event.actorSteamId,
        victimSteamId: event.victimSteamId === ME ? sourceKey : event.victimSteamId,
        assisterSteamId: event.assisterSteamId === ME ? sourceKey : event.assisterSteamId,
      })),
    };
    const scoped = computeMetrics(withoutSteam, sourceKey);
    expect(scoped.participantKey).toBe(sourceKey);
    expect(scoped.steamId).toBeNull();
    expect(scoped.kills).toBe(metrics.kills);
    expect(scoped.roundsPlayed).toBe(metrics.roundsPlayed);
  });

  it("produces a bounded source rating that is not the CS2 PRO Score", () => {
    expect(metrics.sourceRating).toBeGreaterThan(0);
    expect(metrics.sourceRating).toBeLessThan(3);
  });
});

describe("features", () => {
  const features = extractFeatures(match, metrics);

  it("emits signals for the ten DNA dimensions", () => {
    expect(Object.keys(features.dimensions)).toHaveLength(10);
  });

  it("keeps every value normalised or explicitly null", () => {
    for (const dimension of Object.values(features.dimensions)) {
      for (const [name, value] of Object.entries(dimension)) {
        if (value == null) continue;
        if (name === "sample_rounds" || name === "early_window_seconds") continue;
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("returns null instead of inventing positional features", () => {
    expect(features.dimensions["positioning"]?.["map_spread"]).toBeNull();
  });
});

describe("validation and identity", () => {
  it("rejects a wrong extension", () => {
    expect(() => validateDemoFile("match.zip", 10_000_000)).toThrow(PipelineError);
  });

  it("rejects a file below the minimum size", () => {
    expect(() => validateDemoFile("match.dem", MIN_DEMO_SIZE_BYTES - 1)).toThrow(PipelineError);
  });

  it("accepts a plausible demo file", () => {
    expect(() => validateDemoFile("match.dem", 50_000_000)).not.toThrow();
  });

  it("accepts a canonical match with enough rounds", () => {
    expect(() => validateCanonicalMatch(match)).not.toThrow();
  });

  it("rejects a canonical match with too few rounds", () => {
    expect(() => validateCanonicalMatch({ ...match, rounds: match.rounds.slice(0, 2) })).toThrow(
      PipelineError,
    );
  });

  it("resolves the owning player only through an explicit Steam ID", () => {
    expect(resolveOwnSteamId(match, ME)).toBe(ME);
    expect(resolveOwnSteamId(match, ENEMY_A)).toBe(ENEMY_A);
    expect(() => resolveOwnSteamId(match, null)).toThrow(PipelineError);
    expect(() => resolveOwnSteamId(match, "76561190000000000")).toThrow(PipelineError);
  });
});

describe("error taxonomy", () => {
  it("marks unrecoverable failures as permanent", () => {
    expect(new PipelineError("CORRUPTED_DEMO").permanent).toBe(true);
    expect(new PipelineError("VALIDATION_ERROR").permanent).toBe(true);
  });

  it("marks infrastructure failures as retryable", () => {
    expect(new PipelineError("PARSER_UNAVAILABLE").permanent).toBe(false);
    expect(new PipelineError("PARSER_TIMEOUT").permanent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 2.1 hardening
// ---------------------------------------------------------------------------

describe("parser identity validation", () => {
  it("rejects a payload from a different parser implementation", () => {
    expect(() =>
      assertRawParserOutput({
        ...syntheticParserOutput,
        parser: { name: "other-parser", version: PARSER_VERSION, revision: "x" },
      }),
    ).toThrow(PipelineError);
  });

  it("rejects an incompatible parser version", () => {
    expect(() =>
      assertRawParserOutput({
        ...syntheticParserOutput,
        parser: { name: PARSER_NAME, version: "9.9.9", revision: "x" },
      }),
    ).toThrow(PipelineError);
  });

  it("rejects a patch release of the exactly pinned version", () => {
    const [major, minor] = PARSER_VERSION.split(".");
    expect(() =>
      assertRawParserOutput({
        ...syntheticParserOutput,
        parser: {
          name: PARSER_NAME,
          version: `${major}.${minor}.99`,
          revision: syntheticParserOutput.parser.revision,
        },
      }),
    ).toThrow(PipelineError);
  });
});

describe("KAST denominator", () => {
  it("only counts rounds the resolved Steam ID actually participated in", () => {
    // A player absent from every round of the demo has no denominator at all.
    expect(() => computeMetrics(match, "76561198000000999")).toThrow(PipelineError);
  });

  it("excludes rounds without the player from the denominator", () => {
    const trimmed = {
      ...match,
      rounds: match.rounds.map((round, index) =>
        index >= 8
          ? { ...round, sides: {}, moneyStart: {}, moneyEnd: {}, equipmentValue: {} }
          : round,
      ),
      events: match.events.filter((event) => event.roundNumber < 9),
    };
    const partial = computeMetrics(trimmed, ME);
    expect(partial.roundsPlayed).toBe(8);
    expect(partial.kast).not.toBeNull();
  });
});

describe("economy features", () => {
  it("never derives economic discipline from damage", () => {
    const economy = extractFeatures(match, metrics).dimensions["economy"]!;
    expect(economy["buy_discipline"]).toBeNull();
    expect(economy["damage_per_dollar"]).toBeNull();
  });
});

describe("score ownership", () => {
  const base = { ...match, teamA: "Team Alpha", teamB: "Team Bravo", scoreA: 13, scoreB: 7 };

  it("uses the team, not the starting side, for the player score", () => {
    expect(ownScores(base, "Team Alpha")).toEqual({ player: 13, opponent: 7 });
    expect(ownScores(base, "Team Bravo")).toEqual({ player: 7, opponent: 13 });
  });

  it("returns null scores when the team cannot be determined", () => {
    expect(ownScores(base, null)).toEqual({ player: null, opponent: null });
    expect(ownScores(base, "Unknown Team")).toEqual({ player: null, opponent: null });
  });
});

describe("password reset redirect allowlist", () => {
  const allowed = ["https://app.example.com"];

  it("accepts an allowed origin", () => {
    expect(safeResetPasswordUrl("https://app.example.com", allowed)).toBe(
      "https://app.example.com/reset-password",
    );
  });

  it("normalises any client-supplied path", () => {
    expect(safeResetPasswordUrl("https://app.example.com/admin?x=1#y", allowed)).toBe(
      "https://app.example.com/reset-password",
    );
  });

  it("rejects an external origin", () => {
    expect(() => safeResetPasswordUrl("https://evil.example.net", allowed)).toThrow();
  });

  it("rejects an arbitrary subdomain of an allowed host", () => {
    expect(() => safeResetPasswordUrl("https://evil.app.example.com", allowed)).toThrow();
  });

  it("rejects a non-http(s) protocol", () => {
    expect(() => safeResetPasswordUrl("javascript:alert(1)", allowed)).toThrow();
    expect(() => safeResetPasswordUrl("http://app.example.com", allowed)).toThrow();
  });
});
