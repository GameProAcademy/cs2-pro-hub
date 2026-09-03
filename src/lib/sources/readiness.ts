/**
 * Analysis Readiness — the honest gate between "we have data" and "we can
 * produce a diagnosis".
 *
 * The product must never present an analysis as complete when the underlying
 * sample is insufficient. Readiness is computed from coverage plus sample size,
 * and it degrades gracefully instead of inventing values.
 */
import { MIN_VALID_ROUNDS } from "@/config/pipeline";

import { coverageRatio, type DataCoverage } from "./capabilities";
import type { DataSource } from "./sources";

export type ReadinessLevel = "none" | "partial" | "ready";

export interface AnalysisReadiness {
  level: ReadinessLevel;
  /** 0-100 coverage of the known data signals. */
  coverage: number;
  /** Rounds actually available for this player. */
  rounds: number;
  /** Sources that contributed to the sample. */
  sources: DataSource[];
  /** Machine-readable reasons for degradation; the UI localises them. */
  limitations: ReadinessLimitation[];
}

export type ReadinessLimitation =
  | "no_data"
  | "low_rounds"
  | "low_coverage"
  | "no_utility_data"
  | "no_economy_data"
  | "no_positioning_data";

export interface ReadinessInput {
  rounds: number;
  coverage: DataCoverage;
  sources: DataSource[];
}

export function computeReadiness({ rounds, coverage, sources }: ReadinessInput): AnalysisReadiness {
  const ratio = coverageRatio(coverage);
  const limitations: ReadinessLimitation[] = [];

  if (rounds <= 0 || sources.length === 0) {
    return { level: "none", coverage: ratio, rounds, sources, limitations: ["no_data"] };
  }

  if (rounds < MIN_VALID_ROUNDS) limitations.push("low_rounds");
  if (ratio < 60) limitations.push("low_coverage");
  if (coverage.utility === "unavailable") limitations.push("no_utility_data");
  if (coverage.economy === "unavailable") limitations.push("no_economy_data");
  if (coverage.positioning === "unavailable") limitations.push("no_positioning_data");

  const blocking = limitations.includes("low_rounds") || limitations.includes("low_coverage");
  return {
    level: blocking ? "partial" : limitations.length > 0 ? "partial" : "ready",
    coverage: ratio,
    rounds,
    sources,
    limitations,
  };
}
