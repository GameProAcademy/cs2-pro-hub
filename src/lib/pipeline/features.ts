/**
 * Feature extraction: CanonicalMatch + CanonicalMetrics -> CanonicalFeatures.
 *
 * IMPORTANT: these are SIGNALS grouped by the ten Player DNA dimensions, not a
 * diagnosis and not a score. A later phase consumes them to produce the CS2 PRO
 * Score and the diagnosis. Values are normalised 0..1 where possible, or null
 * when the demo did not carry enough data (never invented).
 */
import { EARLY_DEATH_SECONDS } from "@/config/pipeline";
import type { CanonicalFeatures, CanonicalMatch, CanonicalMetrics } from "@/lib/pipeline/types";
import type { DnaDimension } from "@/types";

const clamp01 = (value: number) => Number(Math.max(0, Math.min(1, value)).toFixed(3));

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? clamp01(numerator / denominator) : null;
}

function scale(value: number | null, reference: number): number | null {
  return value == null ? null : clamp01(value / reference);
}

export function extractFeatures(
  match: CanonicalMatch,
  metrics: CanonicalMetrics,
): CanonicalFeatures {
  const rounds = metrics.roundsPlayed;
  const hasEconomy = match.rounds.some((r) => Object.keys(r.equipmentValue).length > 0);
  const hasUtility = metrics.grenadesUsed > 0 || metrics.enemiesFlashed > 0;

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
      trade_kill_share: ratio(metrics.tradeKills, Math.max(metrics.kills, 1)),
      kd_balance: ratio(metrics.kills, Math.max(metrics.kills + metrics.deaths, 1)),
    },
    survivability: {
      survival_rate: rounds > 0 ? clamp01(1 - metrics.deaths / rounds) : null,
      early_death_rate:
        metrics.deaths > 0 ? clamp01(1 - metrics.earlyDeaths / metrics.deaths) : null,
      untraded_death_rate:
        metrics.deaths > 0 ? clamp01(1 - metrics.untradedDeaths / metrics.deaths) : null,
      damage_taken_per_round: rounds > 0 ? clamp01(1 - metrics.damageTaken / rounds / 120) : null,
    },
    positioning: {
      traded_death_rate: ratio(metrics.tradeDeaths, Math.max(metrics.deaths, 1)),
      first_death_rate: metrics.deaths > 0 ? clamp01(1 - metrics.firstDeaths / rounds) : null,
      // Requires positional data; null instead of a fabricated value.
      map_spread: match.quality.flags.includes("missing_positions") ? null : null,
    },
    utility: {
      utility_damage_per_round: hasUtility ? scale(metrics.utilityDamage / Math.max(rounds, 1), 12) : null,
      flash_assists_per_round: hasUtility ? scale(metrics.flashAssists / Math.max(rounds, 1), 0.4) : null,
      enemies_flashed_per_round: hasUtility
        ? scale(metrics.enemiesFlashed / Math.max(rounds, 1), 1.2)
        : null,
      grenades_per_round: hasUtility ? scale(metrics.grenadesUsed / Math.max(rounds, 1), 2.5) : null,
    },
    decision_making: {
      kast: metrics.kast == null ? null : clamp01(metrics.kast / 100),
      early_death_avoidance:
        rounds > 0 ? clamp01(1 - metrics.earlyDeaths / rounds) : null,
      opening_discipline:
        metrics.openingAttempts > 0 ? clamp01(metrics.firstKills / metrics.openingAttempts) : null,
      early_window_seconds: EARLY_DEATH_SECONDS,
    },
    teamplay: {
      assists_per_round: scale(metrics.assists / Math.max(rounds, 1), 0.35),
      flash_assist_share: ratio(metrics.flashAssists, Math.max(metrics.assists, 1)),
      trade_participation: ratio(metrics.tradeKills, Math.max(rounds, 1)),
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
      clutch_win_rate: ratio(metrics.clutchWins, Math.max(metrics.clutchAttempts, 1)),
      clutch_frequency: ratio(metrics.clutchAttempts, Math.max(rounds, 1)),
      multi_kill_rate: ratio(metrics.multiKills, Math.max(rounds, 1)),
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
