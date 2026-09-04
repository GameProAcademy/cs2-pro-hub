/**
 * FASE 2.2.1 — FACEIT synchronisation (SERVER ONLY).
 *
 * Never runs inside the OAuth callback request: the callback enqueues a job and
 * returns immediately. Jobs live in `faceit_sync_jobs` (the demo pipeline's
 * `demo_jobs` is NOT reused), only one job per connection can be active, and
 * only transient errors are retried.
 */
import { faceitRuntime } from "./faceit.client.server";
import { faceitSourceVersion } from "./faceit.config.server";
import { FaceitError, toFaceitError } from "./faceit.errors";
import {
  mapFaceitMatchStatsToMetrics,
  mapFaceitMatchToMatch,
  mapFaceitPlayerToConnection,
} from "./faceit.mapper";
import { fetchFaceitHistory, fetchFaceitMatchDetails, fetchFaceitMatchStats } from "./faceit.matches";
import { fetchFaceitPlayer } from "./faceit.player";

export type FaceitSyncJobType = "initial" | "incremental" | "manual" | "profile" | "match" | "stats";

export const MAX_FACEIT_RETRIES = 3;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface SyncCounters {
  matchesFound: number;
  matchesNew: number;
  matchesUpdated: number;
}

/**
 * Enqueues a job. The partial unique index guarantees a single active job per
 * connection, so ten clicks on "refresh" produce exactly one synchronisation.
 */
export async function enqueueFaceitSync(
  playerId: string,
  connectionId: string,
  type: FaceitSyncJobType,
): Promise<{ jobId: string; alreadyRunning: boolean }> {
  const db = await admin();
  const { data, error } = await db
    .from("faceit_sync_jobs")
    .insert({ player_id: playerId, connection_id: connectionId, type })
    .select("id")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const { data: active } = await db
        .from("faceit_sync_jobs")
        .select("id")
        .eq("connection_id", connectionId)
        .in("status", ["queued", "processing", "retrying"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { jobId: active?.id ?? "", alreadyRunning: true };
    }
    throw new FaceitError("FACEIT_INTERNAL_ERROR");
  }

  return { jobId: data.id, alreadyRunning: false };
}

/** Claims and processes the next runnable job. Returns null when idle. */
export async function processNextFaceitSyncJob(): Promise<{
  jobId: string;
  status: "completed" | "failed" | "retrying";
} | null> {
  const db = await admin();
  const now = new Date().toISOString();

  const { data: candidate } = await db
    .from("faceit_sync_jobs")
    .select("id, player_id, connection_id, type, attempts")
    .in("status", ["queued", "retrying"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!candidate) return null;

  // Conditional claim: only one worker can flip a queued row to processing.
  const { data: claimed } = await db
    .from("faceit_sync_jobs")
    .update({ status: "processing", started_at: now, updated_at: now })
    .eq("id", candidate.id)
    .in("status", ["queued", "retrying"])
    .select("id")
    .maybeSingle();
  if (!claimed) return null;

  try {
    const counters = await runFaceitSync(candidate.player_id, candidate.connection_id);
    await db
      .from("faceit_sync_jobs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        matches_found: counters.matchesFound,
        matches_new: counters.matchesNew,
        matches_updated: counters.matchesUpdated,
        last_error: null,
      })
      .eq("id", candidate.id);
    return { jobId: candidate.id, status: "completed" };
  } catch (error) {
    const faceitError = toFaceitError(error);
    const attempts = candidate.attempts + 1;
    const retryable = faceitError.retryable && attempts < MAX_FACEIT_RETRIES;
    const backoffSeconds = Math.min(
      (faceitError.retryAfterSeconds ?? 30) * attempts,
      15 * 60,
    );

    await db
      .from("faceit_sync_jobs")
      .update({
        status: retryable ? "retrying" : "failed",
        attempts,
        last_error: faceitError.code,
        next_attempt_at: retryable
          ? new Date(Date.now() + backoffSeconds * 1000).toISOString()
          : null,
        finished_at: retryable ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.id);

    await db
      .from("player_connections")
      .update({
        last_sync_status: retryable ? "retrying" : "error",
        last_sync_error: faceitError.code,
        status: faceitError.code === "FACEIT_API_UNAUTHORIZED" ? "connected" : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.connection_id);

    return { jobId: candidate.id, status: retryable ? "retrying" : "failed" };
  }
}

/**
 * Incremental synchronisation:
 *  1. refresh the public profile;
 *  2. read the recent history (bounded pagination);
 *  3. keep only match ids we do not have yet;
 *  4. fetch details/stats for those matches only;
 *  5. persist canonically and idempotently.
 */
export async function runFaceitSync(playerId: string, connectionId: string): Promise<SyncCounters> {
  const db = await admin();
  const { client, config } = faceitRuntime();

  const { data: connection } = await db
    .from("player_connections")
    .select("id, external_id, status")
    .eq("id", connectionId)
    .maybeSingle();

  if (!connection?.external_id || connection.status !== "connected") {
    throw new FaceitError("FACEIT_NOT_CONNECTED");
  }

  const faceitPlayerId = connection.external_id;
  const sourceVersion = faceitSourceVersion();

  // 1. profile
  const player = await fetchFaceitPlayer(client, faceitPlayerId);
  const profileFields = mapFaceitPlayerToConnection(player, config.gameId, sourceVersion);

  // 2. history
  const history = await fetchFaceitHistory(client, {
    playerId: faceitPlayerId,
    gameId: config.gameId,
    maxMatches: config.syncMatchLimit,
    maxPages: config.syncMaxPages,
  });

  const counters: SyncCounters = {
    matchesFound: history.items.length,
    matchesNew: 0,
    matchesUpdated: 0,
  };

  // 3. what do we already have?
  const ids = history.items.map((item) => item.match_id);
  const known = new Map<string, string>();
  if (ids.length > 0) {
    const { data: rows } = await db
      .from("matches")
      .select("id, external_match_id")
      .eq("player_id", playerId)
      .eq("data_source", "faceit")
      .in("external_match_id", ids);
    for (const row of rows ?? []) {
      if (row.external_match_id) known.set(row.external_match_id, row.id);
    }
  }

  // 4./5. details + stats only for what is missing
  for (const item of history.items) {
    const existingId = known.get(item.match_id);
    const details = existingId ? null : await fetchFaceitMatchDetails(client, item.match_id);
    const canonical = mapFaceitMatchToMatch({
      playerId: faceitPlayerId,
      history: item,
      details,
      sourceVersion,
      gameId: config.gameId,
    });
    if (!canonical) continue;

    let matchId = existingId ?? null;
    if (matchId) {
      await db
        .from("matches")
        .update({
          map: canonical.map,
          match_date: canonical.match_date,
          score_player: canonical.score_player,
          score_opponent: canonical.score_opponent,
          result: canonical.result,
          rounds: canonical.rounds,
          team_player: canonical.team_player,
          team_opponent: canonical.team_opponent,
          duration_seconds: canonical.duration_seconds,
          source_fetched_at: canonical.source_fetched_at,
          source_version: canonical.source_version,
          source_metadata: canonical.metadata,
        })
        .eq("id", matchId);
      counters.matchesUpdated += 1;
    } else {
      const { data: inserted, error } = await db
        .from("matches")
        .insert({
          player_id: playerId,
          upload_id: null,
          data_source: "faceit",
          platform: "faceit",
          external_match_id: canonical.external_match_id,
          map: canonical.map,
          match_date: canonical.match_date,
          score_player: canonical.score_player,
          score_opponent: canonical.score_opponent,
          result: canonical.result,
          rounds: canonical.rounds,
          team_player: canonical.team_player,
          team_opponent: canonical.team_opponent,
          duration_seconds: canonical.duration_seconds,
          source_fetched_at: canonical.source_fetched_at,
          source_version: canonical.source_version,
          source_metadata: canonical.metadata,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        // Concurrent sync already inserted it: idempotent, not a failure.
        if ((error as { code?: string }).code !== "23505") throw new FaceitError("FACEIT_INTERNAL_ERROR");
        const { data: raced } = await db
          .from("matches")
          .select("id")
          .eq("player_id", playerId)
          .eq("data_source", "faceit")
          .eq("external_match_id", canonical.external_match_id)
          .maybeSingle();
        matchId = raced?.id ?? null;
      } else {
        matchId = inserted?.id ?? null;
        counters.matchesNew += 1;
      }
    }

    if (!matchId) continue;

    // Match stats are frequently unavailable; absence is not zero.
    const stats = existingId ? null : await fetchFaceitMatchStats(client, item.match_id);
    if (!stats) continue;
    const metrics = mapFaceitMatchStatsToMetrics(stats, faceitPlayerId);
    if (!metrics) continue;

    await db.from("match_metrics").upsert(
      { match_id: matchId, player_id: playerId, ...metrics },
      { onConflict: "match_id,player_id" },
    );
  }

  const now = new Date().toISOString();
  await db
    .from("player_connections")
    .update({
      external_username: profileFields.external_username,
      profile_url: profileFields.profile_url,
      metadata: profileFields.metadata,
      last_sync_at: now,
      last_sync_status: "success",
      last_sync_error: null,
      updated_at: now,
    })
    .eq("id", connectionId);

  return counters;
}
