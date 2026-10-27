import { describe, expect, it } from "vitest";

import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserOutput } from "@/lib/pipeline/types";

import { ME, syntheticParserOutput } from "./fixture";

/**
 * D27 (production Dust2 match 747c7a6b, job 83a539c1, 2026-10-23): every participant's
 * team is NULL; the stored metrics said trade_kills 0 / trade_deaths 0 although the
 * persisted kill events hold 1 trade kill (round 6) and 2 traded deaths (rounds 4, 15)
 * of the selected player. Without team identity a trade is unobservable: NULL, never 0.
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

describe("trades without team identity (D27)", () => {
  it("are unknown, never 0", () => {
    const metrics = computeMetrics(normalizeParserOutput(withoutTeams()), ME);
    expect(metrics.tradeKills).toBeNull();
    expect(metrics.tradeDeaths).toBeNull();
  });

  it("make KAST unknown only when a round depends on the trade component", () => {
    const known = computeMetrics(normalizeParserOutput(structuredClone(syntheticParserOutput)), ME);
    const unknown = computeMetrics(normalizeParserOutput(withoutTeams()), ME);
    // Opening duels need no team identity and are unchanged.
    expect(unknown.firstKills).toBe(known.firstKills);
    expect(unknown.firstDeaths).toBe(known.firstDeaths);
    // Fixture round 2: ME dies and is traded by MATE, with no K, A or S for ME - that
    // round is decided only by the trade, which is unobservable without teams.
    expect(known.kast).not.toBeNull();
    expect(unknown.kast).toBeNull();
  });

  it("are still counted from real evidence when teams are known", () => {
    const metrics = computeMetrics(
      normalizeParserOutput(structuredClone(syntheticParserOutput)),
      ME,
    );
    expect(metrics.tradeKills).not.toBeNull();
    expect(metrics.tradeDeaths).not.toBeNull();
  });
});
