/**
 * Data Capabilities and Data Coverage.
 *
 * Two different questions:
 * - CAPABILITY: "can this source, in principle, provide this signal?"
 * - COVERAGE:   "did we actually obtain this signal for this player?"
 *
 * CRITICAL RULE: missing data is NEVER zero. A source that does not report
 * utility damage yields `utility_damage = null` and `utility: "unavailable"`,
 * never `0`. Turning absence into zero produces mathematically false analyses.
 */
import type { DataSource } from "./sources";

export const DATA_SIGNALS = [
  "matches",
  "rounds",
  "kills",
  "deaths",
  "assists",
  "damage",
  "adr",
  "kast",
  "opening_duels",
  "trades",
  "clutches",
  "multi_kills",
  "utility",
  "flash_assists",
  "economy",
  "positioning",
  "movement",
] as const;

export type DataSignal = (typeof DATA_SIGNALS)[number];

/**
 * Capability of a signal for a source.
 * - `supported`: proven to be obtainable.
 * - `extraction_dependent`: obtainable only if the extraction succeeds.
 * - `unknown`: NOT validated against official documentation yet. Never assume a
 *   platform's API exposes a field just because its website shows it.
 * - `unsupported`: known not to be available.
 */
export type CapabilityLevel = "supported" | "extraction_dependent" | "unknown" | "unsupported";

export type DataCapabilities = Record<DataSignal, CapabilityLevel>;

function caps(overrides: Partial<DataCapabilities>, fallback: CapabilityLevel): DataCapabilities {
  const base = {} as DataCapabilities;
  for (const signal of DATA_SIGNALS) base[signal] = fallback;
  return { ...base, ...overrides };
}

/**
 * Demo is the only source with proven capabilities, because it is the only
 * source with an implemented pipeline. Everything else is `unknown` until its
 * adapter is validated against official documentation, permissions, endpoints,
 * rate limits and terms of use.
 */
export const SOURCE_CAPABILITIES: Record<DataSource, DataCapabilities> = {
  demo: caps(
    {
      positioning: "extraction_dependent",
      movement: "extraction_dependent",
    },
    "supported",
  ),
  faceit: caps({ matches: "unknown", kills: "unknown", deaths: "unknown" }, "unknown"),
  gamers_club: caps({}, "unknown"),
  steam: caps({}, "unknown"),
  public_profile: caps({}, "unknown"),
};

/* ------------------------------------------------------------------ *
 * Coverage                                                            *
 * ------------------------------------------------------------------ */

export type CoverageLevel = "available" | "partial" | "unavailable";

export type DataCoverage = Record<DataSignal, CoverageLevel>;

export function emptyCoverage(): DataCoverage {
  const coverage = {} as DataCoverage;
  for (const signal of DATA_SIGNALS) coverage[signal] = "unavailable";
  return coverage;
}

/** 1 / 0.5 / 0 weighting, expressed as a 0-100 ratio of the known signals. */
export function coverageRatio(coverage: DataCoverage): number {
  const values = DATA_SIGNALS.map((signal) => coverage[signal]);
  const score = values.reduce(
    (total, level) => total + (level === "available" ? 1 : level === "partial" ? 0.5 : 0),
    0,
  );
  return Math.round((score / values.length) * 100);
}

/**
 * Converts an observed-sample description into coverage.
 *
 * SEMANTICS (do not "simplify" this):
 * - `null` / `undefined` / absent  => we do NOT have the signal  -> `unavailable`
 * - `0`                            => we DO have the signal and the observed
 *                                     value is zero              -> `available`
 * - `> 0`                          => available (or `partial` when the sample is
 *                                     below the configured threshold)
 *
 * Zero is an observation, never an absence.
 */
export function coverageFromSamples(
  samples: Partial<Record<DataSignal, number | null | undefined>>,
  partialBelow: Partial<Record<DataSignal, number>> = {},
): DataCoverage {
  const coverage = emptyCoverage();
  for (const signal of DATA_SIGNALS) {
    const value = samples[signal];
    if (value === undefined || value === null || Number.isNaN(value)) continue;
    const threshold = partialBelow[signal];
    coverage[signal] = threshold !== undefined && value < threshold ? "partial" : "available";
  }
  return coverage;
}
