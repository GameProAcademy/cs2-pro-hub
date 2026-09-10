/**
 * FASE 2.7 — DEMO per-player PROJECTION (service-role only, server-side).
 *
 * SINGLE SOURCE OF TRUTH
 * ----------------------
 * The canonical model (matches, match_sources, match_participants, match_rounds,
 * round_players, round_events) is written EXCLUSIVELY by the transactional
 * canonical routine (`persist_canonical_observation_attached`). This module no
 * longer inserts a match, rounds or events: doing both was the double
 * persistence identified by the audit, and it could create a second match row
 * whenever the resolver attached the demo to an existing FACEIT match.
 *
 * What remains here is only what the canonical model deliberately does NOT hold:
 * the per-player projection (`matches` convenience columns for the owning
 * player, `match_metrics`, `match_features`). It always runs AFTER the canonical
 * persistence and against the canonical match id it returned.
 */
import {
  ANALYSIS_VERSION,
  FEATURES_VERSION,
  METRICS_VERSION,
  SCHEMA_VERSION,
} from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import type { CanonicalFeatures, CanonicalMatch, CanonicalMetrics } from "@/lib/pipeline/types";
import type { Json } from "@/integrations/supabase/types";

/** Safe conversion of canonical structures into the database Json type. */
const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Json;

function fail(message: string | undefined): never {
  throw new PipelineError("PERSISTENCE_ERROR", message);
}

/**
 * Score ownership is a TEAM question, never a SIDE question: a team plays both
 * CT and T inside the same match, so CT/T must not decide which score belongs
 * to the player. `scoreA` belongs to `teamA`, `scoreB` to `teamB`.
 */
export function ownScores(
  match: CanonicalMatch,
  playerTeam: string | null,
): { player: number | null; opponent: number | null } {
  if (match.scoreA == null || match.scoreB == null || playerTeam == null) {
    return { player: null, opponent: null };
  }
  if (playerTeam === match.teamA) return { player: match.scoreA, opponent: match.scoreB };
  if (playerTeam === match.teamB) return { player: match.scoreB, opponent: match.scoreA };
  return { player: null, opponent: null };
}

function matchResult(scores: { player: number | null; opponent: number | null }) {
  if (scores.player == null || scores.opponent == null) return null;
  if (scores.player > scores.opponent) return "win" as const;
  if (scores.player < scores.opponent) return "loss" as const;
  return "draw" as const;
}

export interface PersistResult {
  matchId: string;
  metricsWritten: boolean;
  featuresWritten: boolean;
}

/**
 * FASE 2.7.1 — PROJECTION OWNERSHIP.
 *
 * `matches` carries two kinds of column:
 *
 *  - MATCH-WIDE facts of the projection (platform, rounds, duration, game
 *    version, demo metadata) — safe to refresh for any observer;
 *  - PLAYER-SCOPED facts (player_id, upload_id, team_player, team_opponent,
 *    score_player, score_opponent, result) — these encode ONE player's
 *    perspective, so they may only be written when the row has no owner yet or
 *    the owner is the very player being projected. Writing them under any other
 *    condition would show player A the scoreline of player B.
 *
 * Returning the whole update object from one function keeps the guard
 * indivisible: there is no code path that updates a player-scoped column
 * outside the ownership check.
 */
export function projectionUpdate(args: {
  existingPlayerId: string | null;
  playerId: string;
  uploadId: string;
  matchWide: Record<string, unknown>;
  playerScoped: Record<string, unknown>;
}): Record<string, unknown> {
  const ownsProjection = args.existingPlayerId == null || args.existingPlayerId === args.playerId;
  if (!ownsProjection) return { ...args.matchWide };
  return {
    ...args.matchWide,
    player_id: args.playerId,
    upload_id: args.uploadId,
    ...args.playerScoped,
  };
}

/**
 * Writes the per-player projection of an ALREADY persisted canonical match.
 *
 * Idempotent: metrics are keyed by (match_id, player_id) and features are
 * replaced for the same pair, so reprocessing the same demo never duplicates a
 * row. Nothing here creates canonical facts.
 */
export async function persistDemoProjection(args: {
  /** Canonical match id returned by the canonical persistence routine. */
  matchId: string;
  uploadId: string;
  playerId: string;
  steamId: string;
  match: CanonicalMatch;
  metrics: CanonicalMetrics;
  features: CanonicalFeatures;
}): Promise<PersistResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { match, metrics, features, matchId, uploadId, playerId, steamId } = args;

  const ownPlayer = match.players.find((player) => player.steamId === steamId) ?? null;
  const teamPlayer = ownPlayer?.team ?? null;
  const teamOpponent =
    teamPlayer == null
      ? null
      : teamPlayer === match.teamA
        ? match.teamB
        : teamPlayer === match.teamB
          ? match.teamA
          : null;
  const scores = ownScores(match, teamPlayer);

  // 1. Projection columns on the canonical match row. Player-scoped columns are
  //    only written when this player owns the projection (see projectionUpdate).
  const { data: existing, error: readError } = await supabaseAdmin
    .from("matches")
    .select("id, player_id")
    .eq("id", matchId)
    .maybeSingle();
  if (readError) fail(readError.message);
  if (!existing) fail("canonical match not found for projection");

  const update = projectionUpdate({
    existingPlayerId: existing.player_id ?? null,
    playerId,
    uploadId,
    matchWide: {
      platform: "demo",
      rounds: match.rounds.length,
      duration_seconds: match.durationSeconds,
      game_version: match.gameVersion,
      demo_metadata: {
        schema_version: match.schemaVersion,
        parser: toJson(match.parser),
        quality: toJson(match.quality),
        tickrate: match.tickrate,
        metrics_version: METRICS_VERSION,
        features_version: FEATURES_VERSION,
      },
    },
    playerScoped: {
      team_player: teamPlayer,
      team_opponent: teamOpponent,
      score_player: scores.player,
      score_opponent: scores.opponent,
      result: matchResult(scores),
    },
  });

  const { error: updateError } = await supabaseAdmin
    .from("matches")
    .update(update as never)
    .eq("id", matchId);
  if (updateError) fail(updateError.message);

  // 2. Metrics (idempotent per match+player)
  const { error: metricsError } = await supabaseAdmin.from("match_metrics").upsert(
    {
      match_id: matchId,
      player_id: playerId,
      rounds_played: metrics.roundsPlayed,
      kills: metrics.kills,
      deaths: metrics.deaths,
      assists: metrics.assists,
      hs_percent: metrics.hsPercent,
      adr: metrics.adr,
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
    },
    { onConflict: "match_id,player_id" },
  );
  if (metricsError) fail(metricsError.message);

  // 3. Feature signals for the future analysis engine (replaced, not stacked)
  await supabaseAdmin
    .from("match_features")
    .delete()
    .eq("match_id", matchId)
    .eq("player_id", playerId);

  const { error: featuresError } = await supabaseAdmin.from("match_features").insert({
    match_id: matchId,
    player_id: playerId,
    steam_id: steamId,
    sample_rounds: features.sampleRounds,
    sample_opening_duels: features.sampleOpeningDuels,
    sample_clutches: features.sampleClutches,
    extraction_confidence: match.quality.extractionConfidence,
    partial_parse: match.quality.partialParse,
    features: toJson(features.dimensions),
    schema_version: SCHEMA_VERSION,
    analysis_version: ANALYSIS_VERSION,
  });
  if (featuresError) fail(featuresError.message);

  return { matchId, metricsWritten: true, featuresWritten: true };
}
