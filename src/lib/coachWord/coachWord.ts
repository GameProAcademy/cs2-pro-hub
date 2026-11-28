/**
 * VGL 5.0 — "Palavra do Treinador" (`coach-word-v1`). PRE-WRITTEN guidance chosen by
 * DETERMINISTIC rules from the player's own metrics. No generative AI, no network call: the
 * texts live in the i18n dictionaries (`cw.<id>.text` / `cw.<id>.tip`, five languages) and this
 * module only decides WHICH message a section shows. One message per section, so two
 * messages can never contradict each other on a screen.
 *
 * DATA RULES
 *  - Missing ≠ problem: a rule only fires on MEASURED values; without them the section falls
 *    to its "insufficient sample" message, never to a negative one.
 *  - Global sections need ≥ CW_MIN_MATCHES matches and ≥ CW_MIN_ROUNDS rounds.
 *  - The match message uses ONLY that match's own values and its map (never the global ones).
 *
 * THRESHOLDS (semantic, on the canonical metrics — metrics-catalog-v2.1):
 *  ADR (enemy damage per round)  low < 65 · high ≥ 85   (a full-buy rifle round is ~75–85)
 *  KAST %                        low < 65 · high ≥ 75   (fewer than 2 in 3 rounds with impact is low)
 *  K/D                           low < 0.85 · high ≥ 1.15
 *  Aim without survival          HS% ≥ 45 and ADR ≥ 80, with KAST < 68 or deaths/round > 0.75
 *  Trend (≥ 6 matches)           pooled rating of the last 3 vs the 3 before: ±10 %
 *  Inconsistency (≥ 5 matches)   coefficient of variation of the match rating > 0.35
 *  Map (map-rank-v1)             best map ≥ +10 % vs own average · map to develop ≤ −10 %
 *  Player DNA                    strongest index ≥ 65 · weakest index < 40 (0–100 scale)
 * Every threshold is a documented design value of this version, not a statistical fit.
 */
import { pooledValue, type PooledMatchInput } from "@/lib/metrics/canonicalAggregate";
import type { MapRanking } from "@/lib/maps/mapRanking";
import type { ProScoreState } from "@/lib/proScore";

export const COACH_WORD_VERSION = "coach-word-v1";
export const CW_MIN_MATCHES = 3;
export const CW_MIN_ROUNDS = 60;

export const CW_T = {
  adrLow: 65,
  adrHigh: 85,
  kastLow: 65,
  kastHigh: 75,
  kdLow: 0.85,
  kdHigh: 1.15,
  hsAim: 45,
  adrAim: 80,
  kastSurvival: 68,
  dprHigh: 0.75,
  trend: 0.1,
  cv: 0.35,
  mapGap: 0.1,
  dnaTop: 65,
  dnaLow: 40,
  matchAdrHigh: 95,
  matchDprHigh: 0.8,
  matchKastLow: 60,
  matchKdLow: 0.7,
  matchAdrLow: 60,
  matchKdHigh: 1.2,
  matchKastHigh: 75,
} as const;

export type CoachWordSection =
  | "dashboard"
  | "analysis"
  | "playerDna"
  | "performance"
  | "evolution"
  | "maps"
  | "training"
  | "goals"
  | "match";

export type CoachWordTone = "positive" | "negative" | "neutral" | "insufficient";
export type CoachWordPriority = "HIGH" | "MEDIUM" | "INFO";

export interface CoachWordMatch extends PooledMatchInput {
  map: string | null;
  playedAt: string;
  result: "win" | "loss" | "draw" | null;
}

export interface CoachWordContext {
  matches?: ReadonlyArray<CoachWordMatch> | null;
  mapRanking?: MapRanking | null;
  /** Measured Player DNA dimensions (0–100 index). */
  dna?: ReadonlyArray<{ dimension: string; value: number }> | null;
  scoreState?: ProScoreState | null;
  /** The first item of the single Training list (its DNA dimension). */
  trainingTop?: string | null;
  goals?: { total: number; reached: number; inProgress: number; waiting: number } | null;
  /** The match of the Match Room summary (match section only). */
  match?: CoachWordMatch | null;
}

export interface CoachWord {
  id: string;
  tone: CoachWordTone;
  priority: CoachWordPriority;
  /** Values for the message placeholders ({map}, {dimension}, {adr}…). */
  vars: Record<string, string | number>;
  /** The metrics the message talks about (for traceability and tests). */
  metrics: string[];
}

interface Rule {
  id: string;
  tone: CoachWordTone;
  /** Higher fires first. */
  rank: number;
  metrics: string[];
  when: (s: Stats) => Record<string, string | number> | null;
}

/** Pooled player numbers the rules read. null = not measured. */
export interface Stats {
  matches: number;
  rounds: number;
  adr: number | null;
  kast: number | null;
  kd: number | null;
  hs: number | null;
  dpr: number | null;
  trend: number | null;
  cv: number | null;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function statsOf(matches: ReadonlyArray<CoachWordMatch>): Stats {
  const rounds = matches.reduce((a, m) => a + (finite(m.roundsPlayed) ? m.roundsPlayed : 0), 0);
  const deaths = matches.reduce(
    (a, m) => a + (finite(m.deaths) && finite(m.roundsPlayed) ? m.deaths : 0),
    0,
  );
  const deathRounds = matches.reduce(
    (a, m) => a + (finite(m.deaths) && finite(m.roundsPlayed) ? m.roundsPlayed : 0),
    0,
  );
  const ordered = [...matches].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  let trend: number | null = null;
  if (ordered.length >= 6) {
    const recent = pooledValue(ordered.slice(0, 3), "rating").value;
    const before = pooledValue(ordered.slice(3, 6), "rating").value;
    trend = recent !== null && before !== null && before > 0 ? recent / before - 1 : null;
  }
  const ratings = matches.map((m) => m.rating).filter(finite);
  let cv: number | null = null;
  if (ratings.length >= 5) {
    const mean = ratings.reduce((a, v) => a + v, 0) / ratings.length;
    const sd = Math.sqrt(ratings.reduce((a, v) => a + (v - mean) ** 2, 0) / (ratings.length - 1));
    cv = mean > 0 ? sd / mean : null;
  }
  return {
    matches: matches.length,
    rounds,
    adr: pooledValue(matches, "adr").value,
    kast: pooledValue(matches, "kast").value,
    kd: pooledValue(matches, "kd").value,
    hs: pooledValue(matches, "hsPercent").value,
    dpr: deathRounds > 0 ? deaths / deathRounds : null,
    trend,
    cv,
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.round(Math.abs(v) * 100);

/** Metric rules shared by Dashboard, Meu Raio-X and Performance (one message wins). */
const METRIC_RULES: Rule[] = [
  {
    id: "aimSurvival",
    tone: "negative",
    rank: 90,
    metrics: ["hsPercent", "adr", "kast"],
    when: (s) =>
      s.hs !== null &&
      s.adr !== null &&
      s.hs >= CW_T.hsAim &&
      s.adr >= CW_T.adrAim &&
      ((s.kast !== null && s.kast < CW_T.kastSurvival) || (s.dpr !== null && s.dpr > CW_T.dprHigh))
        ? { hs: Math.round(s.hs), adr: r1(s.adr) }
        : null,
  },
  {
    id: "kastLow",
    tone: "negative",
    rank: 85,
    metrics: ["kast"],
    when: (s) => (s.kast !== null && s.kast < CW_T.kastLow ? { kast: Math.round(s.kast) } : null),
  },
  {
    id: "adrLow",
    tone: "negative",
    rank: 80,
    metrics: ["adr"],
    when: (s) => (s.adr !== null && s.adr < CW_T.adrLow ? { adr: r1(s.adr) } : null),
  },
  {
    id: "kdLow",
    tone: "negative",
    rank: 75,
    metrics: ["kd"],
    when: (s) => (s.kd !== null && s.kd < CW_T.kdLow ? { kd: r2(s.kd) } : null),
  },
  {
    id: "adrHigh",
    tone: "positive",
    rank: 60,
    metrics: ["adr"],
    when: (s) => (s.adr !== null && s.adr >= CW_T.adrHigh ? { adr: r1(s.adr) } : null),
  },
  {
    id: "kdHigh",
    tone: "positive",
    rank: 55,
    metrics: ["kd"],
    when: (s) => (s.kd !== null && s.kd >= CW_T.kdHigh ? { kd: r2(s.kd) } : null),
  },
  {
    id: "kastHigh",
    tone: "positive",
    rank: 50,
    metrics: ["kast"],
    when: (s) => (s.kast !== null && s.kast >= CW_T.kastHigh ? { kast: Math.round(s.kast) } : null),
  },
];

const TREND_DOWN: Rule = {
  id: "trendDown",
  tone: "negative",
  rank: 95,
  metrics: ["rating"],
  when: (s) => (s.trend !== null && s.trend <= -CW_T.trend ? { d: pct(s.trend) } : null),
};
const TREND_UP: Rule = {
  id: "trendUp",
  tone: "positive",
  rank: 65,
  metrics: ["rating"],
  when: (s) => (s.trend !== null && s.trend >= CW_T.trend ? { d: pct(s.trend) } : null),
};
const INCONSISTENT: Rule = {
  id: "inconsistent",
  tone: "negative",
  rank: 80,
  metrics: ["rating"],
  when: (s) => (s.cv !== null && s.cv > CW_T.cv ? {} : null),
};

const PRIORITY: Record<CoachWordTone, CoachWordPriority> = {
  negative: "HIGH",
  positive: "MEDIUM",
  neutral: "INFO",
  insufficient: "INFO",
};

function word(
  id: string,
  tone: CoachWordTone,
  metrics: string[],
  vars: Record<string, string | number> = {},
): CoachWord {
  return { id, tone, priority: PRIORITY[tone], vars, metrics };
}

/** The highest-ranked rule that fires, or null. Deterministic: ties keep the list order. */
function first(rules: Rule[], s: Stats): CoachWord | null {
  for (const r of [...rules].sort((a, b) => b.rank - a.rank)) {
    const vars = r.when(s);
    if (vars) return word(r.id, r.tone, r.metrics, vars);
  }
  return null;
}

function enoughSample(s: Stats): boolean {
  return s.matches >= CW_MIN_MATCHES && s.rounds >= CW_MIN_ROUNDS;
}

/** Everything a section needs, from the context (pure, deterministic). */
export function coachWordFor(section: CoachWordSection, ctx: CoachWordContext): CoachWord {
  if (section === "match") return matchWord(ctx.match ?? null);
  const matches = ctx.matches ?? [];
  const s = statsOf(matches);
  const enough = enoughSample(s);
  const insufficient = word("insufficient", "insufficient", [], {
    min: CW_MIN_MATCHES,
    n: s.matches,
  });

  switch (section) {
    case "dashboard": {
      if (!enough) return insufficient;
      return (
        first([TREND_DOWN, ...METRIC_RULES.filter((r) => r.tone === "negative"), TREND_UP], s) ??
        (ctx.trainingTop
          ? word("trainingFocus", "neutral", ["training"], { dimension: ctx.trainingTop })
          : null) ??
        first(METRIC_RULES, s) ??
        word("balanced", "neutral", [])
      );
    }
    case "analysis":
    case "performance": {
      if (section === "performance" && ctx.scoreState && ctx.scoreState !== "READY" && !enough)
        return word("scorePending", "insufficient", ["proScore"], { min: CW_MIN_MATCHES });
      if (!enough) return insufficient;
      const metric = first(METRIC_RULES, s);
      if (metric?.tone === "negative") return metric;
      if (section === "analysis") {
        const low = weakestDna(ctx.dna);
        if (low) return low;
      }
      return metric ?? word("balanced", "neutral", []);
    }
    case "playerDna": {
      const low = weakestDna(ctx.dna);
      if (low) return low;
      const top = strongestDna(ctx.dna);
      if (top) return top;
      return ctx.dna && ctx.dna.length
        ? word("dnaEven", "neutral", ["dna"])
        : word("dnaPending", "insufficient", ["dna"]);
    }
    case "evolution": {
      if (s.matches < 6) return word("trendPending", "insufficient", ["rating"], { n: s.matches });
      return (
        first([TREND_DOWN, INCONSISTENT, TREND_UP], s) ?? word("trendStable", "neutral", ["rating"])
      );
    }
    case "maps": {
      const r = ctx.mapRanking;
      if (!r || r.state !== "READY" || !r.best)
        return word("mapsPending", "insufficient", ["map"], { min: 3 });
      const develop = r.maps.find((m) => m.tier === "DEVELOP");
      if (develop && develop.estimate !== null && develop.estimate <= -CW_T.mapGap)
        return word("mapDevelop", "negative", ["map"], {
          map: develop.map,
          d: pct(develop.estimate),
        });
      if (r.best.estimate !== null && r.best.estimate >= CW_T.mapGap)
        return word("mapBest", "positive", ["map"], { map: r.best.map, d: pct(r.best.estimate) });
      return word("mapsEven", "neutral", ["map"], { map: r.best.map });
    }
    case "training": {
      if (ctx.trainingTop)
        return word("trainingFocus", "neutral", ["training"], { dimension: ctx.trainingTop });
      return enough ? word("trainingNone", "positive", ["training"]) : insufficient;
    }
    case "goals": {
      const g = ctx.goals;
      if (!g || g.total === 0) return word("goalsNone", "neutral", ["goals"]);
      if (g.inProgress > 0)
        return word("goalsProgress", "negative", ["goals"], { n: g.inProgress });
      if (g.reached > 0) return word("goalsReached", "positive", ["goals"], { n: g.reached });
      return word("goalsWaiting", "insufficient", ["goals"]);
    }
  }
}

function weakestDna(dna: CoachWordContext["dna"]): CoachWord | null {
  if (!dna?.length) return null;
  const low = [...dna].sort(
    (a, b) => a.value - b.value || a.dimension.localeCompare(b.dimension),
  )[0]!;
  return low.value < CW_T.dnaLow
    ? word("dnaLow", "negative", ["dna"], { dimension: low.dimension, v: Math.round(low.value) })
    : null;
}

function strongestDna(dna: CoachWordContext["dna"]): CoachWord | null {
  if (!dna?.length) return null;
  const top = [...dna].sort(
    (a, b) => b.value - a.value || a.dimension.localeCompare(b.dimension),
  )[0]!;
  return top.value >= CW_T.dnaTop
    ? word("dnaTop", "positive", ["dna"], { dimension: top.dimension, v: Math.round(top.value) })
    : null;
}

/** One match only: its own values and its map; never the player's global numbers. */
export function matchWord(m: CoachWordMatch | null): CoachWord {
  if (!m || !finite(m.roundsPlayed) || m.roundsPlayed < 10)
    return word("matchShort", "insufficient", []);
  const map = m.map ?? "";
  const rounds = m.roundsPlayed;
  const kd = finite(m.kills) && finite(m.deaths) && m.deaths > 0 ? m.kills / m.deaths : null;
  const dpr = finite(m.deaths) ? m.deaths / rounds : null;
  const adr = finite(m.adr) ? m.adr : null;
  const kast = finite(m.kast) ? m.kast : null;
  if (
    m.result === "loss" &&
    ((adr !== null && adr >= CW_T.adrHigh) || (kd !== null && kd >= CW_T.matchKdHigh))
  )
    return word("matchGoodLoss", "positive", ["adr", "kd"], {
      map,
      adr: adr === null ? "—" : r1(adr),
    });
  if (dpr !== null && dpr >= CW_T.matchDprHigh && kast !== null && kast < CW_T.matchKastLow)
    return word("matchSurvival", "negative", ["deaths", "kast"], { map, kast: Math.round(kast) });
  if (adr !== null && adr >= CW_T.matchAdrHigh)
    return word("matchDamage", "positive", ["adr"], { map, adr: r1(adr) });
  if (kd !== null && kd < CW_T.matchKdLow && adr !== null && adr < CW_T.matchAdrLow)
    return word("matchTough", "negative", ["kd", "adr"], { map, adr: r1(adr) });
  if (m.result === "win" && kast !== null && kast >= CW_T.matchKastHigh)
    return word("matchSolidWin", "positive", ["kast"], { map, kast: Math.round(kast) });
  return word("matchNeutral", "neutral", [], { map });
}

/** Every message id the engine can return (the i18n bank must hold `cw.<id>.text/.tip`). */
export const COACH_WORD_IDS = [
  "insufficient",
  "aimSurvival",
  "kastLow",
  "adrLow",
  "kdLow",
  "adrHigh",
  "kdHigh",
  "kastHigh",
  "trendDown",
  "trendUp",
  "inconsistent",
  "trendStable",
  "trendPending",
  "balanced",
  "trainingFocus",
  "trainingNone",
  "scorePending",
  "dnaLow",
  "dnaTop",
  "dnaEven",
  "dnaPending",
  "mapsPending",
  "mapDevelop",
  "mapBest",
  "mapsEven",
  "goalsNone",
  "goalsProgress",
  "goalsReached",
  "goalsWaiting",
  "matchShort",
  "matchGoodLoss",
  "matchSurvival",
  "matchDamage",
  "matchTough",
  "matchSolidWin",
  "matchNeutral",
] as const;
