/**
 * `cs2.training-priority.v2` (UX-1.7, R-13, R-38) — ONE list of training priorities. Pure and
 * deterministic. Implements Doc. 4 §4–§5 of the UX-1 artifact:
 *
 *  - Candidates: the dna-weighted-v3 signals that can shape a dimension (measured, not style,
 *    not a complement or a duplicate). Style/situation signals never enter.
 *  - Each candidate is oriented "higher is better" (a "down" signal as its complement) and
 *    compared with the project's FIXED reference (REFERENCE = 0.60 of the index, the ceiling
 *    the v1 engine and the catalogue plan already use). It is not a population comparison.
 *  - Uncertainty unit = the MATCH (rounds and events of one match are correlated, Doc. 4 §5.1):
 *    ratio estimator Σy/Σn with a match-clustered standard error and Student t with k−1 degrees
 *    of freedom; for event and round rates the Wilson interval is a floor (never narrower).
 *  - Minimums per category (Doc. 4 §5.2): event rate 10 to show, 25 events AND 4 matches to
 *    recommend; round rate 1 match to show, 100 rounds AND 4 matches; continuous mean 1 match
 *    to show, 8 matches AND 150 rounds; clutch never recommends (no per-1vN split yet).
 *  - A recommendation needs the whole interval below the reference, no match with more than
 *    half of the events, and survives dropping the heaviest match (Doc. 4 §5.6).
 *  - At most 3 priorities, ordered by (reference − interval upper bound). The rest is "in
 *    observation" with the reason, never a judgement.
 *
 * `cs2.training-priority.v1` (adaptive.ts) and `cs2.training-plan.v1` are not changed.
 */
import { FEATURE_CATALOG } from "@/lib/pipeline/features.catalog";
import { DNA_COMPLEMENT_OF } from "@/lib/playerDna";
import { DNA_V3_DUPLICATE_OF, DNA_V3_MOVED, type DnaFeatureRowV3 } from "@/lib/playerDnaV3";
import type { Priority, PriorityResult } from "@/lib/training/adaptive";
import type { SkillArea } from "@/lib/training/exercises";
import type { DnaDimension } from "@/types";

export const PRIORITY_VERSION_V2 = "cs2.training-priority.v2";
export const REFERENCE = 0.6;
export const MAX_PRIORITIES = 3;

export type SignalCategory = "EVENT_RATE" | "ROUND_RATE" | "CONTINUOUS" | "RARE";
type Denominator = "rounds" | "kills" | "deaths" | "opening_duels" | "clutches" | "kills_deaths";

interface SignalRule {
  category: SignalCategory;
  denominator: Denominator;
}

/** Category and per-match denominator of every candidate signal (Doc. 4 §5.2). */
export const SIGNAL_RULES: Record<string, SignalRule> = {
  "aim.hs_rate": { category: "EVENT_RATE", denominator: "kills" },
  "aim.kills_per_round": { category: "CONTINUOUS", denominator: "rounds" },
  "aim.damage_per_round": { category: "CONTINUOUS", denominator: "rounds" },
  "aim.damage_efficiency": { category: "CONTINUOUS", denominator: "rounds" },
  "dueling.opening_success": { category: "EVENT_RATE", denominator: "opening_duels" },
  "dueling.kd_balance": { category: "EVENT_RATE", denominator: "kills_deaths" },
  "clutch.multi_kill_rate": { category: "ROUND_RATE", denominator: "rounds" },
  "survivability.survival_rate": { category: "ROUND_RATE", denominator: "rounds" },
  "survivability.early_death_rate": { category: "EVENT_RATE", denominator: "deaths" },
  "survivability.untraded_death_rate": { category: "EVENT_RATE", denominator: "deaths" },
  "survivability.damage_taken_per_round": { category: "CONTINUOUS", denominator: "rounds" },
  "positioning.traded_death_rate": { category: "EVENT_RATE", denominator: "deaths" },
  "positioning.first_death_rate": { category: "ROUND_RATE", denominator: "rounds" },
  "utility.utility_damage_per_round": { category: "CONTINUOUS", denominator: "rounds" },
  "utility.flash_assists_per_round": { category: "CONTINUOUS", denominator: "rounds" },
  "utility.enemies_flashed_per_round": { category: "CONTINUOUS", denominator: "rounds" },
  "utility.grenades_per_round": { category: "CONTINUOUS", denominator: "rounds" },
  "decision_making.kast": { category: "ROUND_RATE", denominator: "rounds" },
  "decision_making.early_death_free_rate": { category: "ROUND_RATE", denominator: "rounds" },
  "teamplay.assists_per_round": { category: "CONTINUOUS", denominator: "rounds" },
  "teamplay.trade_participation": { category: "ROUND_RATE", denominator: "rounds" },
  "clutch.clutch_win_rate": { category: "RARE", denominator: "clutches" },
  "consistency.side_balance": { category: "CONTINUOUS", denominator: "rounds" },
  "consistency.rating": { category: "CONTINUOUS", denominator: "rounds" },
};

/** Minimums (Doc. 4 §5.2): sample to SHOW a value, sample and matches to RECOMMEND. */
export const MINIMUMS: Record<
  SignalCategory,
  { show: number; showUnit: "events" | "matches"; recommend: number; matches: number }
> = {
  EVENT_RATE: { show: 10, showUnit: "events", recommend: 25, matches: 4 },
  ROUND_RATE: { show: 1, showUnit: "matches", recommend: 100, matches: 4 },
  CONTINUOUS: { show: 1, showUnit: "matches", recommend: 150, matches: 8 },
  RARE: { show: 1, showUnit: "events", recommend: Number.POSITIVE_INFINITY, matches: 5 },
};

export type ObserveReason =
  | "BELOW_SHOW_MINIMUM"
  | "BELOW_RECOMMEND_MINIMUM"
  | "INTERVAL_CONTAINS_REFERENCE"
  | "ABOVE_REFERENCE"
  | "ONE_MATCH_DOMINATES"
  | "DEPENDS_ON_ONE_MATCH"
  | "NEVER_RECOMMENDS";

export interface PrioritySignal {
  key: string;
  /** Dimension the signal belongs to in dna-weighted-v3 (training area). */
  dimension: DnaDimension;
  category: SignalCategory;
  /** Oriented value (higher is better), on [0,1]; null below the show minimum. */
  value: number | null;
  interval: [number, number] | null;
  reference: number;
  sample: number;
  sampleUnit: Denominator;
  matches: number;
  status: "RECOMMEND" | "OBSERVE";
  reason?: ObserveReason;
  /** What is still missing to be able to recommend (sample / matches); null when nothing. */
  missing: { sample: number; matches: number } | null;
  /** reference − upper bound (> 0 only when recommended). */
  distance: number;
}

export interface PriorityResultV2 {
  version: typeof PRIORITY_VERSION_V2;
  matches: number;
  priorities: PrioritySignal[];
  observing: PrioritySignal[];
}

/** Two-sided 97.5% Student t quantiles, df 1..30 (df > 30 → normal 1.96). */
const T975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145,
  2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048,
  2.045, 2.042,
];
export const tQuantile = (df: number) => (df >= 1 && df <= 30 ? T975[df - 1]! : 1.96);

export interface MatchObservation {
  /** Oriented value in the match (higher is better). */
  value: number;
  /** The match's denominator for this signal (events / rounds). */
  weight: number;
}

/** Ratio estimator with a match-clustered standard error and t(k−1). */
export function clusteredInterval(obs: MatchObservation[]): {
  value: number;
  interval: [number, number] | null;
} {
  const n = obs.reduce((a, o) => a + o.weight, 0);
  const y = obs.reduce((a, o) => a + o.value * o.weight, 0);
  const p = y / n;
  const k = obs.length;
  if (k < 2) return { value: p, interval: null };
  const ss = obs.reduce((a, o) => a + (o.value * o.weight - p * o.weight) ** 2, 0);
  const se = Math.sqrt(((k / (k - 1)) * ss) / (n * n));
  const half = tQuantile(k - 1) * se;
  return { value: p, interval: [p - half, p + half] };
}

/** Wilson score interval (95%) for a proportion: the floor for binomial rates. */
export function wilson(p: number, n: number): [number, number] {
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
}

function intervalFor(category: SignalCategory, obs: MatchObservation[]) {
  const base = clusteredInterval(obs);
  if (!base.interval) return base;
  if (category === "CONTINUOUS") return base;
  const n = obs.reduce((a, o) => a + o.weight, 0);
  const w = wilson(Math.min(1, Math.max(0, base.value)), n);
  return {
    value: base.value,
    interval: [Math.min(base.interval[0], w[0]), Math.max(base.interval[1], w[1])] as [
      number,
      number,
    ],
  };
}

function finite(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function weightOf(row: DnaFeatureRowV3, d: Denominator): number | null {
  switch (d) {
    case "rounds":
      return finite(row.sample_rounds);
    case "kills":
      return finite(row.sample_kills);
    case "deaths":
      return finite(row.sample_deaths);
    case "opening_duels":
      return finite(row.sample_opening_duels);
    case "clutches":
      return finite(row.sample_clutches);
    case "kills_deaths": {
      const k = finite(row.sample_kills);
      const de = finite(row.sample_deaths);
      return k === null || de === null ? null : k + de;
    }
  }
}

/** Per-match oriented observations of one signal (matches without value or weight are out). */
export function observationsOf(rows: DnaFeatureRowV3[], key: string): MatchObservation[] {
  const [source, name] = key.split(".") as [string, string];
  const spec = (FEATURE_CATALOG as Record<string, Record<string, { direction: string }>>)[source]?.[
    name
  ];
  const rule = SIGNAL_RULES[key];
  if (!spec || !rule) return [];
  const out: MatchObservation[] = [];
  for (const row of rows) {
    const group =
      row.features && typeof row.features === "object"
        ? (row.features as Record<string, unknown>)[source]
        : null;
    const raw =
      group && typeof group === "object" ? finite((group as Record<string, unknown>)[name]) : null;
    const weight = weightOf(row, rule.denominator);
    if (raw === null || weight === null || weight <= 0) continue;
    out.push({ value: spec.direction === "down" ? 1 - raw : raw, weight });
  }
  return out;
}

export function assessSignal(rows: DnaFeatureRowV3[], key: string): PrioritySignal | null {
  const rule = SIGNAL_RULES[key];
  if (!rule) return null;
  const source = key.split(".")[0] as DnaDimension;
  const dimension = DNA_V3_MOVED[key] ?? source;
  const obs = observationsOf(rows, key);
  const sample = obs.reduce((a, o) => a + o.weight, 0);
  const matches = obs.length;
  const min = MINIMUMS[rule.category];
  const base = {
    key,
    dimension,
    category: rule.category,
    reference: REFERENCE,
    sample,
    sampleUnit: rule.denominator,
    matches,
    distance: 0,
  };
  const missing = {
    sample: Number.isFinite(min.recommend) ? Math.max(0, Math.ceil(min.recommend - sample)) : 0,
    matches: Math.max(0, min.matches - matches),
  };
  const shown = min.showUnit === "events" ? sample >= min.show : matches >= min.show;
  if (!matches || !shown)
    return {
      ...base,
      value: null,
      interval: null,
      status: "OBSERVE",
      reason: "BELOW_SHOW_MINIMUM",
      missing,
    };
  const { value, interval } = intervalFor(rule.category, obs);
  const observe = (reason: ObserveReason): PrioritySignal => ({
    ...base,
    value,
    interval,
    status: "OBSERVE",
    reason,
    missing: missing.sample || missing.matches ? missing : null,
  });
  if (rule.category === "RARE") return observe("NEVER_RECOMMENDS");
  if (sample < min.recommend || matches < min.matches || !interval)
    return observe("BELOW_RECOMMEND_MINIMUM");
  if (interval[1] >= REFERENCE)
    return observe(value >= REFERENCE ? "ABOVE_REFERENCE" : "INTERVAL_CONTAINS_REFERENCE");
  const heaviest = obs.reduce((a, o) => (o.weight > a.weight ? o : a), obs[0]!);
  if (rule.category === "EVENT_RATE" && heaviest.weight > sample / 2)
    return observe("ONE_MATCH_DOMINATES");
  const without = intervalFor(
    rule.category,
    obs.filter((o) => o !== heaviest),
  );
  if (!without.interval || without.interval[1] >= REFERENCE) return observe("DEPENDS_ON_ONE_MATCH");
  return {
    ...base,
    value,
    interval,
    status: "RECOMMEND",
    missing: null,
    distance: REFERENCE - interval[1],
  };
}

/** The candidate signals: v3-foldable, with a training rule (style signals never enter). */
export function candidateKeys(): string[] {
  return Object.keys(SIGNAL_RULES).filter(
    (k) => !(k in DNA_COMPLEMENT_OF) && !(k in DNA_V3_DUPLICATE_OF),
  );
}

export function computePrioritiesV2(rows: DnaFeatureRowV3[]): PriorityResultV2 {
  const all = candidateKeys()
    .map((k) => assessSignal(rows, k))
    .filter((s): s is PrioritySignal => s !== null);
  const recommended = all
    .filter((s) => s.status === "RECOMMEND")
    .sort((a, b) => b.distance - a.distance || a.key.localeCompare(b.key));
  return {
    version: PRIORITY_VERSION_V2,
    matches: new Set(rows.map((r) => r.match_id)).size,
    priorities: recommended.slice(0, MAX_PRIORITIES),
    // Beyond the top 3, a recommended signal waits (multiple comparisons, Doc. 4 §5.4).
    observing: [...recommended.slice(MAX_PRIORITIES), ...all.filter((s) => s.status === "OBSERVE")],
  };
}

/**
 * The v2 list in the shape the adaptive plan already consumes (`PriorityResult`), so creating,
 * revising and tracking a plan keep working: one area per recommended signal (the best one
 * first), ordered by distance; no recommendation → no plan (NO_EVIDENCE / INSUFFICIENT_SAMPLE).
 */
export function asPriorityResult(
  v2: PriorityResultV2,
  exercisesFor: (area: SkillArea) => Array<{ id: string }>,
  page: (area: SkillArea) => string,
): PriorityResult {
  const seen = new Set<SkillArea>();
  const priorities: Priority[] = [];
  for (const s of v2.priorities) {
    const area = s.dimension as SkillArea;
    if (seen.has(area)) continue;
    const exercises = exercisesFor(area).map((e) => e.id);
    if (!exercises.length) continue;
    seen.add(area);
    priorities.push({
      area,
      score: Math.round(s.distance * 1000) / 1000,
      parts: { gap: Math.round(s.distance * 1000) / 1000, trend: 0, confidence: 1, goal: 0 },
      evidence: [
        {
          kind: "DNA",
          metricKey: s.key,
          value: s.value === null ? null : Math.round(s.value * 1000) / 10,
          unit: "percent",
          matches: s.matches,
          coverage: null,
          methodVersion: PRIORITY_VERSION_V2,
          page: page(area),
        },
      ],
      exercises,
    });
  }
  return {
    version: PRIORITY_VERSION_V2,
    state: priorities.length ? "READY" : v2.matches < 3 ? "INSUFFICIENT_SAMPLE" : "NO_EVIDENCE",
    matches: v2.matches,
    priorities,
    excluded: [],
  };
}
