/**
 * PM4 4.2.8 — `cs2.evolution.v1`: windows with the real N (5/10/20/50, shorter history), pooled
 * rates vs per-match means, missing values never zero, zero denominators, incompatible methods,
 * map/side filters, consistency statistics and outliers, period comparison rules.
 */
import { describe, expect, it } from "vitest";

import {
  aggregate,
  buildEvolution,
  compare,
  consistency,
  contribution,
  quantile,
  type EvolutionFilters,
} from "@/lib/evolution/evolution";
import type { OverviewMatch } from "@/lib/playerOverview";

let seq = 0;
const match = (o: Partial<OverviewMatch> = {}): OverviewMatch => {
  seq += 1;
  return {
    matchId: `m${String(seq).padStart(3, "0")}`,
    map: "de_mirage",
    playedAt: `2026-10-${String((seq % 28) + 1).padStart(2, "0")}T12:${String(seq % 60).padStart(2, "0")}:00Z`,
    dateSource: "played",
    resultStatus: "UNKNOWN",
    result: null,
    scorePlayer: null,
    scoreOpponent: null,
    source: "demo",
    kills: 20,
    deaths: 10,
    assists: 5,
    adr: 80,
    kast: 70,
    hsPercent: 50,
    rating: 1.1,
    firstKills: 3,
    firstDeaths: 2,
    tradeKills: 2,
    flashAssists: 1,
    flashAssistMethod: "GAME_FLAG",
    utilityDamage: null,
    clutchAttempts: 2,
    clutchWins: 1,
    ctRating: 1.2,
    tRating: 1.0,
    roundsPlayed: 20,
    admission: null,
    limitations: [],
    ...o,
  };
};
const history = (n: number, o: Partial<OverviewMatch> = {}) =>
  Array.from({ length: n }, (_, i) =>
    match({
      playedAt: `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      ...o,
    }),
  );
const F = (o: Partial<EvolutionFilters> = {}): EvolutionFilters => ({
  window: 5,
  map: null,
  side: "ALL",
  ...o,
});
const metric = (r: ReturnType<typeof buildEvolution>, k: string) =>
  r.metrics.find((m) => m.key === k)!;

describe("windows", () => {
  it.each([5, 10, 20, 50] as const)(
    "window %i with enough history is COMPLETE with N = %i",
    (w) => {
      const r = buildEvolution(history(120), F({ window: w }));
      expect(r.window).toEqual({ requested: w, n: w, status: "COMPLETE" });
      expect(r.previousWindow.n).toBe(w);
    },
  );
  it("7 matches and a window of 10: N = 7, PARTIAL, never padded", () => {
    const r = buildEvolution(history(7), F({ window: 10 }));
    expect(r.window).toEqual({ requested: 10, n: 7, status: "PARTIAL" });
    expect(metric(r, "kd").window.windowMatches).toBe(7);
    expect(metric(r, "kd").points).toHaveLength(7);
    expect(metric(r, "kd").comparison.status).toBe("NO_PREVIOUS_PERIOD");
  });
  it("2 matches: INSUFFICIENT_SAMPLE", () => {
    expect(buildEvolution(history(2), F()).window.status).toBe("INSUFFICIENT_SAMPLE");
  });
  it("the window takes the newest matches", () => {
    const old = match({ playedAt: "2025-01-01T00:00:00Z", kills: 0 });
    const r = buildEvolution([old, ...history(5)], F());
    expect(metric(r, "kd").points.map((p) => p.matchId)).not.toContain(old.matchId);
  });
  it("a match without a round count is excluded and listed (never a zero)", () => {
    const r = buildEvolution([...history(5), match({ roundsPlayed: null })], F());
    expect(r.excluded).toHaveLength(1);
    expect(r.eligibleMatches).toBe(5);
  });
});

describe("pooled rates vs means", () => {
  it("ADR is Σ damage / Σ rounds, not the mean of match ADRs", () => {
    const a = match({ adr: 100, roundsPlayed: 30 });
    const b = match({ adr: 50, roundsPlayed: 10 });
    expect(aggregate([a, b], "adr").value).toBeCloseTo((100 * 30 + 50 * 10) / 40); // 87.5, mean would be 75
  });
  it("HS% is weighted by kills; K/D pools kills and deaths", () => {
    const a = match({ hsPercent: 60, kills: 30, deaths: 10 });
    const b = match({ hsPercent: 20, kills: 10, deaths: 30 });
    expect(aggregate([a, b], "hsPercent").value).toBeCloseTo(50);
    expect(aggregate([a, b], "kd").value).toBeCloseTo(1);
  });
  it("rating is a declared mean per match", () => {
    expect(aggregate([match({ rating: 1 }), match({ rating: 1.4 })], "rating").value).toBeCloseTo(
      1.2,
    );
  });
  it("a missing value is left out of the metric, never counted as 0", () => {
    const r = aggregate(
      [match({ firstKills: null, firstDeaths: null }), match()],
      "openingWinRate",
    );
    expect(r).toMatchObject({ status: "OK", matches: 1, windowMatches: 2 });
    expect(r.value).toBeCloseTo(60);
  });
  it("a zero denominator gives no value (no clutch attempts → NO_SAMPLE)", () => {
    expect(contribution(match({ clutchAttempts: 0, clutchWins: 0 }), "clutchWinRate")).toBeNull();
    expect(aggregate([match({ clutchAttempts: 0, clutchWins: 0 })], "clutchWinRate").status).toBe(
      "NO_SAMPLE",
    );
  });
});

describe("compatibility and filters", () => {
  it("flash assists from different attribution methods are not pooled", () => {
    const r = aggregate(
      [
        match({ flashAssistMethod: "GAME_FLAG" }),
        match({ flashAssistMethod: "TIMED_ATTRIBUTION" }),
      ],
      "flashAssistsPerRound",
    );
    expect(r.status).toBe("INCOMPATIBLE_METHODS");
    expect(r.value).toBeNull();
  });
  it("unknown / mixed flash methods are not measured", () => {
    expect(contribution(match({ flashAssistMethod: "MIXED" }), "flashAssistsPerRound")).toBeNull();
    expect(
      contribution(match({ flashAssistMethod: "NOT_RECORDED" }), "flashAssistsPerRound"),
    ).toBeNull();
  });
  it("comparison across different methods is INCOMPATIBLE_METHODS", () => {
    const recent = aggregate(
      history(3, { flashAssistMethod: "GAME_FLAG" }),
      "flashAssistsPerRound",
    );
    const prev = aggregate(
      history(3, { flashAssistMethod: "TIMED_ATTRIBUTION" }),
      "flashAssistsPerRound",
    );
    expect(compare(recent, prev).status).toBe("INCOMPATIBLE_METHODS");
  });
  it("map filter keeps one map; side filter keeps only side-split metrics", () => {
    const r = buildEvolution(
      [...history(5), ...history(5, { map: "de_nuke" })],
      F({ map: "de_nuke" }),
    );
    expect(r.eligibleMatches).toBe(5);
    expect(r.maps).toEqual(["de_mirage", "de_nuke"]);
    const ct = buildEvolution(history(5), F({ side: "CT" }));
    expect(ct.metrics.map((m) => m.key)).toEqual(["rating"]);
    expect(metric(ct, "rating").window.value).toBeCloseTo(1.2);
  });
});

describe("consistency", () => {
  it("needs 5 matches; reports median, IQR, SD and CV without a label", () => {
    expect(consistency([1, 2, 3, 4], true).status).toBe("INSUFFICIENT_SAMPLE");
    const c = consistency([1, 2, 3, 4, 5], true);
    expect(c).toMatchObject({ status: "OK", n: 5, median: 3, q1: 2, q3: 4, min: 1, max: 5 });
    expect(c.sd).toBeCloseTo(Math.sqrt(2.5));
    expect(c.cv).toBeCloseTo(Math.sqrt(2.5) / 3);
  });
  it("an outlier moves the SD but barely the median and IQR", () => {
    const base = consistency([1, 1.1, 1.2, 1.0, 0.9], true);
    const out = consistency([1, 1.1, 1.2, 1.0, 9], true);
    expect(out.median).toBeCloseTo(1.1);
    expect(out.sd!).toBeGreaterThan(base.sd! * 10);
  });
  it("high average and high variability are reported apart (consistency ≠ mean)", () => {
    const r = buildEvolution(
      [5, 40, 10, 35, 8].map((k) => match({ kills: k, deaths: 10 })),
      F(),
    );
    const kd = metric(r, "kd");
    expect(kd.window.value).toBeCloseTo(98 / 50);
    expect(kd.consistency.sd!).toBeGreaterThan(1);
  });
  it("CV is not given for the rating (no ratio scale)", () => {
    const r = buildEvolution(history(5), F());
    expect(metric(r, "rating").consistency.cv).toBeNull();
  });
  it("quantile interpolates", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });
});

describe("period comparison", () => {
  it("recent vs previous window: absolute and relative change", () => {
    const prev = history(5, { kills: 10, deaths: 10 });
    const recent = history(5, { kills: 15, deaths: 10 }).map((m) => ({
      ...m,
      playedAt: m.playedAt.replace("2026", "2027"),
    }));
    const c = metric(buildEvolution([...prev, ...recent], F()), "kd").comparison;
    expect(c.status).toBe("OK");
    expect(c.delta).toBeCloseTo(0.5);
    expect(c.deltaPercent).toBeCloseTo(50);
  });
  it("too few matches in the previous period: INSUFFICIENT_SAMPLE, no delta", () => {
    const c = metric(buildEvolution(history(7), F()), "kd").comparison;
    expect(c).toMatchObject({ status: "INSUFFICIENT_SAMPLE", delta: null });
  });
  it("relative change is withheld when the previous value is 0", () => {
    const zero = aggregate(history(3, { tradeKills: 0 }), "tradeKillsPerRound");
    const some = aggregate(history(3, { tradeKills: 2 }), "tradeKillsPerRound");
    expect(compare(some, zero)).toMatchObject({ status: "OK", deltaPercent: null });
  });
});
