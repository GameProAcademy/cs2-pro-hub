import { describe, expect, it } from "vitest";

import { computeMetrics, sameTeamInRound } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserOutput } from "@/lib/pipeline/types";

import { ENEMY_A, MATE, ME, syntheticParserOutput } from "./fixture";

/**
 * D29 (production Dust2 747c7a6b / Mirage 95186f3f): every participant's match-level team
 * is NULL, so trades, KAST and clutches are NULL. The per-round observed side is direct
 * evidence of who plays with whom IN THAT ROUND (sides swap at halftime, so another
 * round's side is never used). With it the metrics are computed from real evidence; a
 * single unknown pairing they depend on still makes them NULL.
 */
function sidesOnly(): RawParserOutput {
  const raw = structuredClone(syntheticParserOutput) as RawParserOutput;
  for (const player of raw.players as unknown as Array<Record<string, unknown>>)
    delete player["team"];
  return raw;
}

function withTeams(): RawParserOutput {
  return structuredClone(syntheticParserOutput) as RawParserOutput;
}

describe("team identity per round (D29)", () => {
  it("per-round sides alone reproduce the metrics computed with match-level teams", () => {
    const known = computeMetrics(normalizeParserOutput(withTeams()), ME);
    const sides = computeMetrics(normalizeParserOutput(sidesOnly()), ME);
    expect(known.tradeKills).not.toBeNull();
    expect(sides.tradeKills).toBe(known.tradeKills);
    expect(sides.tradeDeaths).toBe(known.tradeDeaths);
    expect(sides.kast).toBe(known.kast);
    expect(sides.clutchAttempts).toBe(known.clutchAttempts);
    expect(sides.clutchWins).toBe(known.clutchWins);
  });

  it("sides of the round decide, never another round's", () => {
    const match = normalizeParserOutput(sidesOnly());
    expect(sameTeamInRound(match, ME, MATE, 1)).toBe(true);
    expect(sameTeamInRound(match, ME, ENEMY_A, 1)).toBe(false);
    expect(sameTeamInRound(match, ME, ENEMY_A, 6)).toBe(false); // both swapped at halftime
  });

  it("an unknown pairing a metric depends on makes it NULL, never 0", () => {
    const raw = sidesOnly();
    // Round 2: ME dies and is traded by MATE; remove MATE's side in that round only.
    const round2 = (raw.rounds as unknown as Array<{ sides: Record<string, string> }>)[1]!;
    delete round2.sides[MATE];
    const metrics = computeMetrics(normalizeParserOutput(raw), ME);
    expect(metrics.tradeDeaths).toBeNull();
    expect(metrics.kast).toBeNull();
    expect(metrics.clutchAttempts).toBeNull();
  });
});
