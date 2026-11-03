/**
 * Personal training plan (pure). Inputs are the player's own evidence and a bounded set of
 * catalog candidates; output is codes and catalog items only (the UI renders the words).
 *
 * Priorities: the weakest OBSERVED Player DNA dimensions below 60 / 100 (at most three; a
 * null dimension is never a weakness). Each priority gets an in-game practice activity and,
 * when the catalog has one in the player's language, a lesson. Declared goals add needs.
 * Strategic Knowledge / Extra Skills items are added only when a need points to them (e.g.
 * teamplay → communication, consistency → productive routine, PRO_CAREER → career skills).
 * Nothing is added to fill the plan: no evidence → no item.
 */
import type { CatalogLocale, CatalogTrack } from "../catalog/catalogCore.ts";
import {
  needsFromPlayer,
  pickRecommendations,
  type CatalogCandidate,
  type DimensionReading,
  type Need,
  type Recommendation,
} from "../catalog/catalogSelect.ts";

export const PLAN_CEILING = 60;
const POSITIONING_DIMENSIONS = new Set(["positioning", "dueling", "survivability"]);
export const IN_GAME: CatalogTrack[] = ["counter_strike_in_game"];
export const COMPLEMENTARY: CatalogTrack[] = ["strategic_knowledge", "extra_skills"];

export interface TrainingPlanInput {
  locale: CatalogLocale;
  dataState: "NO_MATCHES" | "INSUFFICIENT_SAMPLE" | "READY";
  dimensions: DimensionReading[];
  goals: string[];
  /** Maps the player played (de_*), for map-position lessons on a positioning priority. */
  maps: string[];
  candidates: CatalogCandidate[];
}

export interface PlanPriority {
  dimension: string;
  index: number;
}

export interface PlanWeek {
  week: number;
  /** DNA dimension code, goal code, or "consolidation". */
  focus: string;
  /** In-game practice codes (`practice.<code>` in i18n), always first. */
  practice: string[];
  items: Recommendation[];
}

export interface TrainingPlanModel {
  state: "NO_DATA" | "NO_PRIORITY" | "READY";
  /** Fewer matches than the DNA minimum: priorities are provisional. */
  provisional: boolean;
  goals: string[];
  priorities: PlanPriority[];
  weeks: PlanWeek[];
  complementary: Recommendation[];
}

/** Topics a plan needs from the catalog (the database read filters on them). */
export function planTopics(input: Omit<TrainingPlanInput, "candidates">): string[] {
  return [...new Set(planNeeds(input).map((n) => n.topic))];
}

function planNeeds(input: Omit<TrainingPlanInput, "candidates">): Need[] {
  const needs = needsFromPlayer({
    dimensions: input.dimensions,
    goals: input.goals,
    ceiling: PLAN_CEILING,
  });
  if (needs.some((n) => n.topic === "positioning"))
    for (const map of new Set(input.maps))
      needs.push({ topic: `map:${map}`, weight: 1, source: "map", detail: map });
  return needs;
}

export function buildTrainingPlan(input: TrainingPlanInput): TrainingPlanModel {
  const base = { goals: input.goals, provisional: input.dataState === "INSUFFICIENT_SAMPLE" };
  if (input.dataState === "NO_MATCHES")
    return { ...base, state: "NO_DATA", priorities: [], weeks: [], complementary: [] };

  const priorities: PlanPriority[] = input.dimensions
    .filter((d): d is PlanPriority => d.index !== null && d.index < PLAN_CEILING)
    .sort((a, b) => a.index - b.index)
    .slice(0, 3);
  const needs = planNeeds(input);
  if (!needs.length)
    return { ...base, state: "NO_PRIORITY", priorities: [], weeks: [], complementary: [] };

  const inGame = pickRecommendations(input.candidates, needs, input.locale, {
    max: 6,
    tracks: IN_GAME,
    perGroup: 3,
  });
  const complementary = pickRecommendations(input.candidates, needs, input.locale, {
    max: 3,
    tracks: COMPLEMENTARY,
    onePerNeed: true,
  });

  const weeks: PlanWeek[] = [];
  const placed = new Set<string>();
  priorities.forEach((p, i) => {
    // A map-position lesson belongs to a positioning-related week only.
    const chosen = inGame
      .filter(
        (r) =>
          !placed.has(r.id) &&
          (r.need.detail === p.dimension ||
            (r.need.source === "map" && POSITIONING_DIMENSIONS.has(p.dimension))),
      )
      .slice(0, 2);
    chosen.forEach((r) => placed.add(r.id));
    weeks.push({ week: i + 1, focus: p.dimension, practice: [p.dimension], items: chosen });
  });
  const goalItems = inGame.filter((r) => !placed.has(r.id));
  for (const goal of input.goals) {
    const items = goalItems.filter((r) => !placed.has(r.id) && r.need.detail === goal).slice(0, 2);
    if (!items.length) continue;
    items.forEach((r) => placed.add(r.id));
    weeks.push({ week: weeks.length + 1, focus: goal, practice: [], items });
  }
  weeks.push({
    week: weeks.length + 1,
    focus: "consolidation",
    practice: ["demo_review"],
    items: inGame.filter((r) => !placed.has(r.id)).slice(0, 1),
  });

  return { ...base, state: "READY", priorities, weeks, complementary };
}
