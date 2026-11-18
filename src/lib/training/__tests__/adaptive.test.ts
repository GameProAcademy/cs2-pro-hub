import { describe, expect, it } from "vitest";

import type { EvolutionReport } from "@/lib/evolution/evolution";
import { adaptivePtBR } from "@/i18n/locales/adaptive/pt-BR";
import { adaptiveEn } from "@/i18n/locales/adaptive/en";
import { adaptiveEs } from "@/i18n/locales/adaptive/es";
import { adaptiveFr } from "@/i18n/locales/adaptive/fr";
import { adaptivePtPT } from "@/i18n/locales/adaptive/pt-PT";
import { ptBR } from "@/i18n/locales/pt-BR";
import {
  AREA_METRICS,
  MIN_MATCHES,
  PLAN_VERSION,
  PRIORITY_VERSION,
  adherence,
  buildPlan,
  computePriorities,
  diffPlans,
  reviewDays,
  type DnaInput,
} from "@/lib/training/adaptive";
import { EXERCISES, exerciseById, exercisesFor, type SkillArea } from "@/lib/training/exercises";

const AREAS: SkillArea[] = [
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

const dna = (values: Partial<Record<SkillArea, number | null>>, matches = 10): DnaInput => ({
  state: "READY",
  matches,
  dimensions: Object.entries(values).map(([dimension, value]) => ({
    dimension,
    value: value ?? null,
  })),
});

function evo(
  metrics: Array<{
    key: string;
    value: number;
    matches?: number;
    deltaPercent?: number | null;
    higherIsBetter?: boolean;
    comparable?: boolean;
  }>,
  n = 10,
): EvolutionReport {
  return {
    version: "cs2.evolution.v1",
    window: { requested: 10, n, status: "COMPLETE" },
    metrics: metrics.map((m) => ({
      key: m.key,
      definition: { higherIsBetter: m.higherIsBetter ?? true, unit: "PERCENT" },
      window: { status: "OK", value: m.value, matches: m.matches ?? n, windowMatches: n },
      comparison:
        m.comparable === false || m.deltaPercent === undefined
          ? { status: "INSUFFICIENT_SAMPLE" }
          : {
              status: "OK",
              delta: m.deltaPercent,
              deltaPercent: m.deltaPercent,
              previous: { value: m.value - (m.deltaPercent ?? 0) },
            },
    })),
  } as unknown as EvolutionReport;
}

describe("computePriorities (cs2.training-priority.v1)", () => {
  it("returns NO_EVIDENCE with no matches and INSUFFICIENT_SAMPLE below the minimum", () => {
    expect(
      computePriorities({ state: "NO_DATA", matches: 0, dimensions: [] }, null, []).state,
    ).toBe("NO_EVIDENCE");
    const low = computePriorities(dna({ aim: 0.2 }, MIN_MATCHES - 1), null, []);
    expect(low.state).toBe("INSUFFICIENT_SAMPLE");
    expect(low.priorities).toEqual([]);
  });

  it("never treats a missing dimension as a weakness", () => {
    const r = computePriorities(dna({ aim: null, utility: 0.3 }), null, []);
    expect(r.priorities.map((p) => p.area)).toEqual(["utility"]);
    expect(r.excluded).toContainEqual({ area: "aim", reason: "NOT_MEASURED" });
    expect(r.excluded).toContainEqual({ area: "clutch", reason: "NOT_MEASURED" });
  });

  it("excludes measured areas without a signal and keeps evidence for the others", () => {
    const r = computePriorities(dna({ aim: 0.8, utility: 0.3 }), null, []);
    expect(r.excluded).toContainEqual({ area: "aim", reason: "NO_SIGNAL" });
    const u = r.priorities[0]!;
    expect(u.area).toBe("utility");
    expect(u.evidence[0]).toMatchObject({ kind: "DNA", metricKey: "dna.utility", value: 30 });
    // gap = (0.6 − 0.3) / 0.6 = 0.5, conf 1 → score = 0.6 × 0.5 = 0.3
    expect(u.parts).toEqual({ gap: 0.5, trend: 0, confidence: 1, goal: 0 });
    expect(u.score).toBe(0.3);
    expect(r.version).toBe(PRIORITY_VERSION);
  });

  it("uses a worsening trend only from a valid comparison and in the metric's direction", () => {
    const worse = computePriorities(
      dna({}, 0),
      evo([{ key: "deathsPerRound", value: 0.8, deltaPercent: 10, higherIsBetter: false }]),
      [],
    );
    expect(worse.priorities.map((p) => p.area)).toEqual(["positioning", "survivability"]);
    expect(worse.priorities[0]!.parts.trend).toBe(0.5);
    const better = computePriorities(
      dna({}, 0),
      evo([{ key: "deathsPerRound", value: 0.6, deltaPercent: -10, higherIsBetter: false }]),
      [],
    );
    expect(better.state).toBe("NO_EVIDENCE");
    const noComparison = computePriorities(
      dna({}, 0),
      evo([{ key: "hsPercent", value: 30, comparable: false }]),
      [],
    );
    expect(noComparison.state).toBe("NO_EVIDENCE");
    expect(noComparison.excluded).toContainEqual({ area: "aim", reason: "NO_SIGNAL" });
  });

  it("marks a low per-metric sample as LOW_SAMPLE and scales confidence by sample", () => {
    const r = computePriorities(
      dna({}, 0),
      evo(
        [
          { key: "hsPercent", value: 20, matches: 2, deltaPercent: -30 },
          { key: "clutchWinRate", value: 10, matches: 5, deltaPercent: -40 },
        ],
        10,
      ),
      [],
    );
    expect(r.excluded).toContainEqual({ area: "aim", reason: "LOW_SAMPLE" });
    const clutch = r.priorities.find((p) => p.area === "clutch")!;
    expect(clutch.parts.confidence).toBe(0.5);
  });

  it("adds the declared goal bonus and orders deterministically", () => {
    const base = dna({ aim: 0.3, utility: 0.3 });
    expect(computePriorities(base, null, []).priorities.map((p) => p.area)).toEqual([
      "aim",
      "utility",
    ]);
    const withGoal = computePriorities(base, null, ["COMPETITIVE_TEAM"]);
    expect(withGoal.priorities.map((p) => p.area)).toEqual(["utility", "aim"]);
    expect(withGoal.priorities[0]!.parts.goal).toBe(0.15);
  });
});

describe("buildPlan (cs2.training-plan.v1)", () => {
  const ready = computePriorities(
    dna({ aim: 0.2, utility: 0.3, clutch: 0.4, teamplay: 0.5 }),
    null,
    [],
  );
  const avail = { sessionsPerWeek: 3, minutesPerSession: 30 };

  it("chooses 1 / 2 / 3 priorities for 7 / 30 / 90 days", () => {
    expect(buildPlan(ready, 7, avail)!.priorities).toHaveLength(1);
    expect(buildPlan(ready, 30, avail)!.priorities).toHaveLength(2);
    expect(buildPlan(ready, 90, avail)!.priorities).toHaveLength(3);
  });

  it("builds sessions inside the horizon, from the availability, with existing exercises", () => {
    for (const h of [7, 30, 90] as const) {
      const plan = buildPlan(ready, h, avail)!;
      expect(plan.version).toBe(PLAN_VERSION);
      expect(plan.reviewDays).toEqual(reviewDays(h));
      expect(plan.sessions.every((s) => s.day >= 0 && s.day < h)).toBe(true);
      expect(plan.sessions.every((s) => s.minutes <= 30 && s.minutes >= 5)).toBe(true);
      for (const s of plan.sessions) {
        const ex = exerciseById(s.exerciseId)!;
        expect(ex.available).toBe(true);
        expect(ex.areas).toContain(s.area);
      }
      const perWeek = new Map<number, number>();
      for (const s of plan.sessions) perWeek.set(s.week, (perWeek.get(s.week) ?? 0) + 1);
      expect(Math.max(...perWeek.values())).toBeLessThanOrEqual(3);
    }
    expect(buildPlan(ready, 7, avail)!.sessions).toHaveLength(3);
  });

  it("keeps only the top priority in the first 4 weeks of a 90-day plan", () => {
    const plan = buildPlan(ready, 90, avail)!;
    const top = plan.priorities[0]!.area;
    expect(plan.sessions.filter((s) => s.week <= 4).every((s) => s.area === top)).toBe(true);
    expect(new Set(plan.sessions.filter((s) => s.week > 4).map((s) => s.area)).size).toBe(3);
  });

  it("clamps availability and honours areas the player removed", () => {
    const plan = buildPlan(
      ready,
      7,
      { sessionsPerWeek: 50, minutesPerSession: 1 },
      {
        excludeAreas: ["aim"],
      },
    )!;
    expect(plan.availability).toEqual({ sessionsPerWeek: 6, minutesPerSession: 10 });
    expect(plan.priorities.map((p) => p.area)).toEqual(["utility"]);
    expect(plan.excludedByPlayer).toEqual(["aim"]);
  });

  it("returns null without evidence and never invents a metric target", () => {
    expect(buildPlan(computePriorities(dna({ aim: 0.9 }), null, []), 7, avail)).toBeNull();
    const t = computePriorities(
      dna({}, 0),
      evo([{ key: "hsPercent", value: 31.5, deltaPercent: -12 }]),
      [],
    );
    const plan = buildPlan(t, 30, avail)!;
    const tracked = plan.goals.find((g) => g.kind === "TRACK_METRIC")!;
    expect(tracked).toMatchObject({
      metricKey: "hsPercent",
      baseline: { value: 31.5, matches: 10 },
    });
    expect(tracked).not.toHaveProperty("target");
    expect(plan.goals.find((g) => g.kind === "PROCESS_SESSIONS")!.count).toBe(
      Math.ceil(plan.sessions.length * 0.8),
    );
  });
});

describe("adherence and diff", () => {
  it("counts only sessions already due; nothing is DONE without an explicit mark", () => {
    expect(adherence([{ status: "PLANNED", day: 5 }], 2)).toEqual({ done: 0, due: 0, rate: null });
    expect(
      adherence(
        [
          { status: "DONE", day: 0 },
          { status: "SKIPPED", day: 2 },
          { status: "PLANNED", day: 3 },
          { status: "PLANNED", day: 9 },
        ],
        5,
      ),
    ).toEqual({ done: 1, due: 3, rate: 1 / 3 });
  });

  it("describes added / removed / reordered areas and evidence changes", () => {
    const a = buildPlan(computePriorities(dna({ aim: 0.2, utility: 0.3 }), null, []), 30, {
      sessionsPerWeek: 3,
      minutesPerSession: 30,
    })!;
    expect(diffPlans(a, a).changed).toBe(false);
    const b = buildPlan(computePriorities(dna({ aim: 0.25, clutch: 0.1 }), null, []), 30, {
      sessionsPerWeek: 3,
      minutesPerSession: 30,
    })!;
    const d = diffPlans(a, b);
    expect(d).toMatchObject({
      changed: true,
      added: ["clutch"],
      removed: ["utility"],
      reordered: false,
    });
    expect(d.evidenceChanged).toEqual([{ area: "aim", metricKey: "dna.aim", from: 20, to: 25 }]);
  });
});

describe("exercise catalog and translations", () => {
  const locales = [adaptivePtBR, adaptivePtPT, adaptiveEn, adaptiveEs, adaptiveFr] as Array<
    Record<string, string>
  >;
  const has = (k: string) => locales.every((l) => typeof l[k] === "string" && l[k]!.length > 0);

  it("covers every area that has a metric or DNA with at least one available exercise", () => {
    for (const area of AREAS) expect(exercisesFor(area).length).toBeGreaterThan(0);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
  });

  it("has every exercise text (name, goal, each step, criteria) in all five languages", () => {
    for (const ex of EXERCISES) {
      for (const f of ["name", "goal", "criteria"])
        expect(has(`exercise.${ex.id}.${f}`)).toBe(true);
      for (let i = 1; i <= ex.steps; i++) expect(has(`exercise.${ex.id}.step${i}`)).toBe(true);
      expect(has(`exercise.${ex.id}.step${ex.steps + 1}`)).toBe(false);
      expect(has(`training.track.${ex.tracks}`)).toBe(true);
    }
  });

  it("has labels for every area, metric, state and dynamic family", () => {
    const root = ptBR as Record<string, string>;
    for (const area of AREAS) {
      expect(has(`training.area.${area}`)).toBe(true);
      for (const m of AREA_METRICS[area]) expect(root[`evolution.metric.${m}`]).toBeTruthy();
    }
    for (const k of ["NOT_MEASURED", "NO_SIGNAL", "NO_EXERCISE", "LOW_SAMPLE"])
      expect(has(`training.adaptive.exclusion.${k}`)).toBe(true);
    for (const k of [
      "OPEN_PLAN_EXISTS",
      "NO_EVIDENCE",
      "INSUFFICIENT_SAMPLE",
      "NOT_FOUND",
      "STALE",
      "CLOSED",
    ])
      expect(has(`training.adaptive.result.${k}`)).toBe(true);
    for (const k of ["PLANNED", "DONE", "SKIPPED", "SUPERSEDED"])
      expect(has(`training.adaptive.session.${k}`)).toBe(true);
    for (const k of ["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"])
      expect(has(`training.adaptive.status.${k}`)).toBe(true);
    // the root locale wires the namespace
    expect(root["training.adaptive.noPromise"]).toBe(adaptivePtBR["training.adaptive.noPromise"]);
  });
});
