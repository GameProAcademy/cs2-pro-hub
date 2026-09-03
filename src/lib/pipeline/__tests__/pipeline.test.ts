import { describe, expect, it } from "vitest";

import { MIN_DEMO_SIZE_BYTES } from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import { extractFeatures } from "@/lib/pipeline/features";
import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
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
    expect(() =>
      assertRawParserOutput({ ...syntheticParserOutput, contract_version: 99 }),
    ).toThrow(PipelineError);
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
