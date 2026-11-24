import { describe, expect, it } from "vitest";
import {
  METRICS_CATALOG_VERSION,
  pooledParts,
  pooledValue,
} from "@/lib/metrics/canonicalAggregate";
import { canonicalMetric } from "@/lib/metrics/canonicalMetrics";
import {
  aggregate as overviewAggregate,
  type OverviewMatch,
  type PlayerOverview,
} from "@/lib/playerOverview";
import { aggregate as evolutionAggregate } from "@/lib/evolution/evolution";
import { observe } from "@/lib/diagnostics/xray";
import { buildCoachFacts } from "@/lib/coach/coachContext";
import { buildPlayerDna } from "@/lib/playerDna";

let seq = 0;
const match = (o: Partial<OverviewMatch> = {}): OverviewMatch => {
  seq += 1;
  return {
    matchId: `m${String(seq).padStart(3, "0")}`,
    map: "de_mirage",
    playedAt: `2026-11-${String((seq % 27) + 1).padStart(2, "0")}T12:00:00Z`,
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

const overview = (matches: OverviewMatch[]): PlayerOverview => ({
  state: matches.length ? "READY" : "EMPTY",
  generatedAt: "2026-11-23T10:00:00Z",
  counts: {
    total: 0,
    inFlight: 0,
    processed: 0,
    failed: 0,
    blocked: 0,
    cancelled: 0,
    identityPending: 0,
  },
  latestJobs: [],
  matches,
  aggregates: overviewAggregate(matches),
});

/**
 * The three reference matches of the UX-1 audit (values as persisted, one decimal):
 * ADR 123.5 / 77.4 / 111.4 over 23 / 17 / 24 rounds; KAST 69.6 / 82.4 / 79.2;
 * HS 40.0 / 60.0 / 72.2 over 15 / 10 / 18 kills (6 / 6 / 13 headshot kills).
 */
const reference = () => [
  match({
    adr: 123.5,
    kast: 69.6,
    hsPercent: 40.0,
    kills: 15,
    deaths: 14,
    roundsPlayed: 23,
    rating: 1.3,
  }),
  match({
    adr: 77.4,
    kast: 82.4,
    hsPercent: 60.0,
    kills: 10,
    deaths: 12,
    roundsPlayed: 17,
    rating: 0.9,
  }),
  match({
    adr: 111.4,
    kast: 79.2,
    hsPercent: 72.2,
    kills: 18,
    deaths: 15,
    roundsPlayed: 24,
    rating: 1.2,
  }),
];

describe("metrics-catalog-v2 — pooled over each metric's own denominator", () => {
  it("names the methodology version", () => {
    expect(METRICS_CATALOG_VERSION).toBe("metrics-catalog-v2");
    for (const id of ["adr", "kast", "hsPercent", "rating"]) {
      expect(canonicalMetric(id).aggregation).toBe("pooled");
    }
    expect(canonicalMetric("kd").aggregation).toBe("sum_ratio");
    // CT/T ratings have no persisted per-side round count: still a per-match mean.
    expect(canonicalMetric("ctRating").aggregation).toBe("mean_of_matches");
  });

  it("reproduces the audit's reference values and documents why v1 differed", () => {
    const m = reference();
    // v2 (pooled): ADR Σ(ADR×rounds)/Σrounds = (2840.5 + 1315.8 + 2673.6) / 64.
    expect(pooledValue(m, "adr").value).toBeCloseTo(6829.9 / 64, 6);
    expect(pooledValue(m, "adr").value!.toFixed(1)).toBe("106.7");
    // v1 (mean of matches) gave 104.1 because a 17-round match weighed as much as a 24-round one.
    expect(((123.5 + 77.4 + 111.4) / 3).toFixed(1)).toBe("104.1");
    // KAST: 16 + 14 + 19 KAST rounds over 64 rounds.
    expect(pooledValue(m, "kast").numerator).toBeCloseTo(49, 1);
    expect(pooledValue(m, "kast").denominator).toBe(64);
    expect(pooledValue(m, "kast").value!.toFixed(1)).toBe("76.6");
    // HS over KILLS (never rounds): 6 + 6 + 13 headshot kills over 43 kills.
    expect(pooledValue(m, "hsPercent").numerator).toBeCloseTo(25, 1);
    expect(pooledValue(m, "hsPercent").denominator).toBe(43);
    expect(pooledValue(m, "hsPercent").value!.toFixed(1)).toBe("58.1");
    expect(pooledValue(m, "kd")).toMatchObject({ numerator: 43, denominator: 41 });
  });

  it("gives the SAME value on the Dashboard, the X-ray, the AI Coach and Evolution", () => {
    const m = reference();
    const ov = overview(m);
    const coach = buildCoachFacts(ov, buildPlayerDna([]));
    for (const key of ["adr", "kast", "hsPercent", "kd", "rating"] as const) {
      const canonical = pooledValue(m, key).value as number;
      const digits = canonicalMetric(key).digits.contract;
      const round = (v: number) => Math.round(v * 10 ** digits) / 10 ** digits;
      expect(ov.aggregates![key]).toBeCloseTo(canonical, 9);
      expect(observe(m, key).value).toBe(round(canonical));
      expect(evolutionAggregate(m, key).value).toBeCloseTo(canonical, 9);
      const obs = coach.observations.find((o) => o.metric === key);
      if (obs) {
        expect(obs.value).toBe(round(canonical));
        expect(obs.aggregation).toBe(canonicalMetric(key).aggregation);
      }
    }
  });

  it("pools the rating over rounds — equal to the rating of the pooled KPR, DPR and ADR", () => {
    // Per-match ratings computed from the documented linear formula, none floored at 0.
    const rate = (k: number, d: number, adr: number, r: number) =>
      0.45 * (k / r / 0.7) + 0.25 * (1 - d / r / 0.75) + 0.3 * (adr / 80);
    const rows = [
      { k: 15, d: 14, adr: 120, r: 23 },
      { k: 10, d: 12, adr: 70, r: 17 },
      { k: 18, d: 15, adr: 110, r: 24 },
    ];
    const m = rows.map((x) =>
      match({
        kills: x.k,
        deaths: x.d,
        adr: x.adr,
        roundsPlayed: x.r,
        rating: rate(x.k, x.d, x.adr, x.r),
      }),
    );
    const R = 64;
    const pooledRating = rate(43, 41, (120 * 23 + 70 * 17 + 110 * 24) / R, R);
    expect(pooledValue(m, "rating").value).toBeCloseTo(pooledRating, 9);
  });

  it("never turns a missing value into zero and reports coverage", () => {
    const m = [
      match({ adr: 100, roundsPlayed: 20 }),
      match({ adr: null, roundsPlayed: 30 }), // no damage events: out of numerator AND denominator
      match({ adr: 50, roundsPlayed: null }), // no round count: no denominator, excluded
    ];
    expect(pooledValue(m, "adr")).toMatchObject({
      value: 100,
      numerator: 2000,
      denominator: 20,
      matches: 1,
    });
    expect(pooledValue([match({ adr: null })], "adr")).toEqual({
      value: null,
      numerator: null,
      denominator: null,
      matches: 0,
    });
    expect(observe([match({ adr: null })], "adr").value).toBeNull();
    expect(overviewAggregate([match({ kast: null })])!.kast).toBeNull();
  });

  it("excludes from HS% the matches without kills (no denominator) instead of counting 0%", () => {
    const m = [match({ kills: 0, hsPercent: null }), match({ kills: 10, hsPercent: 30 })];
    expect(pooledValue(m, "hsPercent")).toMatchObject({ denominator: 10, matches: 1 });
    expect(pooledValue(m, "hsPercent").value).toBeCloseTo(30, 9);
    expect(pooledParts(match({ kills: 0, hsPercent: 0 }), "hsPercent")).toBeNull();
  });

  it("a single match aggregates to exactly its own persisted value (even a non-integer count)", () => {
    // 72.0 % of 22 rounds is not an integer count (e.g. an imported value); the aggregate of that one
    // match must still show 72.0, never a re-rounded 72.7.
    for (const key of ["adr", "kast", "hsPercent", "rating"] as const) {
      const one = match({
        adr: 85.5,
        kast: 72,
        hsPercent: 48,
        rating: 1.21,
        kills: 20,
        roundsPlayed: 22,
      });
      expect(pooledValue([one], key).value).toBeCloseTo(one[key] as number, 9);
    }
  });

  it("weights a long match more than a short one (the v1 equal-weight defect)", () => {
    const m = [match({ adr: 200, roundsPlayed: 2 }), match({ adr: 50, roundsPlayed: 30 })];
    // Equal weights would say 125; pooled over rounds it is (400 + 1500) / 32.
    expect(pooledValue(m, "adr").value).toBeCloseTo(1900 / 32, 9);
    expect(overviewAggregate(m)!.adr).toBeCloseTo(1900 / 32, 9);
  });
});
