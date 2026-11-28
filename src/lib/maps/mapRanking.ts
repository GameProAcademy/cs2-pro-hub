/**
 * VGL 5.0 — "Melhor Mapa" — `map-rank-v1` (pure, deterministic, no I/O).
 *
 * Ranks the CURRENT Active Duty maps by the player's OWN performance on each one, compared with
 * the player's own performance over all eligible matches. It is a personal ranking — never a
 * comparison with other players — and it never changes the CS2 PRO Score.
 *
 * ELIGIBLE MATCH (a finished, analysable match)
 *   - map resolves to a map of the current Active Duty pool (`maps.ts`);
 *   - the player played ≥ MAP_RANK_MIN_ROUNDS rounds (a match read only in part, or abandoned
 *     early, never counts as a finished one);
 *   - the match carries a per-match rating (the broadest single signal).
 *   Demo and FACEIT matches count alike: every value comes from `OverviewMatch`, which already
 *   holds each source's own comparable value (enemy-hp ADR for demos, the source's ADR otherwise).
 *
 * SIGNALS (pooled with the ONE canonical rule, `metrics/canonicalAggregate.ts`, weighted by
 * recency) and their weight in the composite:
 *     rating 0.35 · ADR 0.20 · KAST 0.20 · K/D 0.15 · win rate 0.10
 *   HS% is shown but not ranked: it describes style (where shots land), not output.
 *   A signal a map does not carry leaves the composite and its weight is redistributed; below
 *   MAP_RANK_MIN_COVERAGE of the weight the map is not ranked. Nothing missing ever becomes 0.
 *
 * PERFORMANCE ON A MAP (relative to the player's own baseline)
 *   rₛ = mapₛ ÷ baselineₛ − 1   (clamped to ±1)        — win rate uses Laplace-smoothed rates
 *   D  = Σ wₛ·rₛ ÷ Σ wₛ                                  — e.g. +0.12 = 12 % above own average
 *
 * SMALL SAMPLES (estimate ≠ confidence)
 *   estimate  = D · n ÷ (n + K)          shrinkage toward the player's own average (K = 3)
 *   rankScore = estimate − ½ · s ÷ √n    lower bound: penalises inconsistent maps
 *       s = standard deviation of the per-match composites on that map (prior 0.25 when n < 2)
 *   A map with fewer than MAP_RANK_MIN_MATCHES eligible matches is NOT ranked (PROVISIONAL):
 *   one exceptional match can never put a 2-match map above a consistent one.
 *   confidence: n 3–4 PROVISIONAL · 5–9 MODERATE · ≥ 10 HIGH (sample size only).
 *
 * RECENCY: each match weighs 0.5^(age ÷ 120 days) relative to the newest eligible match, so the
 * ranking follows the player's current form while old matches still count. `now` is never read:
 * ages are measured from the newest match, so the result depends only on the input.
 *
 * TIERS over the k ranked maps (best first; ties broken by more matches, then map code):
 *   1 BEST · 2 SECOND · 3 THIRD · last DEVELOP (only when k ≥ 4) · the rest MEDIAN.
 *   Unranked: PROVISIONAL (1–2 matches) or NO_DATA (none).
 */
import { CURRENT_MAP_POOL_VERSION, normalizeMapCode, type Cs2MapCode } from "@/lib/cs2/maps";
import {
  pooledParts,
  type PooledMatchInput,
  type PooledMetricKey,
} from "@/lib/metrics/canonicalAggregate";

export const MAP_RANK_VERSION = "map-rank-v1";
export const MAP_RANK_MIN_ROUNDS = 10;
export const MAP_RANK_MIN_MATCHES = 3;
export const MAP_RANK_MIN_COVERAGE = 0.6;
export const MAP_RANK_SHRINK_K = 3;
export const MAP_RANK_PRIOR_SD = 0.25;
export const MAP_RANK_HALF_LIFE_DAYS = 120;

type SignalKey = "rating" | "adr" | "kast" | "kd" | "winRate";

export const MAP_RANK_WEIGHTS: Readonly<Record<SignalKey, number>> = {
  rating: 0.35,
  adr: 0.2,
  kast: 0.2,
  kd: 0.15,
  winRate: 0.1,
};

export type MapTier =
  "BEST" | "SECOND" | "THIRD" | "MEDIAN" | "DEVELOP" | "PROVISIONAL" | "NO_DATA";

export type MapRankConfidence = "PROVISIONAL" | "MODERATE" | "HIGH";

export interface MapRankInput extends PooledMatchInput {
  map: string | null;
  playedAt: string;
  result: "win" | "loss" | "draw" | null;
}

export interface MapRank {
  map: Cs2MapCode;
  tier: MapTier;
  /** 1-based position among ranked maps; null when not ranked. */
  position: number | null;
  /** Eligible matches on this map. */
  matches: number;
  /** Shrunk performance relative to the player's own average (0.12 = +12 %); null if unranked. */
  estimate: number | null;
  confidence: MapRankConfidence | null;
  /** Pooled values for display (null = not measured). */
  rating: number | null;
  adr: number | null;
  kast: number | null;
  kd: number | null;
  hsPercent: number | null;
  /** Wins ÷ decided matches on the map (null when none decided). */
  winRate: number | null;
  lastPlayedAt: string | null;
}

export type MapRankingState = "EMPTY" | "INSUFFICIENT" | "READY";

export interface MapRanking {
  version: typeof MAP_RANK_VERSION;
  poolVersion: number;
  state: MapRankingState;
  eligibleMatches: number;
  /** Every map of the current pool, ranked first (best → develop), then provisional, then no data. */
  maps: MapRank[];
  best: MapRank | null;
}

const DAY_MS = 86_400_000;
const POOLED: Exclude<SignalKey, "winRate">[] = ["rating", "adr", "kast", "kd"];

function time(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Recency-weighted pooled value: Σ w·numerator ÷ Σ w·denominator × scale. */
function weightedPool(
  matches: ReadonlyArray<{ m: MapRankInput; w: number }>,
  key: PooledMetricKey,
): number | null {
  let num = 0;
  let den = 0;
  let scale = 1;
  for (const { m, w } of matches) {
    const p = pooledParts(m, key);
    if (!p) continue;
    num += w * p.numerator;
    den += w * p.denominator;
    scale = p.scale;
  }
  if (den <= 0) return null;
  const v = (num / den) * scale;
  return key === "rating" ? Math.max(0, v) : v;
}

/** Laplace-smoothed win rate (never 0 or 1 from a handful of matches); null when none decided. */
function smoothedWinRate(matches: ReadonlyArray<{ m: MapRankInput; w: number }>): number | null {
  let wins = 0;
  let decided = 0;
  for (const { m, w } of matches) {
    if (m.result === "win" || m.result === "loss") {
      decided += w;
      if (m.result === "win") wins += w;
    }
  }
  return decided > 0 ? (wins + 1) / (decided + 2) : null;
}

function rawWinRate(matches: ReadonlyArray<MapRankInput>): number | null {
  const decided = matches.filter((m) => m.result === "win" || m.result === "loss");
  return decided.length ? decided.filter((m) => m.result === "win").length / decided.length : null;
}

type Signals = Record<SignalKey, number | null>;

function signalsOf(matches: ReadonlyArray<{ m: MapRankInput; w: number }>): Signals {
  const out = {} as Signals;
  for (const k of POOLED) out[k] = weightedPool(matches, k);
  out.winRate = smoothedWinRate(matches);
  return out;
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** Weighted relative deviation of `s` from `base`, and the share of weight available. */
export function composite(s: Signals, base: Signals): { value: number | null; coverage: number } {
  let acc = 0;
  let wsum = 0;
  for (const k of Object.keys(MAP_RANK_WEIGHTS) as SignalKey[]) {
    const v = s[k];
    const b = base[k];
    if (v === null || b === null || b <= 0) continue;
    const r = k === "winRate" ? clamp((v - b) * 2) : clamp(v / b - 1);
    acc += MAP_RANK_WEIGHTS[k] * r;
    wsum += MAP_RANK_WEIGHTS[k];
  }
  return { value: wsum > 0 ? acc / wsum : null, coverage: wsum };
}

function confidenceOf(n: number): MapRankConfidence {
  return n >= 10 ? "HIGH" : n >= 5 ? "MODERATE" : "PROVISIONAL";
}

export function isEligibleForMapRank(m: MapRankInput, pool: readonly Cs2MapCode[]): boolean {
  const code = normalizeMapCode(m.map);
  return (
    code !== null &&
    pool.includes(code) &&
    typeof m.roundsPlayed === "number" &&
    m.roundsPlayed >= MAP_RANK_MIN_ROUNDS &&
    typeof m.rating === "number" &&
    Number.isFinite(m.rating)
  );
}

export function rankMaps(
  input: ReadonlyArray<MapRankInput>,
  pool: readonly Cs2MapCode[] = CURRENT_MAP_POOL_VERSION.activeDuty,
  poolVersion: number = CURRENT_MAP_POOL_VERSION.version,
): MapRanking {
  const eligible = input.filter((m) => isEligibleForMapRank(m, pool));
  const newest = eligible.reduce((t, m) => Math.max(t, time(m.playedAt)), 0);
  const weighted = eligible.map((m) => ({
    m,
    w: Math.pow(0.5, Math.max(0, newest - time(m.playedAt)) / DAY_MS / MAP_RANK_HALF_LIFE_DAYS),
  }));
  const baseline = signalsOf(weighted);

  const ranked: Array<MapRank & { rankScore: number }> = [];
  const unranked: MapRank[] = [];
  for (const map of pool) {
    const on = weighted.filter((x) => normalizeMapCode(x.m.map) === map);
    const n = on.length;
    const plain = on.map((x) => x.m);
    const display = {
      rating: weightedPool(
        on.map((x) => ({ m: x.m, w: 1 })),
        "rating",
      ),
      adr: weightedPool(
        on.map((x) => ({ m: x.m, w: 1 })),
        "adr",
      ),
      kast: weightedPool(
        on.map((x) => ({ m: x.m, w: 1 })),
        "kast",
      ),
      kd: weightedPool(
        on.map((x) => ({ m: x.m, w: 1 })),
        "kd",
      ),
      hsPercent: weightedPool(
        on.map((x) => ({ m: x.m, w: 1 })),
        "hsPercent",
      ),
      winRate: rawWinRate(plain),
      lastPlayedAt: n
        ? plain.reduce((a, m) => (time(m.playedAt) > time(a) ? m.playedAt : a), plain[0]!.playedAt)
        : null,
    };
    const comp = n ? composite(signalsOf(on), baseline) : { value: null, coverage: 0 };
    if (n < MAP_RANK_MIN_MATCHES || comp.value === null || comp.coverage < MAP_RANK_MIN_COVERAGE) {
      unranked.push({
        map,
        tier: n === 0 ? "NO_DATA" : "PROVISIONAL",
        position: null,
        matches: n,
        estimate: null,
        confidence: null,
        ...display,
      });
      continue;
    }
    const perMatch = on
      .map((x) => composite(signalsOf([{ m: x.m, w: 1 }]), baseline).value)
      .filter((v): v is number => v !== null);
    const mean = perMatch.reduce((a, v) => a + v, 0) / (perMatch.length || 1);
    const sd =
      perMatch.length >= 2
        ? Math.sqrt(perMatch.reduce((a, v) => a + (v - mean) ** 2, 0) / (perMatch.length - 1))
        : MAP_RANK_PRIOR_SD;
    const estimate = (comp.value * n) / (n + MAP_RANK_SHRINK_K);
    ranked.push({
      map,
      tier: "MEDIAN",
      position: null,
      matches: n,
      estimate,
      confidence: confidenceOf(n),
      rankScore: estimate - (0.5 * sd) / Math.sqrt(n),
      ...display,
    });
  }

  ranked.sort(
    (a, b) => b.rankScore - a.rankScore || b.matches - a.matches || a.map.localeCompare(b.map),
  );
  const k = ranked.length;
  const tiered: MapRank[] = ranked.map(({ rankScore: _drop, ...r }, i) => ({
    ...r,
    position: i + 1,
    tier:
      i === 0
        ? "BEST"
        : i === 1
          ? "SECOND"
          : i === 2
            ? "THIRD"
            : k >= 4 && i === k - 1
              ? "DEVELOP"
              : "MEDIAN",
  }));
  unranked.sort(
    (a, b) =>
      (a.tier === b.tier ? 0 : a.tier === "PROVISIONAL" ? -1 : 1) ||
      b.matches - a.matches ||
      a.map.localeCompare(b.map),
  );
  return {
    version: MAP_RANK_VERSION,
    poolVersion,
    state: eligible.length === 0 ? "EMPTY" : k === 0 ? "INSUFFICIENT" : "READY",
    eligibleMatches: eligible.length,
    maps: [...tiered, ...unranked],
    best: tiered[0] ?? null,
  };
}

/** The tier of one map code (any spelling) in a ranking; null for maps outside the pool. */
export function tierOf(ranking: MapRanking, raw: string | null | undefined): MapRank | null {
  const code = normalizeMapCode(raw);
  return code ? (ranking.maps.find((r) => r.map === code) ?? null) : null;
}
