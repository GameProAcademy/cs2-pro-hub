/**
 * Personal training plan (pure). Inputs are the player's own evidence and a bounded set of
 * catalog candidates; output is codes and catalog items only (the UI renders the words).
 *
 * Priorities: the dimensions of the single Training list (`cs2.training-priority.v2`, in its
 * order, at most three) when `focus` is given (UX-1.7d, R-13); otherwise (legacy callers) the
 * weakest OBSERVED Player DNA dimensions below 60 / 100 (a null dimension is never a weakness). Each priority gets an in-game practice activity and,
 * when the catalog has one in the player's language, a lesson. Declared goals add needs.
 * Strategic Knowledge / Extra Skills items are added only when a need points to them (e.g.
 * teamplay → communication, consistency → productive routine, PRO_CAREER → career skills).
 * Nothing is added to fill the plan: no evidence → no item.
 */
import { isRecommendable, type CatalogLocale, type CatalogTrack } from "../catalog/catalogCore.ts";
import {
  DIMENSION_TOPICS,
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
  /**
   * UX-1.7d: the dimensions of the single Training list, in its order. When present it alone
   * decides the DNA priorities (an empty list → no DNA week), so the catalogue plan never
   * focuses on something the Training list does not recommend.
   */
  focus?: string[];
  candidates: CatalogCandidate[];
}

/**
 * VGL 5.1 (Frente 9): the weekly cards recommend LESSONS of the CS2 In-Game track (as before
 * VGL 5.0); whole COURSES appear only in "Trilhas complementares", from the two complementary
 * categories of the real catalog: Conhecimentos Estratégicos and Habilidades Extras.
 */
export const COMPLEMENTARY_MIN = 3;
export const COMPLEMENTARY_MAX = 4;

/**
 * Fill order after relevance (stable, deterministic): mindset and routine first, then the
 * creator / career skills most useful to a competitive player. Keys are catalog group keys.
 */
export const COMPLEMENTARY_ORDER: readonly string[] = [
  "champion_mindset",
  "mental_drives",
  "success_fundamentals",
  "productive_routine",
  "personal_development",
  "stretching_mobility",
  "youtube",
  "video_editing",
  "branding",
  "capcut",
  "tiktok",
  "chatgpt",
  "midjourney",
  "wordpress",
  "google_ads",
  "facebook_ads",
  "pinterest",
  "communication",
];

/**
 * DNA topics that name an IN-GAME skill only. "communication" on teamplay means calls and comms
 * in a match; in the complementary categories the same tag belongs to a public-speaking course,
 * so a DNA need never selects that course (the "Oratória e Comunicação" defect).
 */
const IN_GAME_ONLY_TOPICS = new Set(["communication"]);

export interface PlanPriority {
  dimension: string;
  /** DNA index of the dimension; null when the DNA has none (focus from the Training list). */
  index: number | null;
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
  const needs = input.focus
    ? [
        ...focusDimensions(input.focus).flatMap((dimension, rank) =>
          (DIMENSION_TOPICS[dimension] ?? []).map((topic) => ({
            topic,
            weight: 3 - rank,
            source: "dna" as const,
            detail: dimension,
          })),
        ),
        ...needsFromPlayer({ dimensions: [], goals: input.goals, ceiling: PLAN_CEILING }),
      ]
    : needsFromPlayer({
        dimensions: input.dimensions,
        goals: input.goals,
        ceiling: PLAN_CEILING,
      });
  if (needs.some((n) => n.topic === "positioning"))
    for (const map of new Set(input.maps))
      needs.push({ topic: `map:${map}`, weight: 1, source: "map", detail: map });
  return needs;
}

/** Distinct dimensions in list order, at most three. */
function focusDimensions(focus: string[]): string[] {
  return [...new Set(focus)].slice(0, 3);
}

export function buildTrainingPlan(input: TrainingPlanInput): TrainingPlanModel {
  const base = { goals: input.goals, provisional: input.dataState === "INSUFFICIENT_SAMPLE" };
  if (input.dataState === "NO_MATCHES")
    return { ...base, state: "NO_DATA", priorities: [], weeks: [], complementary: [] };

  const priorities: PlanPriority[] = input.focus
    ? focusDimensions(input.focus).map((dimension) => ({
        dimension,
        index: input.dimensions.find((d) => d.dimension === dimension)?.index ?? null,
      }))
    : input.dimensions
        .filter(
          (d): d is { dimension: string; index: number } =>
            d.index !== null && d.index < PLAN_CEILING,
        )
        .sort((a, b) => a.index - b.index)
        .slice(0, 3);
  const needs = planNeeds(input);
  if (!needs.length)
    return { ...base, state: "NO_PRIORITY", priorities: [], weeks: [], complementary: [] };

  const lessons = input.candidates.filter((c) => c.kind === "lesson");
  const inGame = pickRecommendations(lessons, needs, input.locale, {
    max: 6,
    tracks: IN_GAME,
    perGroup: 3,
  });
  const complementary = pickComplementaryCourses(input.candidates, needs, input.locale);

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

/**
 * "Trilhas complementares": whole courses only, from Conhecimentos Estratégicos AND Habilidades
 * Extras (at least one of each when the language has them), COMPLEMENTARY_MIN..MAX distinct
 * courses, in the player's language only (never a course of another language shown as if it
 * were translated). Relevance to the player's needs first, then COMPLEMENTARY_ORDER.
 */
export function pickComplementaryCourses(
  candidates: ReadonlyArray<CatalogCandidate>,
  needs: ReadonlyArray<Need>,
  locale: CatalogLocale,
): Recommendation[] {
  const usable = needs.filter((n) => !(n.source === "dna" && IN_GAME_ONLY_TOPICS.has(n.topic)));
  const order = (key: string) => {
    const i = COMPLEMENTARY_ORDER.indexOf(key);
    return i === -1 ? COMPLEMENTARY_ORDER.length : i;
  };
  const seen = new Set<string>();
  const scored = candidates
    .filter(
      (c) =>
        c.kind === "course" &&
        COMPLEMENTARY.includes(c.track) &&
        isRecommendable(c, locale) &&
        c.locale === locale,
    )
    .filter((c) => {
      if (seen.has(c.group_key) || seen.has(c.url)) return false;
      seen.add(c.group_key);
      seen.add(c.url);
      return true;
    })
    .map((c) => {
      let need: Need | null = null;
      let score = 0;
      for (const n of usable)
        if (c.topics.includes(n.topic)) {
          score += n.weight;
          if (!need || n.weight > need.weight) need = n;
        }
      return { c, score, need };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        order(a.c.group_key) - order(b.c.group_key) ||
        a.c.title.localeCompare(b.c.title),
    );
  const out: typeof scored = [];
  // One of each category first (the owner asks for both), then the rest by the same ranking.
  for (const track of COMPLEMENTARY) {
    const best = scored.find((x) => x.c.track === track);
    if (best) out.push(best);
  }
  for (const x of scored) {
    if (out.length >= COMPLEMENTARY_MAX) break;
    if (!out.includes(x)) out.push(x);
  }
  return out
    .sort((a, b) => b.score - a.score || order(a.c.group_key) - order(b.c.group_key))
    .map(({ c, need }) => ({
      id: c.id,
      kind: c.kind,
      title: c.title,
      url: c.url,
      track: c.track,
      need: need ?? {
        topic: c.topics[0] ?? c.track,
        weight: 0,
        source: "catalog",
        detail: c.track,
      },
    }));
}
