/**
 * FASE 2.7 — GATE 20: feature semantics.
 *
 * These tests prove that every emitted signal is documented, that its NAME
 * matches its FORMULA (no silent inversion), that each has an explicit
 * direction and that a missing sample yields NULL instead of 0.
 */
import { describe, expect, it } from "vitest";

import { EARLY_DEATH_SECONDS } from "@/config/pipeline";
import { extractFeatures } from "@/lib/pipeline/features";
import { FEATURE_CATALOG, featureDirection } from "@/lib/pipeline/features.catalog";
import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { CanonicalMatch, CanonicalMetrics } from "@/lib/pipeline/types";

import { ME, syntheticParserOutput } from "./fixture";

const match: CanonicalMatch = normalizeParserOutput(syntheticParserOutput);
const metrics: CanonicalMetrics = computeMetrics(match, ME);
const features = extractFeatures(match, metrics);

describe("feature catalogue coverage", () => {
  it("documents exactly the features that are emitted", () => {
    for (const [dimension, values] of Object.entries(features.dimensions)) {
      expect(Object.keys(FEATURE_CATALOG[dimension] ?? {}).sort()).toEqual(
        Object.keys(values).sort(),
      );
    }
    expect(Object.keys(FEATURE_CATALOG).sort()).toEqual(Object.keys(features.dimensions).sort());
  });

  it("declares a direction for every feature", () => {
    for (const [dimension, values] of Object.entries(features.dimensions)) {
      for (const name of Object.keys(values)) {
        expect(featureDirection(dimension, name)).not.toBeNull();
      }
    }
  });
});

describe("rate features are not their own complement", () => {
  const survivability = () => features.dimensions["survivability"]!;

  it("early_death_rate is earlyDeaths / deaths", () => {
    expect(survivability()["early_death_rate"]).toBeCloseTo(
      metrics.earlyDeaths / metrics.deaths,
      3,
    );
    expect(featureDirection("survivability", "early_death_rate")).toBe("down");
  });

  it("early_death_avoidance is the explicit complement", () => {
    expect(survivability()["early_death_avoidance"]).toBeCloseTo(
      1 - metrics.earlyDeaths / metrics.deaths,
      3,
    );
    expect(featureDirection("survivability", "early_death_avoidance")).toBe("up");
  });

  it("untraded_death_rate is untradedDeaths / deaths", () => {
    expect(survivability()["untraded_death_rate"]).toBeCloseTo(
      metrics.untradedDeaths / metrics.deaths,
      3,
    );
    expect(featureDirection("survivability", "untraded_death_rate")).toBe("down");
  });

  it("damage_taken_per_round grows with damage taken", () => {
    expect(featureDirection("survivability", "damage_taken_per_round")).toBe("down");
    const value = survivability()["damage_taken_per_round"];
    if (metrics.damageTaken != null) {
      expect(value).toBeCloseTo(Math.min(1, metrics.damageTaken / metrics.roundsPlayed / 120), 3);
    }
  });

  it("decision_making early_death_free_rate is round-denominated", () => {
    expect(features.dimensions["decision_making"]?.["early_death_free_rate"]).toBeCloseTo(
      1 - metrics.earlyDeaths / metrics.roundsPlayed,
      3,
    );
  });

  it("keeps the early window it was computed with", () => {
    expect(features.dimensions["decision_making"]?.["early_window_seconds"]).toBe(
      EARLY_DEATH_SECONDS,
    );
  });
});

describe("absence of sample is NULL, never zero", () => {
  const empty = extractFeatures(match, {
    ...metrics,
    roundsPlayed: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    openingAttempts: 0,
    clutchAttempts: 0,
  } as CanonicalMetrics);

  it("returns null for every ratio without a denominator", () => {
    const survivability = empty.dimensions["survivability"]!;
    expect(survivability["early_death_rate"]).toBeNull();
    expect(survivability["early_death_avoidance"]).toBeNull();
    expect(survivability["untraded_death_rate"]).toBeNull();
    expect(survivability["survival_rate"]).toBeNull();
    expect(empty.dimensions["dueling"]?.["trade_kill_share"]).toBeNull();
    expect(empty.dimensions["dueling"]?.["kd_balance"]).toBeNull();
    expect(empty.dimensions["clutch"]?.["clutch_win_rate"]).toBeNull();
    expect(empty.dimensions["teamplay"]?.["flash_assist_share"]).toBeNull();
    expect(empty.dimensions["decision_making"]?.["opening_discipline"]).toBeNull();
  });

  it("never fabricates economy or positioning", () => {
    expect(empty.dimensions["economy"]?.["buy_discipline"]).toBeNull();
    expect(empty.dimensions["economy"]?.["damage_per_dollar"]).toBeNull();
    expect(empty.dimensions["positioning"]?.["map_spread"]).toBeNull();
  });
});
