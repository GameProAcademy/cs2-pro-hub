/**
 * PM5 — monthly review (`cs2.monthly-review.v1`): STRUCTURE ONLY. Pure.
 *
 * Builds a draft of one calendar month (UTC) from the player's own data: matches of the month,
 * the evolution metrics of the month with a comparison to the previous month only when both
 * months have ≥ 3 matches measuring the metric with the same method, training sessions the
 * player marked, and moments saved. Nothing is sent: `delivery` is always NOT_SENT, and
 * `canDeliver` refuses without an explicit, scoped, unrevoked consent — there is no consent
 * store in this release, so no review can be delivered by anyone.
 */
import { METRICS, aggregate, type EvolutionMetricKey, type Unit } from "@/lib/evolution/evolution";
import type { OverviewMatch } from "@/lib/playerOverview";

export const MONTHLY_REVIEW_VERSION = "cs2.monthly-review.v1";
export const REVIEW_MIN_MATCHES = 3;

export type ReviewMonth = `${number}-${number}`;
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export interface ReviewMetric {
  key: EvolutionMetricKey;
  unit: Unit;
  value: number | null;
  matches: number;
  comparison:
    | { status: "OK"; previous: number; delta: number; previousMatches: number }
    | { status: "INSUFFICIENT_SAMPLE" | "INCOMPATIBLE_METHODS" | "NO_PREVIOUS_MONTH" };
}

export interface MonthlyReview {
  version: typeof MONTHLY_REVIEW_VERSION;
  month: string;
  state: "READY" | "INSUFFICIENT_SAMPLE" | "NO_MATCHES";
  matches: number;
  /** "processed" when any match of the month only has a processing date. */
  dateBasis: "played" | "processed";
  metrics: ReviewMetric[];
  training: { done: number; skipped: number; due: number } | null;
  momentsSaved: number;
  delivery: { status: "NOT_SENT"; reason: "NO_CONSENT" };
}

export interface ReviewConsent {
  granted: boolean;
  scopes: string[];
  revokedAt: string | null;
}

/** Delivery needs an explicit, scoped, unrevoked consent. None exists yet. */
export function canDeliver(consent: ReviewConsent | null): boolean {
  return (
    !!consent &&
    consent.granted &&
    consent.revokedAt === null &&
    consent.scopes.includes("monthly_review")
  );
}

const inMonth = (iso: string, month: string) => iso.slice(0, 7) === month;

export function buildMonthlyReview(input: {
  month: string;
  matches: OverviewMatch[];
  sessions: Array<{
    status: "PLANNED" | "DONE" | "SKIPPED" | "SUPERSEDED";
    scheduledOn: string;
  }> | null;
  momentsCreatedAt: string[];
  today: string;
}): MonthlyReview {
  const { month } = input;
  const prev = previousMonth(month);
  const current = input.matches.filter((m) => inMonth(m.playedAt, month));
  const previous = input.matches.filter((m) => inMonth(m.playedAt, prev));
  const state =
    current.length === 0
      ? "NO_MATCHES"
      : current.length < REVIEW_MIN_MATCHES
        ? "INSUFFICIENT_SAMPLE"
        : "READY";
  const metrics: ReviewMetric[] =
    state === "NO_MATCHES"
      ? []
      : METRICS.map((def) => {
          const a = aggregate(current, def.key);
          const b = aggregate(previous, def.key);
          let comparison: ReviewMetric["comparison"];
          if (!previous.length) comparison = { status: "NO_PREVIOUS_MONTH" };
          else if (
            a.status === "INCOMPATIBLE_METHODS" ||
            b.status === "INCOMPATIBLE_METHODS" ||
            (a.methods.length && b.methods.length && a.methods.join() !== b.methods.join())
          )
            comparison = { status: "INCOMPATIBLE_METHODS" };
          else if (
            a.status !== "OK" ||
            b.status !== "OK" ||
            a.matches < REVIEW_MIN_MATCHES ||
            b.matches < REVIEW_MIN_MATCHES
          )
            comparison = { status: "INSUFFICIENT_SAMPLE" };
          else
            comparison = {
              status: "OK",
              previous: b.value!,
              delta: a.value! - b.value!,
              previousMatches: b.matches,
            };
          return {
            key: def.key,
            unit: def.unit,
            value: a.status === "OK" ? a.value : null,
            matches: a.matches,
            comparison,
          };
        });
  const sessions = input.sessions?.filter(
    (s) => s.status !== "SUPERSEDED" && inMonth(s.scheduledOn, month),
  );
  return {
    version: MONTHLY_REVIEW_VERSION,
    month,
    state,
    matches: current.length,
    dateBasis: current.some((m) => m.dateSource !== "played") ? "processed" : "played",
    metrics,
    training: sessions
      ? {
          done: sessions.filter((s) => s.status === "DONE").length,
          skipped: sessions.filter((s) => s.status === "SKIPPED").length,
          due: sessions.filter((s) => s.status !== "PLANNED" || s.scheduledOn < input.today).length,
        }
      : null,
    momentsSaved: input.momentsCreatedAt.filter((d) => inMonth(d, month)).length,
    delivery: { status: "NOT_SENT", reason: "NO_CONSENT" },
  };
}
