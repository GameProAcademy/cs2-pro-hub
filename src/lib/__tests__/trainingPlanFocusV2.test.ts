import { describe, expect, it } from "vitest";
import { buildTrainingPlan, planTopics } from "@/lib/training/trainingPlan";

const base = {
  locale: "pt-BR" as const,
  dataState: "READY" as const,
  dimensions: [
    { dimension: "utility", index: 27 },
    { dimension: "teamplay", index: 28 },
    { dimension: "dueling", index: 35 },
  ],
  goals: [] as string[],
  maps: [],
  candidates: [],
};

describe("UX-1.7d catalogue plan follows the single Training list (R-13)", () => {
  it("empty Training list → no DNA week, even with DNA indices below 60", () => {
    const plan = buildTrainingPlan({ ...base, focus: [] });
    expect(plan.state).toBe("NO_PRIORITY");
    expect(plan.priorities).toEqual([]);
    expect(planTopics({ ...base, focus: [] })).toEqual([]);
  });
  it("the Training list order decides the weeks; DNA index shown when known", () => {
    const plan = buildTrainingPlan({ ...base, focus: ["dueling", "dueling", "clutch"] });
    expect(plan.priorities).toEqual([
      { dimension: "dueling", index: 35 },
      { dimension: "clutch", index: null },
    ]);
    expect(plan.weeks.slice(0, 2).map((w) => w.focus)).toEqual(["dueling", "clutch"]);
  });
  it("declared goals still add needs with an empty Training list", () => {
    expect(planTopics({ ...base, focus: [], goals: ["PRO_CAREER"] }).length).toBeGreaterThan(0);
  });
  it("legacy callers without focus keep the old rule", () => {
    expect(buildTrainingPlan(base).priorities.map((p) => p.dimension)).toEqual([
      "utility",
      "teamplay",
      "dueling",
    ]);
  });
});

describe("UX-1.7e: the no-priority text matches the single-list rule", () => {
  it("no locale claims the DNA has no dimension below 60", async () => {
    for (const l of ["pt-BR", "pt-PT", "en", "es", "fr"]) {
      const { readFileSync } = await import("node:fs");
      const src = readFileSync(`src/i18n/locales/catalog/${l}.ts`, "utf8");
      const line = src.slice(
        src.indexOf('"training.real.noPriority"'),
        src.indexOf('"training.real.provisional"'),
      );
      expect(line, l).not.toMatch(/60 \/ 100/);
    }
  });
});
