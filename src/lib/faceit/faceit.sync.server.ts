/**
 * FASE 2.2.1 / 2.2.1C — FACEIT synchronisation (SERVER ONLY).
 *
 * ARCHITECTURE (2.2.1C): a user request NEVER executes a synchronisation.
 *
 *   user / oauth callback -> enqueue -> respond
 *   cron worker           -> recover stale -> claim (atomic) -> sync -> persist
 *                         -> completed | retrying | failed
 *
 * There is no fire-and-forget: on an edge runtime a promise left running after
 * the response is not guaranteed to finish, so execution belongs exclusively to
 * the worker. Jobs live in `faceit_sync_jobs` (the demo pipeline's `demo_jobs`
 * is NOT reused), only one job per connection can be active, the claim is an
 * atomic compare-and-swap inside a database function, a dead worker's job is
 * recovered through the heartbeat window, and attempts are bounded.
 */
import { faceitRuntime } from "./faceit.runtime.server";
import {
  faceitSourceVersion,
  FACEIT_PROFILE_CACHE_MINUTES,
  FACEIT_SYNC_OVERLAP_SECONDS,
} from "./faceit.config.server";
import {
  FACEIT_HEARTBEAT_INTERVAL_MS,
  FACEIT_JOB_API_CALL_BUDGET,
  FACEIT_JOB_STALE_SECONDS,
  FACEIT_MAX_CONCURRENT_JOBS,
  FACEIT_MAX_JOB_ATTEMPTS,
  FACEIT_MAX_MATCH_FETCH_ATTEMPTS,
  FACEIT_WORKER_MAX_JOBS,
  FACEIT_WORKER_TIME_BUDGET_MS,
} from "./faceit.constants";
import { FaceitError, toFaceitError } from "./faceit.errors";
import {
  faceitMapFromStats,
  mapFaceitLifetimeStats,
  mapFaceitMatchStatsToMetrics,
  mapFaceitMatchToMatch,
  mapFaceitPlayerToConnection,
} from "./faceit.mapper";
import {
  fetchFaceitHistory,
  fetchFaceitMatchDetails,
  fetchFaceitMatchStats,
} from "./faceit.matches";
import { fetchFaceitPlayer } from "./faceit.player";
import { fetchFaceitLifetimeStats } from "./faceit.stats";
import { assertSafeConnectionMetadata } from "@/lib/sources/connectionMetadata";

export type FaceitSyncJobType =
  "initial" | "incremental" | "manual" | "profile" | "match" | "stats";

/** Kept as the single source of truth for the attempt ceiling. */
export const MAX_FACEIT_RETRIES = FACEIT_MAX_JOB_ATTEMPTS;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Honest counters. "updated" is only a real update of an existing row; losing an
 * insert race is reported as `matchesAlreadyExisted`, not as an update.
 */
export interface SyncCounters {
  /** Matches returned by the history window. */
  matchesFound: number;
  matchesInserted: number;
  matchesUpdated: number;
  /** Already converged in our database, therefore not fetched again. */
  matchesSkipped: number;
  /** Insert lost a race with a concurrent worker; the existing row was reused. */
  matchesAlreadyExisted: number;
  /** Individual matches we could not persist. */
  matchesFailed: number;
  /** Matches left for the next run because the budget ran out. */
  matchesDeferred: number;
  /** History pagination could not prove it reached the end of the window. */
  historyTruncated: boolean;
  /** The API-call or time budget stopped this run early. */
  budgetExhausted: boolean;
  /** HTTP calls performed against the Data API during this run. */
  apiCalls: number;
  durationMs: number;
}

function emptyCounters(): SyncCounters {
  return {
    matchesFound: 0,
    matchesInserted: 0,
    matchesUpdated: 0,
    matchesSkipped: 0,
    matchesAlreadyExisted: 0,
    matchesFailed: 0,
    matchesDeferred: 0,
    historyTruncated: false,
    budgetExhausted: false,
    apiCalls: 0,
    durationMs: 0,
  };
}

/**
 * Enqueues a job. The partial unique index guarantees a single active job per
 * connection, so ten clicks on "refresh" produce exactly one synchronisation.
 * The caller NEVER executes it — the worker does.
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

/* -------------------------------------------------------------------------- */
/* Job engine                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Recovers jobs abandoned in `processing` by a dead worker.
 *
 *   processing --(heartbeat older than the stale window)--> retrying | failed
 *
 * The decision respects the attempt ceiling, so a job that keeps dying ends in
 * `failed` instead of retrying forever.
 */
export async function recoverStaleFaceitSyncJobs(): Promise<number> {
  const db = await admin();
  const { data, error } = await db.rpc("recover_stale_faceit_sync_jobs", {
    _stale_seconds: FACEIT_JOB_STALE_SECONDS,
    _max_attempts: FACEIT_MAX_JOB_ATTEMPTS,
  });
  if (error) {
    console.warn("[faceit] stale_recovery_failed");
    return 0;
  }
  const recovered = typeof data === "number" ? data : 0;
  if (recovered > 0) console.warn(`[faceit] stale_jobs_recovered count=${recovered}`);
  return recovered;
}

export interface ClaimedFaceitJob {
  id: string;
  playerId: string;
  connectionId: string;
  type: FaceitSyncJobType;
  attempts: number;
}

/**
 * Atomic claim. The database function serialises the concurrency check and the
 * row lock (advisory lock + `FOR UPDATE SKIP LOCKED`), so two workers can never
 * own the same job and the global `processing` ceiling is always respected.
 */
export async function claimNextFaceitSyncJob(): Promise<ClaimedFaceitJob | null> {
  const db = await admin();
  const { data: jobId, error } = await db.rpc("claim_next_faceit_sync_job", {
    _max_concurrent: FACEIT_MAX_CONCURRENT_JOBS,
  });
  if (error || typeof jobId !== "string" || jobId.length === 0) return null;

  const { data: job } = await db
    .from("faceit_sync_jobs")
    .select("id, player_id, connection_id, type, attempts")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;

  return {
    id: job.id,
    playerId: job.player_id,
    connectionId: job.connection_id,
    type: job.type as FaceitSyncJobType,
    attempts: job.attempts,
  };
}

/** Liveness signal, throttled so it never becomes a write storm. */
function heartbeatWriter(jobId: string) {
  let lastAt = Date.now();
  return async () => {
    if (Date.now() - lastAt < FACEIT_HEARTBEAT_INTERVAL_MS) return;
    lastAt = Date.now();
    const db = await admin();
    await db
      .from("faceit_sync_jobs")
      .update({ heartbeat_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "processing");
  };
}

export interface JobOutcome {
  jobId: string;
  status: "completed" | "failed" | "retrying";
  errorCode?: string;
}

/** Runs an already-claimed job and writes its terminal state. */
export async function processClaimedFaceitSyncJob(
  job: ClaimedFaceitJob,
  options: { deadlineAt?: number; apiCallBudget?: number } = {},
): Promise<JobOutcome> {
  const db = await admin();
  console.info(`[faceit] sync_started job=${job.id} type=${job.type}`);

  try {
    const counters = await runFaceitSync(job.playerId, job.connectionId, job.type, {
      apiCallBudget: options.apiCallBudget ?? FACEIT_JOB_API_CALL_BUDGET,
      ...(options.deadlineAt === undefined ? {} : { deadlineAt: options.deadlineAt }),
      heartbeat: heartbeatWriter(job.id),
    });

    console.info(
      `[faceit] sync_completed job=${job.id} type=${job.type} found=${counters.matchesFound} inserted=${counters.matchesInserted} updated=${counters.matchesUpdated} existed=${counters.matchesAlreadyExisted} skipped=${counters.matchesSkipped} failed=${counters.matchesFailed} deferred=${counters.matchesDeferred} truncated=${counters.historyTruncated} budget_exhausted=${counters.budgetExhausted} api_calls=${counters.apiCalls} ms=${counters.durationMs}`,
    );

    const now = new Date().toISOString();
    await db
      .from("faceit_sync_jobs")
      .update({
        status: "completed",
        finished_at: now,
        updated_at: now,
        heartbeat_at: null,
        matches_found: counters.matchesFound,
        matches_new: counters.matchesInserted,
        matches_updated: counters.matchesUpdated,
        matches_skipped: counters.matchesSkipped,
        last_error: null,
        metadata: {
          already_existed: counters.matchesAlreadyExisted,
          failed: counters.matchesFailed,
          deferred: counters.matchesDeferred,
          history_truncated: counters.historyTruncated,
          budget_exhausted: counters.budgetExhausted,
          api_calls: counters.apiCalls,
          duration_ms: counters.durationMs,
        } as never,
      })
      .eq("id", job.id);

    // Work left behind is resumed by the next scheduled incremental run; we do
    // NOT self-enqueue, so a truncated window can never become a hot loop.
    return { jobId: job.id, status: "completed" };
  } catch (error) {
    const faceitError = toFaceitError(error);
    const attempts = job.attempts + 1;
    const retryable = faceitError.retryable && attempts < FACEIT_MAX_JOB_ATTEMPTS;
    const backoffSeconds = Math.min((faceitError.retryAfterSeconds ?? 30) * attempts, 15 * 60);
    const now = new Date().toISOString();

    await db
      .from("faceit_sync_jobs")
      .update({
        status: retryable ? "retrying" : "failed",
        attempts,
        last_error: faceitError.code,
        heartbeat_at: null,
        next_attempt_at: retryable
          ? new Date(Date.now() + backoffSeconds * 1000).toISOString()
          : null,
        finished_at: retryable ? null : now,
        updated_at: now,
      })
      .eq("id", job.id);

    await db
      .from("player_connections")
      .update({
        last_sync_status: retryable ? "retrying" : "error",
        last_sync_error: faceitError.code,
        updated_at: now,
      })
      .eq("id", job.connectionId);

    console.warn(
      `[faceit] sync_failed job=${job.id} code=${faceitError.code} attempts=${attempts} retrying=${retryable}`,
    );
    return {
      jobId: job.id,
      status: retryable ? "retrying" : "failed",
      errorCode: faceitError.code,
    };
  }
}

/** Claims and processes the next runnable job. Returns null when idle. */
export async function processNextFaceitSyncJob(
  options: { deadlineAt?: number } = {},
): Promise<JobOutcome | null> {
  const job = await claimNextFaceitSyncJob();
  if (!job) return null;
  return processClaimedFaceitSyncJob(job, options);
}

export interface WorkerResult {
  recovered: number;
  processed: JobOutcome[];
  /** The worker stopped because its time/job budget ran out, not because idle. */
  budgetReached: boolean;
}

/**
 * THE worker. Invoked by the authenticated cron route.
 *
 * It recovers stale jobs, then processes jobs one at a time while its explicit
 * wall-clock and job budget allows, and returns gracefully well before the edge
 * timeout. A job interrupted by the runtime is picked up by stale recovery.
 */
export async function runFaceitSyncWorker(
  options: { timeBudgetMs?: number; maxJobs?: number } = {},
): Promise<WorkerResult> {
  const timeBudgetMs = Math.max(1_000, options.timeBudgetMs ?? FACEIT_WORKER_TIME_BUDGET_MS);
  const maxJobs = Math.max(1, options.maxJobs ?? FACEIT_WORKER_MAX_JOBS);
  const deadlineAt = Date.now() + timeBudgetMs;

  const recovered = await recoverStaleFaceitSyncJobs();
  const processed: JobOutcome[] = [];
  let budgetReached = false;

  while (processed.length < maxJobs) {
    // Never start a job with almost no time left: reserve a slice for one match.
    if (Date.now() > deadlineAt - 2_000) {
      budgetReached = true;
      break;
    }
    const job = await claimNextFaceitSyncJob();
    if (!job) break;
    processed.push(await processClaimedFaceitSyncJob(job, { deadlineAt }));
  }

  if (processed.length >= maxJobs) budgetReached = true;
  return { recovered, processed, budgetReached };
}

/* -------------------------------------------------------------------------- */
/* Synchronisation                                                             */
/* -------------------------------------------------------------------------- */

export interface RunSyncOptions {
  /** Hard ceiling of Data API calls this run may spend. */
  apiCallBudget?: number;
  /** Epoch ms after which the run must stop gracefully. */
  deadlineAt?: number;
  /** Liveness callback, invoked between matches. */
  heartbeat?: () => Promise<void> | void;
}

/**
 * Incremental synchronisation.
 *
 *  1. refresh the public profile (cached: `FACEIT_PROFILE_CACHE_MINUTES`);
 *  2. read the recent history with bounded pagination, using an overlapping
 *     `from` window on incremental runs so no match is lost at the boundary;
 *  3. classify each match as converged / pending;
 *  4. fetch details + stats for pending matches only, within budget;
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
  options: RunSyncOptions = {},
): Promise<SyncCounters> {
  const startedAt = Date.now();
  const db = await admin();
  const { client, config } = faceitRuntime();
  const apiCallBudget = Math.max(4, options.apiCallBudget ?? FACEIT_JOB_API_CALL_BUDGET);
  const counters = emptyCounters();

  const outOfBudget = (reserve: number): boolean => {
    if (client.requestCount + reserve > apiCallBudget) return true;
    return options.deadlineAt !== undefined && Date.now() > options.deadlineAt;
  };

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

  let profileFields: {
    external_username: string | null;
    profile_url: string | null;
    metadata: Record<string, unknown>;
  } | null = null;
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

  counters.matchesFound = history.items.length;
  counters.historyTruncated = history.truncated;
  if (history.truncated) {
    console.info(`[faceit] history_truncated reason=${history.stopReason} pages=${history.pages}`);
  }

  // 3. classify what we already have. `source_complete` is authoritative: it is
  //    how a match that FACEIT will never complete stops being re-fetched.
  const ids = history.items.map((item) => item.match_id);
  const known = new Map<string, { id: string; complete: boolean; attempts: number }>();
  if (ids.length > 0) {
    const { data: rows } = await db
      .from("matches")
      .select("id, external_match_id, source_complete, source_fetch_attempts")
      .eq("player_id", playerId)
      .eq("data_source", "faceit")
      .in("external_match_id", ids);

    for (const row of rows ?? []) {
      if (!row.external_match_id) continue;
      known.set(row.external_match_id, {
        id: row.id,
        complete: row.source_complete === true,
        attempts: row.source_fetch_attempts ?? 0,
      });
    }
  }

  // 4./5. details + stats for pending matches only, inside the budget.
  for (const item of history.items) {
    const existing = known.get(item.match_id) ?? null;
    if (existing?.complete && jobType !== "manual") {
      counters.matchesSkipped += 1;
      continue;
    }

    // Each match costs two calls (details + stats). Stop cleanly, never halfway.
    if (outOfBudget(2)) {
      counters.budgetExhausted = true;
      counters.matchesDeferred += 1;
      continue;
    }
    await options.heartbeat?.();

    try {
      const details = await fetchFaceitMatchDetails(client, item.match_id);
      const stats = await fetchFaceitMatchStats(client, item.match_id);
      const mapFromStats = stats ? faceitMapFromStats(stats, item.match_id) : null;

      const canonical = mapFaceitMatchToMatch({
        playerId: faceitPlayerId,
        history: item,
        details,
        sourceVersion,
        gameId: config.gameId,
        mapFromStats,
      });
      if (!canonical) {
        counters.matchesFailed += 1;
        continue;
      }

      const metadata = canonical.metadata as Record<string, unknown>;
      const isSeries = metadata["is_series"] === true;
      const statusText =
        typeof metadata["status"] === "string" ? metadata["status"].toLowerCase() : null;
      // Only a finished match burns an attempt: an ongoing one is not "missing".
      const finished = statusText === "finished" || canonical.match_date !== null;
      const attempts = (existing?.attempts ?? 0) + (finished ? 1 : 0);

      const metrics =
        stats === null ? null : mapFaceitMatchStatsToMetrics(stats, faceitPlayerId, item.match_id);

      const dataComplete =
        canonical.result !== null &&
        canonical.match_date !== null &&
        metrics !== null &&
        (canonical.map !== null || isSeries);
      // CONVERGENCE: either the data is complete, or we tried enough times and
      // accept the row as-is with NULL in the missing fields. Never a zero.
      const converged = dataComplete || (finished && attempts >= FACEIT_MAX_MATCH_FETCH_ATTEMPTS);

      const writable = {
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
        source_complete: converged,
        source_fetch_attempts: attempts,
      };

      let matchId = existing?.id ?? null;
      if (matchId) {
        await db
          .from("matches")
          .update(writable)
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
            ...writable,
          })
          .select("id")
          .maybeSingle();

        if (error) {
          // Concurrent sync already inserted it: idempotent, not a failure and
          // NOT an update — the honest counter is `alreadyExisted`.
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
          counters.matchesAlreadyExisted += 1;
        } else {
          matchId = inserted?.id ?? null;
          counters.matchesInserted += 1;
        }
      }

      if (!matchId) {
        counters.matchesFailed += 1;
        continue;
      }

      // Match stats are frequently unavailable; absence is null, never zero.
      if (metrics) {
        await db
          .from("match_metrics")
          .upsert(
            { match_id: matchId, player_id: playerId, ...metrics },
            { onConflict: "match_id,player_id" },
          );
      }
    } catch (error) {
      const faceitError = toFaceitError(error);
      // A transient upstream failure must fail the JOB (so it is retried with
      // backoff); anything else is recorded against this single match only.
      if (faceitError.retryable) throw faceitError;
      counters.matchesFailed += 1;
      console.warn(`[faceit] match_skipped code=${faceitError.code}`);
    }
  }

  // 6. aggregate/lifetime statistics — FACEIT's own aggregation, clearly tagged.
  const lifetime = outOfBudget(1)
    ? null
    : await safeLifetime(client, faceitPlayerId, config.gameId);

  const now = new Date().toISOString();
  const baseMetadata = profileFields?.metadata ?? previousMetadata;
  const metadata: Record<string, unknown> = {
    ...baseMetadata,
    stats_kind: "aggregate",
    lifetime: lifetime ?? baseMetadata["lifetime"] ?? null,
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
