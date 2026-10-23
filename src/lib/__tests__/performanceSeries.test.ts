import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { performanceSeries, performanceTotals } from "@/lib/performanceSeries";
import type { OverviewMatch } from "@/lib/playerOverview";

function match(overrides: Partial<OverviewMatch>): OverviewMatch {
  return {
    matchId: "m",
    map: "de_mirage",
    playedAt: "2026-10-21T01:00:00.000Z",
    result: null,
    scorePlayer: null,
    scoreOpponent: null,
    source: "demo",
    kills: 13,
    deaths: 13,
    assists: 8,
    adr: 91.4,
    kast: null,
    hsPercent: 53.8,
    rating: 0.78,
    firstKills: null,
    firstDeaths: null,
    tradeKills: null,
    flashAssists: null,
    admission: "LIMITED",
    limitations: [],
    ...overrides,
  };
}

describe("real performance series", () => {
  it("is chronological, one point per match, with real values only", () => {
    const points = performanceSeries([
      match({
        matchId: "b",
        playedAt: "2026-10-22T00:00:00.000Z",
        kills: 20,
        deaths: 10,
        map: "de_nuke",
      }),
      match({ matchId: "a" }),
    ]);
    expect(points.map((p) => p["kd"])).toEqual([1, 2]);
    expect(points[0]).toMatchObject({
      label: "21/10 mirage",
      adr: 91.4,
      hsPercent: 53.8,
      rating: 0.78,
    });
  });

  it("never turns an unmeasured metric into zero: the point has no value (a gap)", () => {
    const [point] = performanceSeries([match({})]);
    for (const key of ["kast", "openingDiff", "tradeKills", "flashAssists"])
      expect(point).not.toHaveProperty(key);
    const totals = performanceTotals([match({})]);
    expect(totals).toMatchObject({
      openingKills: null,
      openingDeaths: null,
      tradeKills: null,
      flashAssists: null,
    });
    expect(totals.observed).toMatchObject({
      kast: 0,
      openingDiff: 0,
      tradeKills: 0,
      kd: 1,
      adr: 1,
    });
  });

  it("a real zero is kept and totals ignore matches where the metric was not measured", () => {
    const totals = performanceTotals([
      match({ matchId: "a", firstKills: 0, firstDeaths: 2, tradeKills: 0, flashAssists: 1 }),
      match({ matchId: "b" }),
    ]);
    expect(totals).toMatchObject({
      openingKills: 0,
      openingDeaths: 2,
      tradeKills: 0,
      flashAssists: 1,
    });
    expect(totals.observed.openingDiff).toBe(1);
    expect(performanceSeries([match({ firstKills: 0, firstDeaths: 2 })])[0]?.["openingDiff"]).toBe(
      -2,
    );
  });

  it("K/D is unknown when deaths are 0 or unknown, never infinite", () => {
    expect(performanceSeries([match({ deaths: 0 })])[0]).not.toHaveProperty("kd");
    expect(performanceSeries([match({ deaths: null })])[0]).not.toHaveProperty("kd");
  });
});

describe("real performance page wiring", () => {
  const page = readFileSync(resolve("src/routes/_authenticated/performance.tsx"), "utf8");
  const data = readFileSync(resolve("src/lib/playerData.functions.ts"), "utf8");

  it("renders the player's own overview, not a placeholder or demo data", () => {
    const real = page.slice(
      page.indexOf("function RealPerformancePage"),
      page.indexOf("function PerformancePage"),
    );
    expect(real).toContain("<WithOverview>");
    expect(real).toContain("performanceSeries(matches)");
    expect(real).not.toContain("getTrends");
    expect(real).not.toContain("RealCapabilityPage");
    expect(real).toContain("NotAvailablePanel");
  });

  it("reads the opening/trade/flash columns from the caller's own metrics", () => {
    expect(data).toMatch(
      /METRIC_COLUMNS =\s*"[^"]*first_kills, first_deaths, trade_kills, flash_assists"/,
    );
  });
});
