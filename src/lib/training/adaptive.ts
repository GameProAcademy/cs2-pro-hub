/**
 * PM5 / Fase 4.2.9 — adaptive training (module H). Pure and deterministic.
 *
 * `cs2.training-priority.v1` — which skill areas to train first, from evidence only:
 *   gap   = (0.60 − DNA index) / 0.60 for an OBSERVED Player DNA dimension below 0.60 (the same
 *           ceiling the existing catalog plan uses); a missing dimension is never a weakness;
 *   trend = |Δ%| / 20, capped at 1, when an evolution comparison is OK (≥ 3 + 3 matches, same
 *           method) AND the change goes the wrong way for that metric; otherwise 0;
 *   conf  = min(1, matches measured / 10) — fewer than 3 matches → not eligible;
 *   goal  = +0.15 when a goal the player declared points at the area.
 *   score = conf × (0.6·gap + 0.25·trend) + goal.
 * An area needs gap > 0 or trend > 0 AND an available exercise. Nothing is promised: a score
 * orders attention, it does not predict improvement.
 *
 * `cs2.training-plan.v1` — horizon 7 / 30 / 90 days → 1 / 2 / 3 priorities, the player's
 * availability (sessions per week, minutes), one exercise per session rotating inside the
 * priorities, review dates, process goals and tracked metrics with their baseline (no numeric
 * target is invented).
 */
import type { EvolutionReport } from "@/lib/evolution/evolution";
import {
  EXERCISES_VERSION,
  exercisesFor,
  type Exercise,
  type SkillArea,
} from "@/lib/training/exercises";

export const PRIORITY_VERSION = "cs2.training-priority.v1";
export const PLAN_VERSION = "cs2.training-plan.v1";
export const DNA_CEILING = 0.6;
export const MIN_MATCHES = 3;
export const HORIZONS = [7, 30, 90] as const;
export type Horizon = (typeof HORIZONS)[number];
export const PRIORITIES_BY_HORIZON: Record<Horizon, number> = { 7: 1, 30: 2, 90: 3 };

/** Evolution metric(s) that describe each area (direction from the metric definition). */
export const AREA_METRICS: Record<SkillArea, string[]> = {
  aim: ["hsPercent", "kd"],
  dueling: ["openingWinRate"],
  positioning: ["deathsPerRound"],
  survivability: ["deathsPerRound"],
  utility: ["flashAssistsPerRound"],
  teamplay: ["tradeKillsPerRound"],
  clutch: ["clutchWinRate"],
  decision_making: [],
  economy: [],
  consistency: ["rating"],
};
/** Page where the evidence of an area can be opened. */
export const AREA_PAGE: Record<SkillArea, string> = {
  aim: "/duels",
  dueling: "/duels",
  positioning: "/deaths",
  survivability: "/deaths",
  utility: "/utility",
  teamplay: "/rounds",
  clutch: "/rounds",
  decision_making: "/rounds",
  economy: "/rounds",
  consistency: "/evolution",
};
const GOAL_AREAS: Record<string, SkillArea[]> = {
  AIM_MECHANICS: ["aim", "dueling"],
  GAMESENSE_DECISION: ["positioning", "decision_making", "economy"],
  CONSISTENCY: ["consistency"],
  COMPETITIVE_TEAM: ["teamplay", "utility"],
  CLIMB_RATING: [],
  PRO_CAREER: [],
};
const ORDER: SkillArea[] = [
  "aim",
  "dueling",
  "positioning",
  "survivability",
  "utility",
  "teamplay",
  "clutch",
  "decision_making",
  "economy",
  "consistency",
];

export interface DnaInput {
  state: "READY" | "INSUFFICIENT_SAMPLE" | "NO_DATA";
  matches: number;
  dimensions: Array<{ dimension: string; value: number | null }>;
}

export interface EvidenceItem {
  kind: "DNA" | "TREND";
  metricKey: string;
  value: number | null;
  unit: string;
  matches: number;
  coverage: { measured: number; window: number } | null;
  methodVersion: string;
  /** For TREND: previous → recent and the relative change. */
  previous?: number | null;
  deltaPercent?: number | null;
  page: string;
}

export interface Priority {
  area: SkillArea;
  score: number;
  parts: { gap: number; trend: number; confidence: number; goal: number };
  evidence: EvidenceItem[];
  exercises: string[];
}

export interface PriorityResult {
  version: typeof PRIORITY_VERSION;
  state: "READY" | "NO_EVIDENCE" | "INSUFFICIENT_SAMPLE";
  matches: number;
  priorities: Priority[];
  /** Areas looked at and why they were left out. */
  excluded: Array<{
    area: SkillArea;
    reason: "NOT_MEASURED" | "NO_SIGNAL" | "NO_EXERCISE" | "LOW_SAMPLE";
  }>;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export function computePriorities(
  dna: DnaInput,
  evolution: EvolutionReport | null,
  goals: string[],
): PriorityResult {
  const matches = Math.max(dna.matches, evolution?.window.n ?? 0);
  if (matches === 0)
    return {
      version: PRIORITY_VERSION,
      state: "NO_EVIDENCE",
      matches,
      priorities: [],
      excluded: [],
    };
  if (matches < MIN_MATCHES)
    return {
      version: PRIORITY_VERSION,
      state: "INSUFFICIENT_SAMPLE",
      matches,
      priorities: [],
      excluded: [],
    };
  const goalAreas = new Set(goals.flatMap((g) => GOAL_AREAS[g] ?? []));
  const priorities: Priority[] = [];
  const excluded: PriorityResult["excluded"] = [];
  for (const area of ORDER) {
    const evidence: EvidenceItem[] = [];
    const dim =
      dna.state !== "NO_DATA" ? dna.dimensions.find((d) => d.dimension === area) : undefined;
    const dnaValue = dim && dim.value !== null && Number.isFinite(dim.value) ? dim.value : null;
    let gap = 0;
    if (dnaValue !== null) {
      gap = dnaValue < DNA_CEILING ? (DNA_CEILING - dnaValue) / DNA_CEILING : 0;
      evidence.push({
        kind: "DNA",
        metricKey: `dna.${area}`,
        value: round3(dnaValue * 100),
        unit: "INDEX_0_100",
        matches: dna.matches,
        coverage: null,
        methodVersion: "player-dna",
        page: "/player-dna",
      });
    }
    let trend = 0;
    let measured = 0;
    for (const key of AREA_METRICS[area]) {
      const m = evolution?.metrics.find((x) => x.key === key);
      if (!m || m.window.status !== "OK") continue;
      measured = Math.max(measured, m.window.matches);
      const c = m.comparison;
      const worse =
        c.status === "OK" &&
        c.delta !== null &&
        (m.definition.higherIsBetter ? c.delta < 0 : c.delta > 0);
      if (worse && c.deltaPercent !== null)
        trend = Math.max(trend, Math.min(1, Math.abs(c.deltaPercent) / 20));
      evidence.push({
        kind: "TREND",
        metricKey: key,
        value: m.window.value,
        unit: m.definition.unit,
        matches: m.window.matches,
        coverage: { measured: m.window.matches, window: m.window.windowMatches },
        methodVersion: evolution!.version,
        previous: c.status === "OK" ? c.previous.value : null,
        deltaPercent: c.status === "OK" ? c.deltaPercent : null,
        page: "/evolution",
      });
    }
    if (dnaValue === null && measured === 0) {
      excluded.push({ area, reason: "NOT_MEASURED" });
      continue;
    }
    const sample = Math.max(dnaValue !== null ? dna.matches : 0, measured);
    if (sample < MIN_MATCHES) {
      excluded.push({ area, reason: "LOW_SAMPLE" });
      continue;
    }
    if (gap === 0 && trend === 0) {
      excluded.push({ area, reason: "NO_SIGNAL" });
      continue;
    }
    const exercises = exercisesFor(area).map((e) => e.id);
    if (!exercises.length) {
      excluded.push({ area, reason: "NO_EXERCISE" });
      continue;
    }
    const confidence = Math.min(1, sample / 10);
    const goal = goalAreas.has(area) ? 0.15 : 0;
    priorities.push({
      area,
      score: round3(confidence * (0.6 * gap + 0.25 * trend) + goal),
      parts: { gap: round3(gap), trend: round3(trend), confidence: round3(confidence), goal },
      evidence,
      exercises,
    });
  }
  priorities.sort((a, b) => b.score - a.score || ORDER.indexOf(a.area) - ORDER.indexOf(b.area));
  return {
    version: PRIORITY_VERSION,
    state: priorities.length ? "READY" : "NO_EVIDENCE",
    matches,
    priorities,
    excluded,
  };
}

// ------------------------------------------------------------------ plan

export interface Availability {
  sessionsPerWeek: number;
  minutesPerSession: number;
}
export const AVAILABILITY_LIMITS = {
  minSessions: 1,
  maxSessions: 6,
  minMinutes: 10,
  maxMinutes: 90,
};

export interface PlannedSession {
  index: number;
  /** Day offset from the plan start (0 = first day). */
  day: number;
  week: number;
  area: SkillArea;
  exerciseId: string;
  minutes: number;
}

export interface PlanGoal {
  kind: "PROCESS_SESSIONS" | "PROCESS_REVIEW_MOMENTS" | "TRACK_METRIC";
  /** Process goals have a count; tracked metrics have a baseline and never a target. */
  count?: number;
  metricKey?: string;
  baseline?: { value: number | null; matches: number; unit: string; methodVersion: string } | null;
}

export interface PlanContent {
  version: typeof PLAN_VERSION;
  priorityVersion: typeof PRIORITY_VERSION;
  exercisesVersion: typeof EXERCISES_VERSION;
  horizon: Horizon;
  availability: Availability;
  priorities: Priority[];
  sessions: PlannedSession[];
  reviewDays: number[];
  goals: PlanGoal[];
  /** Areas the player removed from the plan (kept for the history). */
  excludedByPlayer: SkillArea[];
}

export function reviewDays(horizon: Horizon): number[] {
  if (horizon === 7) return [7];
  if (horizon === 30) return [7, 14, 21, 30];
  return [30, 60, 90];
}

/** Spread n sessions over a 7-day week (deterministic offsets). */
const weekOffsets = (n: number) => Array.from({ length: n }, (_, k) => Math.floor((k * 7) / n));

export function buildPlan(
  result: PriorityResult,
  horizon: Horizon,
  availability: Availability,
  options: { excludeAreas?: SkillArea[] } = {},
): PlanContent | null {
  const excludeAreas = options.excludeAreas ?? [];
  const chosen = result.priorities
    .filter((p) => !excludeAreas.includes(p.area))
    .slice(0, PRIORITIES_BY_HORIZON[horizon]);
  if (result.state !== "READY" || !chosen.length) return null;
  const perWeek = Math.min(
    AVAILABILITY_LIMITS.maxSessions,
    Math.max(AVAILABILITY_LIMITS.minSessions, Math.round(availability.sessionsPerWeek)),
  );
  const minutes = Math.min(
    AVAILABILITY_LIMITS.maxMinutes,
    Math.max(AVAILABILITY_LIMITS.minMinutes, Math.round(availability.minutesPerSession)),
  );
  const weeks = Math.ceil(horizon / 7);
  const sessions: PlannedSession[] = [];
  const pools = chosen.map((p) => exercisesFor(p.area));
  const cursor = chosen.map(() => 0);
  let index = 0;
  for (let week = 0; week < weeks; week++) {
    // 90 days: phase 1 (weeks 1–4) only the top priority, then all chosen priorities.
    const active = horizon === 90 && week < 4 ? [0] : chosen.map((_, i) => i);
    for (const [k, offset] of weekOffsets(perWeek).entries()) {
      const day = week * 7 + offset;
      if (day >= horizon) break;
      const pi = active[k % active.length]!;
      const pool = pools[pi]!;
      const ex = pool[cursor[pi]! % pool.length] as Exercise;
      cursor[pi]! += 1;
      sessions.push({
        index: index++,
        day,
        week: week + 1,
        area: chosen[pi]!.area,
        exerciseId: ex.id,
        minutes: Math.min(minutes, ex.minutes * 2),
      });
    }
  }
  const goals: PlanGoal[] = [
    { kind: "PROCESS_SESSIONS", count: Math.ceil(sessions.length * 0.8) },
    { kind: "PROCESS_REVIEW_MOMENTS", count: horizon === 7 ? 3 : horizon === 30 ? 8 : 20 },
    ...chosen.flatMap((p) =>
      p.evidence
        .filter((e) => e.kind === "TREND")
        .slice(0, 1)
        .map((e) => ({
          kind: "TRACK_METRIC" as const,
          metricKey: e.metricKey,
          baseline: {
            value: e.value,
            matches: e.matches,
            unit: e.unit,
            methodVersion: e.methodVersion,
          },
        })),
    ),
  ];
  return {
    version: PLAN_VERSION,
    priorityVersion: PRIORITY_VERSION,
    exercisesVersion: EXERCISES_VERSION,
    horizon,
    availability: { sessionsPerWeek: perWeek, minutesPerSession: minutes },
    priorities: chosen,
    sessions,
    reviewDays: reviewDays(horizon),
    goals,
    excludedByPlayer: excludeAreas,
  };
}

// ------------------------------------------------------------------ adherence and adaptation

export interface SessionState {
  status: "PLANNED" | "DONE" | "SKIPPED";
  day: number;
}

/** Adherence over sessions already due: DONE / (DONE + SKIPPED + overdue PLANNED). */
export function adherence(
  sessions: SessionState[],
  today: number,
): { done: number; due: number; rate: number | null } {
  const due = sessions.filter((s) => s.status !== "PLANNED" || s.day < today);
  const done = due.filter((s) => s.status === "DONE").length;
  return { done, due: due.length, rate: due.length ? done / due.length : null };
}

export interface PlanDiff {
  changed: boolean;
  added: SkillArea[];
  removed: SkillArea[];
  reordered: boolean;
  evidenceChanged: Array<{
    area: SkillArea;
    metricKey: string;
    from: number | null;
    to: number | null;
  }>;
}

/** What a revision would change: shown to the player before anything is replaced. */
export function diffPlans(current: PlanContent, proposal: PlanContent): PlanDiff {
  const a = current.priorities.map((p) => p.area);
  const b = proposal.priorities.map((p) => p.area);
  const added = b.filter((x) => !a.includes(x));
  const removed = a.filter((x) => !b.includes(x));
  const common = a.filter((x) => b.includes(x));
  const reordered = common.join() !== b.filter((x) => a.includes(x)).join();
  const evidenceChanged: PlanDiff["evidenceChanged"] = [];
  for (const p of proposal.priorities) {
    const old = current.priorities.find((q) => q.area === p.area);
    if (!old) continue;
    for (const e of p.evidence) {
      const o = old.evidence.find((x) => x.metricKey === e.metricKey);
      if (o && o.value !== e.value)
        evidenceChanged.push({ area: p.area, metricKey: e.metricKey, from: o.value, to: e.value });
    }
  }
  return {
    changed: added.length > 0 || removed.length > 0 || reordered || evidenceChanged.length > 0,
    added,
    removed,
    reordered,
    evidenceChanged,
  };
}
