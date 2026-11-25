/**
 * `metrics-catalog-v2` — the ONE place where a per-match value becomes the player's value
 * over several matches for the rate metrics shown on more than one screen.
 *
 * Every consumer (Dashboard / Matches aggregates, X-ray, AI Coach observations, Evolution,
 * monthly review) calls these functions, so the same metric over the same matches has the
 * same value everywhere. No screen may average these per-match values on its own.
 *
 * Rule: a rate is pooled over its OWN denominator — Σ numerator ÷ Σ denominator over the
 * matches that carry both. A per-match value is never weighted by another metric's
 * denominator (HS% by rounds was the `dna-weighted-v2` defect) and never averaged with equal
 * match weights (the `metrics-catalog-v1` behaviour: a 17-round match counted as much as a
 * 24-round one).
 *
 *   ADR    = Σ (ADR × rounds) ÷ Σ rounds          (damage per round, pooled over rounds)
 *   KAST % = Σ KAST rounds ÷ Σ rounds × 100       (KAST rounds = KAST% × rounds / 100)
 *   HS %   = Σ headshot kills ÷ Σ kills × 100     (HS kills = HS% × kills / 100)
 *   K/D    = Σ kills ÷ Σ deaths
 *   Rating = Σ (rating × rounds) ÷ Σ rounds
 *
 * Counts are reconstructed as persisted value × denominator, WITHOUT rounding to integers: the
 * persisted values carry one decimal (error ≤ 0.05 × denominator / 100 per match), and values
 * imported from other sources need not come from integer counts. So a single match always
 * aggregates to exactly its own persisted value, and several matches to the
 * denominator-weighted mean of their persisted values.
 *
 * Rating: the per-match rating is linear in KPR, DPR and ADR (0.45·KPR/0.70 +
 * 0.25·(1 − DPR/0.75) + 0.30·ADR/80), so its rounds-weighted mean IS the rating of the pooled
 * KPR, DPR and ADR — exactly, unless a match was floored at 0. It is a CS2 PRO relative index,
 * not HLTV Rating. CT/T ratings have no persisted per-side round count, so they are NOT pooled
 * (see `canonicalMetrics.ts`).
 *
 * NULL is never zero: a match without the value (or without its denominator) leaves both the
 * numerator and the denominator, and `matches` reports the coverage.
 */
/**
 * v2.1 (Q-21, 2026-11-25): the rating is the formula on the pooled counts. The formula is linear in
 * kills, deaths and damage per round, so that equals Σ(rounds × unfloored match value) ÷ Σ rounds,
 * floored once. Above the floor the unfloored value is the stored match rating; a match at the
 * floor contributes its true value from its own counts. v2 (round-weighted mean of the floored
 * ratings) differs only when a match is at the floor — none in production on 2026-11-25.
 */
export const METRICS_CATALOG_VERSION = "metrics-catalog-v2.1";

export type PooledMetricKey = "adr" | "kast" | "hsPercent" | "kd" | "rating";

/** The per-match fields this module reads (a subset of `OverviewMatch`). */
export interface PooledMatchInput {
  kills: number | null;
  deaths: number | null;
  adr: number | null;
  /**
   * enemy-hp-v1 enemy health removed (demo matches). When present it is the exact ADR numerator,
   * so the pooled ADR does not compound each match's one-decimal rounding.
   */
  damageEnemyHp?: number | null;
  kast: number | null;
  hsPercent: number | null;
  rating: number | null;
  /**
   * Q-21: the match's rating before the floor at 0, from its own kills, deaths, raw damage and
   * rounds (demo matches). The pooled rating is the formula on the pooled counts; a match whose
   * rating was floored still contributes its true (negative) value, and the floor applies once.
   */
  ratingUnfloored?: number | null;
  roundsPlayed: number | null;
}

export interface PooledParts {
  /** A count or total in natural units: damage, KAST rounds, headshot kills, kills, rating × rounds. */
  numerator: number;
  denominator: number;
  /** value = numerator ÷ denominator × scale (100 for the percentages, 1 otherwise). */
  scale: 1 | 100;
}

export interface PooledValue {
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  /** Matches that carry the value AND its denominator. */
  matches: number;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The weight each metric is pooled over, as written in the catalog. */
export const POOLED_DENOMINATOR: Record<PooledMetricKey, string> = {
  adr: "rounds played",
  kast: "rounds played",
  hsPercent: "kills",
  kd: "deaths",
  rating: "rounds played",
};

/** One match's contribution, or null when the match does not carry the value or its denominator. */
export function pooledParts(m: PooledMatchInput, key: PooledMetricKey): PooledParts | null {
  const rounds = finite(m.roundsPlayed) && m.roundsPlayed > 0 ? m.roundsPlayed : null;
  switch (key) {
    case "adr":
      if (!finite(m.adr) || !rounds) return null;
      return {
        numerator: finite(m.damageEnemyHp) ? m.damageEnemyHp : m.adr * rounds,
        denominator: rounds,
        scale: 1,
      };
    case "kast":
      return finite(m.kast) && rounds
        ? { numerator: (m.kast * rounds) / 100, denominator: rounds, scale: 100 }
        : null;
    case "hsPercent":
      return finite(m.hsPercent) && finite(m.kills) && m.kills > 0
        ? { numerator: (m.hsPercent * m.kills) / 100, denominator: m.kills, scale: 100 }
        : null;
    case "kd":
      return finite(m.kills) && finite(m.deaths)
        ? { numerator: m.kills, denominator: m.deaths, scale: 1 }
        : null;
    case "rating": {
      if (!finite(m.rating) || !rounds) return null;
      // Above the floor the stored rating IS the unfloored value (the one the match shows); only a
      // match at the floor needs its true value, recomputed from its own counts (Q-21).
      const value = m.rating <= 0 && finite(m.ratingUnfloored) ? m.ratingUnfloored : m.rating;
      return { numerator: value * rounds, denominator: rounds, scale: 1 };
    }
  }
}

/** The pooled value over the matches (unrounded; consumers round once, to their precision). */
export function pooledValue(
  matches: readonly PooledMatchInput[],
  key: PooledMetricKey,
): PooledValue {
  const parts = matches.map((m) => pooledParts(m, key)).filter((p): p is PooledParts => p !== null);
  if (!parts.length) return { value: null, numerator: null, denominator: null, matches: 0 };
  const numerator = parts.reduce((s, p) => s + p.numerator, 0);
  const denominator = parts.reduce((s, p) => s + p.denominator, 0);
  const scale = parts[0]!.scale;
  const raw = denominator > 0 ? (numerator / denominator) * scale : null;
  return {
    // Q-21: the rating's floor at 0 applies once, to the pooled value.
    value: raw !== null && key === "rating" ? Math.max(0, raw) : raw,
    numerator,
    denominator,
    matches: parts.length,
  };
}
