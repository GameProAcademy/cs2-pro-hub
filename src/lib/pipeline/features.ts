/**
 * Feature extraction: CanonicalMatch + CanonicalMetrics -> CanonicalFeatures.
 *
 * IMPORTANT: these are SIGNALS grouped by the ten Player DNA dimensions, not a
 * diagnosis and not a score. A later phase consumes them to produce the CS2 PRO
 * Score and the diagnosis.
 *
 * FASE 2.7 SEMANTIC RULES (enforced by tests against `features.catalog.ts`):
 *  - the NAME of a feature must describe exactly what its formula computes;
 *    a `*_rate` is never its own complement, and every complement is emitted
 *    as its own explicitly named signal (`*_avoidance`, `*_free_rate`);
 *  - a missing denominator yields NULL, never 0. `deaths = 0` does not mean
 *    "perfect early-death rate", it means the signal has no sample;
 *  - nothing is derived from a proxy: no damage as economy, no kills as
 *    positioning, no rating standing in for an unmeasured dimension.
 */
import { EARLY_DEATH_SECONDS, FEATURES_VERSION } from "@/config/pipeline";
import { FEATURE_CATALOG } from "@/lib/pipeline/features.catalog";
import type { CanonicalFeatures, CanonicalMatch, CanonicalMetrics } from "@/lib/pipeline/types";
import type { DnaDimension } from "@/types";

const clamp01 = (value: number) => Number(Math.max(0, Math.min(1, value)).toFixed(3));

/** NULL when there is no sample. A zero denominator is absence, not zero. */
function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return clamp01(numerator / denominator);
}

/** Explicit complement of a ratio, preserving its null semantics. */
function complement(value: number | null): number | null {
  return value == null ? null : clamp01(1 - value);
}

function scale(value: number | null, reference: number): number | null {
  return value == null ? null : clamp01(value / reference);
}

/** Per-round rate scaled against a documented reference. NULL without rounds. */
function perRound(total: number | null, rounds: number, reference: number): number | null {
  if (total == null || rounds <= 0) return null;
  return clamp01(total / rounds / reference);
}

export const FEATURES_CATALOG_VERSION = FEATURES_VERSION;

export function extractFeatures(
  match: CanonicalMatch,
  metrics: CanonicalMetrics,
): CanonicalFeatures {
  const rounds = metrics.roundsPlayed;
  const deaths = metrics.deaths;
  const hasEconomy = match.rounds.some((r) => Object.keys(r.equipmentValue).length > 0);
  const hasUtility = (metrics.grenadesUsed ?? 0) > 0 || (metrics.enemiesFlashed ?? 0) > 0;

  const earlyDeathRate = ratio(metrics.earlyDeaths, deaths);
  const firstDeathRate = ratio(metrics.firstDeaths, rounds);

  const dimensions: Record<DnaDimension, Record<string, number | null>> = {
    aim: {
      hs_rate: metrics.hsPercent == null ? null : clamp01(metrics.hsPercent / 100),
      kills_per_round: ratio(metrics.kills, rounds),
      damage_per_round: scale(metrics.adr, 100),
      damage_efficiency: scale(metrics.damageEfficiency, 2),
    },
    dueling: {
      opening_success: metrics.openingSuccessRate,
      opening_participation: ratio(metrics.openingAttempts, rounds),
      trade_kill_share: ratio(metrics.tradeKills, metrics.kills),
      kd_balance: ratio(metrics.kills, metrics.kills + deaths),
    },
    survivability: {
      survival_rate: complement(ratio(deaths, rounds)),
      // ↓ lower is better: share of deaths that happened early.
      early_death_rate: earlyDeathRate,
      // ↑ higher is better: the complement, named for what it means.
      early_death_avoidance: complement(earlyDeathRate),
      // ↓ lower is better: deaths no teammate answered.
      untraded_death_rate: ratio(metrics.untradedDeaths, deaths),
      // ↓ lower is better: damage absorbed per round.
      damage_taken_per_round: perRound(metrics.damageTaken, rounds, 120),
    },
    positioning: {
      traded_death_rate: ratio(metrics.tradeDeaths, deaths),
      first_death_rate: firstDeathRate,
      first_death_avoidance: complement(firstDeathRate),
      // Requires continuous position samples, which the parser contract does
      // not carry. NULL instead of a fabricated value.
      map_spread: null,
    },
    utility: {
      utility_damage_per_round: hasUtility ? perRound(metrics.utilityDamage, rounds, 12) : null,
      flash_assists_per_round: hasUtility ? perRound(metrics.flashAssists, rounds, 0.4) : null,
      enemies_flashed_per_round: hasUtility ? perRound(metrics.enemiesFlashed, rounds, 1.2) : null,
      grenades_per_round: hasUtility ? perRound(metrics.grenadesUsed, rounds, 2.5) : null,
    },
    decision_making: {
      kast: metrics.kast == null ? null : clamp01(metrics.kast / 100),
      // Round-denominated, so it is NOT the complement of early_death_rate.
      early_death_free_rate: complement(ratio(metrics.earlyDeaths, rounds)),
      opening_discipline: ratio(metrics.firstKills, metrics.openingAttempts),
      early_window_seconds: EARLY_DEATH_SECONDS,
    },
    teamplay: {
      assists_per_round: perRound(metrics.assists, rounds, 0.35),
      flash_assist_share: ratio(metrics.flashAssists, metrics.assists),
      trade_participation: ratio(metrics.tradeKills, rounds),
    },
    economy: {
      // Economy MUST come from real buy data (money_start / money_end /
      // equipment_value / buy context). Damage is NOT a proxy for economic
      // discipline, so nothing is derived from it here: a null with a known
      // low confidence is better than a fabricated number.
      buy_discipline: null,
      damage_per_dollar: null,
      /** Factual signal only: whether the demo carried economy data at all. */
      economy_data_available: hasEconomy ? 1 : 0,
    },
    clutch: {
      clutch_win_rate: ratio(metrics.clutchWins, metrics.clutchAttempts),
      clutch_frequency: ratio(metrics.clutchAttempts, rounds),
      multi_kill_rate: ratio(metrics.multiKills, rounds),
    },
    consistency: {
      // Single-match consistency is weak by nature; the value is flagged by the
      // low sample count so the analysis engine can down-weight it.
      side_balance:
        metrics.ctRating != null && metrics.tRating != null
          ? clamp01(1 - Math.abs(metrics.ctRating - metrics.tRating))
          : null,
      rating: scale(metrics.sourceRating, 1.6),
      sample_rounds: rounds,
    },
  };

  return {
    steamId: metrics.steamId,
    sampleRounds: rounds,
    sampleOpeningDuels: metrics.openingAttempts,
    sampleClutches: metrics.clutchAttempts,
    dimensions: dimensions as Record<string, Record<string, number | null>>,
  };
}

/** Every emitted feature is documented; used by the semantic audit test. */
export const FEATURE_NAMES = Object.entries(FEATURE_CATALOG).flatMap(([dimension, features]) =>
  Object.keys(features).map((feature) => `${dimension}.${feature}`),
);
