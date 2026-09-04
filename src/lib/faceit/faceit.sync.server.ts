/**
 * FASE 2.2.1 — FACEIT synchronisation (SERVER ONLY).
 *
 * Never runs inside the OAuth callback request: the callback enqueues a job and
 * returns immediately. Jobs live in `faceit_sync_jobs` (the demo pipeline's
 * `demo_jobs` is NOT reused), only one job per connection can be active, and
 * only transient errors are retried.
 */
import { faceitRuntime } from "./faceit.runtime.server";
import {
  faceitSourceVersion,
  FACEIT_PROFILE_CACHE_MINUTES,
  FACEIT_SYNC_OVERLAP_SECONDS,
} from "./faceit.config.server";
import { FaceitError, toFaceitError } from "./faceit.errors";
import {
  mapFaceitLifetimeStats,
  mapFaceitMatchStatsToMetrics,
  mapFaceitMatchToMatch,
  mapFaceitPlayerToConnection,
} from "./faceit.mapper";
import { fetchFaceitHistory, fetchFaceitMatchDetails, fetchFaceitMatchStats } from "./faceit.matches";
import { fetchFaceitPlayer } from "./faceit.player";
import { fetchFaceitLifetimeStats } from "./faceit.stats";
import { assertSafeConnectionMetadata } from "@/lib/sources/connectionMetadata";

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
  /** Already complete in our database, therefore not fetched again. */
  matchesSkipped: number;
  /** HTTP calls performed against the Data API during this run. */
  apiCalls: number;
  durationMs: number;
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
  console.info(`[faceit] sync_started job=${candidate.id} type=${candidate.type}`);

  try {
    const counters = await runFaceitSync(
      candidate.player_id,
      candidate.connection_id,
      candidate.type as FaceitSyncJobType,
    );
    console.info(
      `[faceit] sync_completed job=${candidate.id} type=${candidate.type} found=${counters.matchesFound} new=${counters.matchesNew} updated=${counters.matchesUpdated} skipped=${counters.matchesSkipped} api_calls=${counters.apiCalls} ms=${counters.durationMs}`,
    );
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
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.connection_id);

    console.warn(
      `[faceit] sync_failed job=${candidate.id} code=${faceitError.code} attempts=${attempts} retrying=${retryable}`,
    );
    return { jobId: candidate.id, status: retryable ? "retrying" : "failed" };
  }
}

/**
 * Incremental synchronisation.
 *
 *  1. refresh the public profile (cached: `FACEIT_PROFILE_CACHE_MINUTES`);
 *  2. read the recent history with bounded pagination, using an overlapping
 *     `from` window on incremental runs so no match is lost at the boundary;
 *  3. classify each match as new / incomplete / already complete;
 *  4. fetch details + stats for new and incomplete matches only;
 *  5. persist canonically and idempotently (never duplicating a match);
 *  6. refresh aggregate/lifetime statistics on the connection.
 *
 * FACEIT data is stored with `data_source = 'faceit'` and NEVER overwrites rows
 * produced by the demo pipeline (`data_source = 'demo'`): the two coexist.
 */
export async function runFaceitSync(
  playerId: string,
  connectionId: string,
  jobType: FaceitSyncJobType = "incremental",
): Promise<SyncCounters> {
  const startedAt = Date.now();
  const db = await admin();
  const { client, config } = faceitRuntime();

  const { data: connection } = await db
    .from("player_connections")
    .select("id, external_id, status, metadata, last_sync_at")
    .eq("id", connectionId)
    .maybeSingle();

  if (!connection?.external_id || connection.status !== "connected") {
    throw new FaceitError("FACEIT_NOT_CONNECTED");
  }

  const faceitPlayerId = connection.external_id;
  const sourceVersion = faceitSourceVersion();
  const previousMetadata =
    connection.metadata && typeof connection.metadata === "object"
      ? (connection.metadata as Record<string, unknown>)
      : {};

  // 1. profile — served from the stored snapshot while it is still fresh.
  const profileAge = profileAgeMinutes(previousMetadata["synced_at"]);
  const profileIsFresh =
    jobType === "incremental" && profileAge !== null && profileAge < FACEIT_PROFILE_CACHE_MINUTES;

  let profileFields: { external_username: string | null; profile_url: string | null; metadata: Record<string, unknown> } | null = null;
  if (!profileIsFresh) {
    const player = await fetchFaceitPlayer(client, faceitPlayerId);
    // The identity must stay consistent with what OAuth resolved.
    if (player.player_id !== faceitPlayerId) throw new FaceitError("FACEIT_PLAYER_NOT_FOUND");
    profileFields = mapFaceitPlayerToConnection(player, config.gameId, sourceVersion);
  }

  // 2. history — incremental runs only look at the window since the last match.
  const from = jobType === "initial" ? undefined : await incrementalFrom(db, playerId);
  const history = await fetchFaceitHistory(client, {
    playerId: faceitPlayerId,
    gameId: config.gameId,
    maxMatches: config.syncMatchLimit,
    maxPages: config.syncMaxPages,
    from,
  });

  const counters: SyncCounters = {
    matchesFound: history.items.length,
    matchesNew: 0,
    matchesUpdated: 0,
    matchesSkipped: 0,
    apiCalls: 0,
    durationMs: 0,
  };

  // 3. classify what we already have.
  const ids = history.items.map((item) => item.match_id);
  const known = new Map<string, { id: string; complete: boolean }>();
  if (ids.length > 0) {
    const { data: rows } = await db
      .from("matches")
      .select("id, external_match_id, map, result, match_date, rounds")
      .eq("player_id", playerId)
      .eq("data_source", "faceit")
      .in("external_match_id", ids);

    const rowIds = (rows ?? []).map((row) => row.id);
    const withMetrics = new Set<string>();
    if (rowIds.length > 0) {
      const { data: metrics } = await db
        .from("match_metrics")
        .select("match_id")
        .eq("player_id", playerId)
        .in("match_id", rowIds);
      for (const metric of metrics ?? []) withMetrics.add(metric.match_id);
    }

    for (const row of rows ?? []) {
      if (!row.external_match_id) continue;
      // "Complete" means: identified map, result, date and player metrics.
      const complete =
        row.map !== null &&
        row.result !== null &&
        row.match_date !== null &&
        withMetrics.has(row.id);
      known.set(row.external_match_id, { id: row.id, complete });
    }
  }

  // 4./5. details + stats for new and incomplete matches only.
  for (const item of history.items) {
    const existing = known.get(item.match_id) ?? null;
    if (existing?.complete && jobType !== "manual") {
      counters.matchesSkipped += 1;
      continue;
    }

    const details = await fetchFaceitMatchDetails(client, item.match_id);
    const canonical = mapFaceitMatchToMatch({
      playerId: faceitPlayerId,
      history: item,
      details,
      sourceVersion,
      gameId: config.gameId,
    });
    if (!canonical) continue;

    let matchId = existing?.id ?? null;
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
          source_metadata: canonical.metadata as never,
        })
        .eq("id", matchId)
        // Defensive: a FACEIT sync never rewrites a demo-sourced row.
        .eq("data_source", "faceit");
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
          source_metadata: canonical.metadata as never,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        // Concurrent sync already inserted it: idempotent, not a failure.
        if ((error as { code?: string }).code !== "23505") {
          throw new FaceitError("FACEIT_INTERNAL_ERROR");
        }
        const { data: raced } = await db
          .from("matches")
          .select("id")
          .eq("player_id", playerId)
          .eq("data_source", "faceit")
          .eq("external_match_id", canonical.external_match_id)
          .maybeSingle();
        matchId = raced?.id ?? null;
        counters.matchesUpdated += 1;
      } else {
        matchId = inserted?.id ?? null;
        counters.matchesNew += 1;
      }
    }

    if (!matchId) continue;

    // Match stats are frequently unavailable; absence is null, never zero.
    const stats = await fetchFaceitMatchStats(client, item.match_id);
    if (!stats) continue;
    const metrics = mapFaceitMatchStatsToMetrics(stats, faceitPlayerId, item.match_id);
    if (!metrics) continue;

    await db.from("match_metrics").upsert(
      { match_id: matchId, player_id: playerId, ...metrics },
      { onConflict: "match_id,player_id" },
    );
  }

  // 6. aggregate/lifetime statistics — FACEIT's own aggregation, clearly tagged.
  const lifetime = await safeLifetime(client, faceitPlayerId, config.gameId);

  const now = new Date().toISOString();
  const baseMetadata = profileFields?.metadata ?? previousMetadata;
  const metadata: Record<string, unknown> = {
    ...baseMetadata,
    stats_kind: "aggregate",
    lifetime: lifetime ?? (baseMetadata["lifetime"] ?? null),
    lifetime_fetched_at: lifetime ? now : (baseMetadata["lifetime_fetched_at"] ?? null),
  };
  // Last line of defence before writing: no credential-like key may be stored.
  assertSafeConnectionMetadata(metadata);

  await db
    .from("player_connections")
    .update({
      ...(profileFields
        ? {
            external_username: profileFields.external_username,
            profile_url: profileFields.profile_url,
          }
        : {}),
      metadata: metadata as never,
      last_sync_at: now,
      last_sync_status: "success",
      last_sync_error: null,
      updated_at: now,
    })
    .eq("id", connectionId);

  counters.apiCalls = client.requestCount;
  counters.durationMs = Date.now() - startedAt;
  return counters;
}

function profileAgeMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return (Date.now() - time) / 60_000;
}

/**
 * Incremental window: FACEIT's `from` is an epoch in seconds. We subtract an
 * overlap so a match finishing right at the boundary is never missed; the
 * deduplication by `external_match_id` absorbs the overlap.
 */
async function incrementalFrom(
  db: Awaited<ReturnType<typeof admin>>,
  playerId: string,
): Promise<number | undefined> {
  const { data } = await db
    .from("matches")
    .select("match_date")
    .eq("player_id", playerId)
    .eq("data_source", "faceit")
    .not("match_date", "is", null)
    .order("match_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.match_date) return undefined;
  const time = Date.parse(data.match_date);
  if (!Number.isFinite(time)) return undefined;
  return Math.max(0, Math.floor(time / 1000) - FACEIT_SYNC_OVERLAP_SECONDS);
}

/** Aggregate statistics are optional: their absence never fails a sync. */
async function safeLifetime(
  client: ReturnType<typeof faceitRuntime>["client"],
  faceitPlayerId: string,
  gameId: string,
): Promise<Record<string, number | null> | null> {
  try {
    const payload = await fetchFaceitLifetimeStats(client, faceitPlayerId, gameId);
    return mapFaceitLifetimeStats(payload?.lifetime ?? null);
  } catch (error) {
    console.warn(`[faceit] lifetime_stats_unavailable code=${toFaceitError(error).code}`);
    return null;
  }
}
