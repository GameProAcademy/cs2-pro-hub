import { describe, expect, it } from "vitest";

import { pooledValue, type PooledMatchInput } from "@/lib/metrics/canonicalAggregate";
import { compositeRating, compositeRatingUnfloored } from "@/lib/pipeline/metrics";

const m = (r: number, k: number, d: number, adr: number): PooledMatchInput => ({
  kills: k,
  deaths: d,
  adr: null,
  kast: null,
  hsPercent: null,
  rating: compositeRating(k, d, adr * r, r),
  ratingUnfloored: compositeRatingUnfloored(k, d, adr * r, r),
  roundsPlayed: r,
});

describe("Q-21: aggregated rating = the formula on the pooled counts", () => {
  it("compositeRating is the unfloored formula with the floor at 0 (pro behaviour unchanged)", () => {
    expect(compositeRating(18, 17, 111.4 * 24, 24)).toBeCloseTo(0.9138, 4);
    expect(compositeRating(0, 10, 50, 10)).toBe(0);
    expect(compositeRatingUnfloored(0, 10, 50, 10)!).toBeCloseTo(-0.0646, 4);
    expect(compositeRatingUnfloored(1, 1, 1, 0)).toBeNull();
    expect(compositeRating(1, 1, 1, 0)).toBe(0);
  });

  it("production test account (4 matches, stored 2-decimal ratings): no match at the floor", () => {
    const stored = (r: number, k: number, d: number, adr: number, rating: number) => ({
      ...m(r, k, d, adr),
      rating,
    });
    const rows = [
      stored(24, 18, 17, 111.4, 0.91),
      stored(17, 10, 11, 77.4, 0.7),
      stored(23, 15, 17, 123.5, 0.89),
      stored(24, 13, 16, 90.6, 0.72),
    ];
    const pooled = pooledValue(rows, "rating");
    // (24·0.91 + 17·0.70 + 23·0.89 + 24·0.72) ÷ 88 = 71.49 ÷ 88
    expect(pooled.value!).toBeCloseTo(71.49 / 88, 10);
    expect(pooled.value!.toFixed(2)).toBe("0.81");
    // The formula on Σ counts (56 kills, 61 deaths, 9 004.3 damage, 88 rounds) shows the same 0.81.
    expect(compositeRating(56, 61, 9004.3, 88).toFixed(2)).toBe("0.81");
    expect(pooled.denominator).toBe(88);
  });

  it("pooled unfloored values equal the formula on the pooled counts (identity)", () => {
    const rows = [
      m(24, 18, 17, 111.4),
      m(17, 10, 11, 77.4),
      m(23, 15, 17, 123.5),
      m(24, 13, 16, 90.6),
    ];
    const viaUnfloored = rows.reduce((s, r) => s + r.ratingUnfloored! * r.roundsPlayed!, 0) / 88;
    expect(viaUnfloored).toBeCloseTo(compositeRating(56, 61, 9004.3, 88), 10);
  });

  it("a floored match contributes its true value; the floor applies once", () => {
    const rows = [m(10, 0, 10, 5), m(20, 16, 12, 110)];
    const pooled = pooledValue(rows, "rating").value!;
    expect(pooled).toBeCloseTo(compositeRating(16, 22, 5 * 10 + 110 * 20, 30), 10);
    expect(pooled).toBeCloseTo(0.6297, 4);
    // The former round-weighted mean of the floored per-match ratings would give 0.6512.
    const weightedFloored = (10 * rows[0]!.rating! + 20 * rows[1]!.rating!) / 30;
    expect(weightedFloored).toBeCloseTo(0.6512, 4);
  });

  it("without the unfloored value (other sources) the stored rating is pooled by rounds; absent stays absent", () => {
    const other: PooledMatchInput = { ...m(20, 10, 10, 80), ratingUnfloored: null, rating: 1.05 };
    expect(pooledValue([other], "rating").value).toBeCloseTo(1.05, 10);
    const none: PooledMatchInput = { ...m(20, 10, 10, 80), rating: null, ratingUnfloored: null };
    expect(pooledValue([none], "rating")).toMatchObject({ value: null, matches: 0 });
  });
});
