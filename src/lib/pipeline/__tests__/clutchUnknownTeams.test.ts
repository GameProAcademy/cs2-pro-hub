import { describe, expect, it } from "vitest";

import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserOutput } from "@/lib/pipeline/types";

import { ME, syntheticParserOutput } from "./fixture";

/**
 * D23 (production Mirage match 95186f3f, 2026-10-21): the admitted demo carries L04
 * (team_assignment_not_two_teams), every participant's team is NULL, and the stored
 * metrics said clutch_attempts 0 / clutches 0 - a measured-looking zero for something
 * that could not be evaluated at all.
 */
function withoutTeams(): RawParserOutput {
  const raw = structuredClone(syntheticParserOutput) as RawParserOutput;
  for (const player of raw.players as unknown as Array<Record<string, unknown>>)
    delete player["team"];
  // D29: per-round sides are team evidence too; "no team identity" means neither.
  for (const round of raw.rounds as unknown as Array<Record<string, unknown>>)
    delete round["sides"];
  return raw;
}

describe("clutches without team identity (D23)", () => {
  it("are unknown, never 0 attempts / 0 wins", () => {
    const metrics = computeMetrics(normalizeParserOutput(withoutTeams()), ME);
    expect(metrics.clutchAttempts).toBeNull();
    expect(metrics.clutchWins).toBeNull();
  });

  it("are still counted from real evidence when teams are known", () => {
    const metrics = computeMetrics(
      normalizeParserOutput(structuredClone(syntheticParserOutput)),
      ME,
    );
    expect(metrics.clutchAttempts).toBe(2);
    expect(metrics.clutchWins).toBe(1);
  });
});
