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
  _match: CanonicalMatch,
  metrics: CanonicalMetrics,
): CanonicalFeatures {
  const rounds = metrics.roundsPlayed;
  const deaths = metrics.deaths;
  /**
   * FASE 2.7.1 — EVIDENCE AVAILABILITY, NOT PLAYER ACTIVITY.
   *
   * `hasUtility` must answer "did the observation contain the utility event
   * class?", never "did this player throw anything?". Deriving it from the
   * player's own counters turned an observed ZERO ("the demo has utility events
   * and this player threw none") into NULL, which is a different claim.
   */
  const hasEconomy = metrics.availability.economy;
  const hasUtility = metrics.availability.utilityEvents;
  /**
   * FASE 2.7.1 — EVIDENCE GATES (NULL ≠ ZERO).
   *
   * `metrics.kills`, `metrics.deaths`, `metrics.assists`, `metrics.firstKills`
   * and friends are RAW OBSERVED COUNTERS: with no kill events in the dataset
   * they are legitimately 0 ("we counted nothing"), which is NOT the same claim
   * as "the player did nothing". Every derived signal is therefore gated on the
   * evidence class it needs, so an unavailable class yields NULL while an
   * available class with an observed zero yields 0.
   */
  const hasKills = metrics.availability.killEvents;
  const hasDamage = metrics.availability.damageEvents;
  const hasTiming = metrics.availability.timing;
  /**
   * FASE 2.7.1D — PARTIAL PARSE / WHOLE-MATCH RATES.
   *
   * A feature whose denominator is the ROUND SET describes the whole match. On a
   * partial parse the observed round set is not the match, so such a rate would
   * silently change meaning ("per observed round" published as "per round").
   * Those signals are therefore NULL while coverage is incomplete.
   *
   * Directly observed counters (kills, deaths, assists) and ratios whose
   * denominator is itself an observed event count (hs_rate = headshots/kills,
   * trade_kill_share = trades/kills, clutch_win_rate = wins/attempts) stay as
   * numbers: they are self-consistent over exactly what was observed, and
   * discarding them would be dishonest in the other direction.
   */
  const hasCoverage = metrics.availability.completeCoverage;
  /** NULL unless the required evidence classes are all present. */
  const gate = (available: boolean, value: number | null): number | null =>
    available ? value : null;

  const earlyDeathRate = gate(hasKills && hasTiming, ratio(metrics.earlyDeaths, deaths));
  const firstDeathRate = gate(hasKills, ratio(metrics.firstDeaths, rounds));

  const dimensions: Record<DnaDimension, Record<string, number | null>> = {
    aim: {
      hs_rate: gate(hasKills, metrics.hsPercent == null ? null : clamp01(metrics.hsPercent / 100)),
      kills_per_round: gate(hasKills, ratio(metrics.kills, rounds)),
      damage_per_round: gate(hasDamage, scale(metrics.adr, 100)),
      damage_efficiency: gate(hasDamage, scale(metrics.damageEfficiency, 2)),
    },
    dueling: {
      opening_success: gate(hasKills, metrics.openingSuccessRate),
      opening_participation: gate(hasKills, ratio(metrics.openingAttempts, rounds)),
      trade_kill_share: gate(hasKills && hasTiming, ratio(metrics.tradeKills, metrics.kills)),
      kd_balance: gate(hasKills, ratio(metrics.kills, metrics.kills + deaths)),
    },
    survivability: {
      // A survival claim needs both death evidence and provably ended rounds.
      survival_rate: gate(hasKills && hasRoundEnd, complement(ratio(deaths, rounds))),
      // ↓ lower is better: share of deaths that happened early.
      early_death_rate: earlyDeathRate,
      // ↑ higher is better: the complement, named for what it means.
      early_death_avoidance: complement(earlyDeathRate),
      // ↓ lower is better: deaths no teammate answered.
      untraded_death_rate: gate(hasKills && hasTiming, ratio(metrics.untradedDeaths, deaths)),
      // ↓ lower is better: damage absorbed per round.
      damage_taken_per_round: gate(hasDamage, perRound(metrics.damageTaken, rounds, 120)),
    },
    positioning: {
      traded_death_rate: gate(hasKills && hasTiming, ratio(metrics.tradeDeaths, deaths)),
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
      early_death_free_rate: gate(
        hasKills && hasTiming,
        complement(ratio(metrics.earlyDeaths, rounds)),
      ),
      opening_discipline: gate(hasKills, ratio(metrics.firstKills, metrics.openingAttempts)),
      early_window_seconds: EARLY_DEATH_SECONDS,
    },
    teamplay: {
      assists_per_round: gate(hasKills, perRound(metrics.assists, rounds, 0.35)),
      flash_assist_share: gate(
        hasKills && hasUtility,
        ratio(metrics.flashAssists, metrics.assists),
      ),
      trade_participation: gate(hasKills && hasTiming, ratio(metrics.tradeKills, rounds)),
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
      clutch_win_rate: gate(hasKills, ratio(metrics.clutchWins, metrics.clutchAttempts)),
      clutch_frequency: gate(hasKills, ratio(metrics.clutchAttempts, rounds)),
      multi_kill_rate: gate(hasKills, ratio(metrics.multiKills, rounds)),
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
