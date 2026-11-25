/**
 * The `_metrics` argument of `persist_demo_projection`, built from the pipeline metrics. Kept pure
 * (no Supabase client) so the ingestion integration test runs the very mapping production uses:
 * src/lib/pipeline/persistence.server.ts passes this object, minus the admission exclusions.
 */
import type { CanonicalMetrics } from "@/lib/pipeline/types";

export function projectionMetricsPayload(metrics: CanonicalMetrics) {
  return {
    rounds_played: metrics.roundsPlayed,
    kills: metrics.kills,
    deaths: metrics.deaths,
    assists: metrics.assists,
    hs_percent: metrics.hsPercent,
    adr: metrics.adr,
    damage_enemy_hp: metrics.damageEnemyHp,
    damage_enemy_hp_method: metrics.damageEnemyHpMethod,
    damage_enemy_hp_excluded_hits: metrics.damageEnemyHpExcludedHits,
    kast: metrics.kast,
    damage_taken: metrics.damageTaken,
    damage_efficiency: metrics.damageEfficiency,
    first_kills: metrics.firstKills,
    first_deaths: metrics.firstDeaths,
    opening_attempts: metrics.openingAttempts,
    opening_success: metrics.openingSuccess,
    opening_success_rate: metrics.openingSuccessRate,
    trade_kills: metrics.tradeKills,
    trade_deaths: metrics.tradeDeaths,
    clutch_attempts: metrics.clutchAttempts,
    clutch_wins: metrics.clutchWins,
    clutches: metrics.clutchWins,
    multi_kills: metrics.multiKills,
    utility_damage: metrics.utilityDamage,
    grenade_damage: metrics.grenadeDamage,
    flash_assists: metrics.flashAssists,
    ct_rating: metrics.ctRating,
    t_rating: metrics.tRating,
    rating: metrics.sourceRating,
  };
}
