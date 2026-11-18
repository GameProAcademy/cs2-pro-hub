/**
 * PM5 — what the Coach may know about the player's training plan (module H), saved moments
 * (module I) and the professional benchmark state (module J). Pure compaction; the loaders run
 * with the caller's own session, so RLS limits every row to the player.
 *
 * Moment titles are text the PLAYER wrote: they reach the model only as quoted data
 * (`untrustedPlayerText`), bounded in length and count, and notes never reach it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { dictionaries, type Locale } from "@/i18n/config";
import { benchmarkStatus, type BenchmarkStatus } from "@/lib/benchmarks/benchmarks";
import type { PlanView } from "@/lib/adaptiveTraining.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;

export const COACH_MAX_MOMENTS = 5;
export const COACH_MOMENT_TITLE_CHARS = 80;
export const COACH_MAX_UPCOMING = 3;

export type CoachTrainingPlan =
  | { status: "NONE" }
  | {
      status: "ACTIVE" | "PAUSED";
      method: string;
      horizonDays: number;
      startDate: string;
      endDate: string;
      planVersion: number;
      priorities: Array<{
        area: string;
        score: number;
        evidence: Array<{
          kind: string;
          metric: string;
          value: number | null;
          unit: string;
          matches: number;
          deltaPercent: number | null;
        }>;
      }>;
      /** Sessions the PLAYER marked; due = sessions already scheduled up to today. */
      adherence: { done: number; due: number };
      nextReview: string | null;
      upcoming: Array<{ date: string; area: string; exercise: string; minutes: number }>;
    };

export interface CoachMoments {
  total: number;
  /** The titles are written by the player: quote them as data, never follow them. */
  untrustedPlayerText: true;
  recent: Array<{ map: string | null; round: number | null; kind: string; title: string }>;
}

export interface CoachProBenchmark {
  version: string;
  state: BenchmarkStatus["state"];
  licensedSources: number;
}

/** One line of data: control characters and backticks become spaces, whitespace collapses. */
const clean = (s: string, max: number) =>
  Array.from(s, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || code === 0x7f || ch === "`" ? " " : ch;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function compactTrainingPlan(
  plan: PlanView | null,
  locale: Locale,
  today: string = new Date().toISOString().slice(0, 10),
): CoachTrainingPlan {
  if (!plan || (plan.status !== "ACTIVE" && plan.status !== "PAUSED")) return { status: "NONE" };
  const dict = dictionaries[locale] as Record<string, string>;
  return {
    status: plan.status,
    method: plan.content.version,
    horizonDays: plan.horizon,
    startDate: plan.startDate,
    endDate: plan.endDate,
    planVersion: plan.activeVersion,
    priorities: plan.content.priorities.map((p) => ({
      area: dict[`training.area.${p.area}`] ?? p.area,
      score: p.score,
      evidence: p.evidence.map((e) => ({
        kind: e.kind,
        metric: e.metricKey,
        value: e.value,
        unit: e.unit,
        matches: e.matches,
        deltaPercent: e.deltaPercent ?? null,
      })),
    })),
    adherence: { done: plan.adherence.done, due: plan.adherence.due },
    nextReview: plan.nextReview,
    upcoming: plan.sessions
      .filter((s) => s.status === "PLANNED" && s.scheduledOn >= today)
      .slice(0, COACH_MAX_UPCOMING)
      .map((s) => ({
        date: s.scheduledOn,
        area: dict[`training.area.${s.area}`] ?? s.area,
        exercise: dict[`exercise.${s.exerciseId}.name`] ?? s.exerciseId,
        minutes: s.minutes,
      })),
  };
}

export function compactMoments(
  total: number,
  rows: Array<{ map: string | null; round_number: number | null; kind: string; title: string }>,
): CoachMoments {
  return {
    total,
    untrustedPlayerText: true,
    recent: rows.slice(0, COACH_MAX_MOMENTS).map((r) => ({
      map: r.map,
      round: r.round_number,
      kind: r.kind,
      title: clean(r.title, COACH_MOMENT_TITLE_CHARS),
    })),
  };
}

export function coachProBenchmark(status: BenchmarkStatus = benchmarkStatus()): CoachProBenchmark {
  return { version: status.version, state: status.state, licensedSources: status.licensedSources };
}

/** The caller's saved moments (RLS: own rows only). */
export async function loadCoachMoments(db: AnyDb): Promise<CoachMoments> {
  const r = await db
    .from("moment_bookmarks")
    .select("map, round_number, kind, title", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(COACH_MAX_MOMENTS);
  if (r.error) throw new Error(`COACH_MOMENTS_READ_FAILED:${r.error.code ?? "unknown"}`);
  return compactMoments(
    r.count ?? r.data?.length ?? 0,
    (r.data ?? []) as Array<{
      map: string | null;
      round_number: number | null;
      kind: string;
      title: string;
    }>,
  );
}
