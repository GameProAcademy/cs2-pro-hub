/**
 * Persistence layer (service-role only, server-side).
 *
 * Writes the PERMANENT derived data. The demo file itself is temporary.
 * Idempotency: matches are keyed by `upload_id`, so reprocessing the same
 * upload replaces the derived rows instead of duplicating them.
 */
import { ANALYSIS_VERSION, SCHEMA_VERSION } from "@/config/pipeline";
import { classifyBuyContext } from "@/lib/pipeline/normalizer";
import { PipelineError } from "@/lib/pipeline/errors";
import type {
  CanonicalFeatures,
  CanonicalMatch,
  CanonicalMetrics,
  Side,
} from "@/lib/pipeline/types";
import type { Json } from "@/integrations/supabase/types";

const EVENT_CHUNK = 500;

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
function ownScores(
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
  roundsWritten: number;
  eventsWritten: number;
}

export async function persistCanonicalMatch(args: {
  uploadId: string;
  playerId: string;
  steamId: string;
  match: CanonicalMatch;
  metrics: CanonicalMetrics;
  features: CanonicalFeatures;
}): Promise<PersistResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { match, metrics, features, uploadId, playerId, steamId } = args;

  const ownPlayer = match.players.find((player) => player.steamId === steamId) ?? null;
  const ownSide = match.rounds[0]?.sides[steamId] ?? ownPlayer?.side ?? null;
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

  // 1. Match (idempotent by upload_id)
  const { data: matchRow, error: matchError } = await supabaseAdmin
    .from("matches")
    .upsert(
      {
        upload_id: uploadId,
        player_id: playerId,
        platform: "demo",
        map: match.map,
        match_date: match.matchDate,
        game_version: match.gameVersion,
        duration_seconds: match.durationSeconds,
        rounds: match.rounds.length,
        team_player: teamPlayer,
        team_opponent: teamOpponent,
        score_player: scores.player,
        score_opponent: scores.opponent,
        result: matchResult(scores),
        demo_metadata: {
          schema_version: match.schemaVersion,
          parser: match.parser,
          quality: toJson(match.quality),
          tickrate: match.tickrate,
        },
      },
      { onConflict: "upload_id" },
    )
    .select("id")
    .single();

  if (matchError || !matchRow) fail(matchError?.message);
  const matchId = matchRow.id;

  // 2. Replace derived rows for this match (reprocessing safety)
  await supabaseAdmin.from("round_events").delete().eq("match_id", matchId);
  await supabaseAdmin.from("match_rounds").delete().eq("match_id", matchId);
  await supabaseAdmin.from("match_features").delete().eq("match_id", matchId);

  // 3. Rounds — stored from the owning player's perspective
  const roundRows = match.rounds.map((round) => {
    const side = round.sides[steamId] ?? ownSide;
    const died = match.events.some(
      (event) =>
        event.type === "kill" &&
        event.roundNumber === round.roundNumber &&
        event.victimSteamId === steamId,
    );
    return {
      match_id: matchId,
      round_number: round.roundNumber,
      winner_team: round.winnerTeam,
      winner_side: round.winnerSide,
      start_tick: round.startTick,
      end_tick: round.endTick,
      duration_seconds: round.durationSeconds,
      bomb_planted: round.bombPlanted,
      bomb_defused: round.bombDefused,
      bomb_exploded: round.bombExploded,
      player_side: side,
      player_survived: match.events.length > 0 ? !died : null,
      player_money_start: round.moneyStart[steamId] ?? null,
      player_money_end: round.moneyEnd[steamId] ?? null,
      player_equipment_value: round.equipmentValue[steamId] ?? null,
      buy_context: classifyBuyContext(round.moneyStart[steamId], round.equipmentValue[steamId]),
    };
  });

  const roundIdByNumber = new Map<number, string>();
  if (roundRows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("match_rounds")
      .insert(roundRows)
      .select("id, round_number");
    if (error) fail(error.message);
    for (const row of data ?? []) roundIdByNumber.set(row.round_number, row.id);
  }

  // 4. Events (chunked; positions only on meaningful events)
  let eventsWritten = 0;
  for (let index = 0; index < match.events.length; index += EVENT_CHUNK) {
    const chunk = match.events.slice(index, index + EVENT_CHUNK).map((event) => ({
      match_id: matchId,
      round_id: roundIdByNumber.get(event.roundNumber) ?? null,
      round_number: event.roundNumber,
      event_type: event.type,
      tick: event.tick,
      time_seconds: event.timeSeconds,
      actor_steam_id: event.actorSteamId,
      victim_steam_id: event.victimSteamId,
      assister_steam_id: event.assisterSteamId,
      weapon: event.weapon,
      headshot: event.headshot,
      distance: event.distance,
      damage: event.damage,
      data: toJson(event.data),
    }));
    const { error } = await supabaseAdmin.from("round_events").insert(chunk);
    if (error) fail(error.message);
    eventsWritten += chunk.length;
  }

  // 5. Metrics (idempotent per match+player)
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

  // 6. Feature signals for the future analysis engine
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

  return { matchId, roundsWritten: roundRows.length, eventsWritten };
}
