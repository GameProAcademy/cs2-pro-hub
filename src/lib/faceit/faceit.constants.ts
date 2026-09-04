/**
 * FASE 2.2.1 — pure FACEIT constants.
 *
 * Kept out of `faceit.config.server.ts` so browser-safe and test code can read
 * documented limits without importing a server-only module (no env, no secret).
 */

/** Default Data API base. Documented and stable; still overridable by env. */
export const FACEIT_DEFAULT_API_BASE_URL = "https://open.faceit.com/data/v4";
/** Default game identifier for Counter-Strike 2. */
export const FACEIT_DEFAULT_GAME_ID = "cs2";
export const FACEIT_DEFAULT_SYNC_MATCH_LIMIT = 20;
export const FACEIT_DEFAULT_SYNC_MAX_PAGES = 5;
export const FACEIT_DEFAULT_TIMEOUT_MS = 12_000;
export const FACEIT_DEFAULT_MAX_RETRIES = 3;
/** Data API hard limits (documented): 100 items per page, offset up to 1000. */
export const FACEIT_HISTORY_MAX_LIMIT = 100;
export const FACEIT_HISTORY_MAX_OFFSET = 1000;
/** OAuth state time-to-live. */
export const FACEIT_OAUTH_STATE_TTL_SECONDS = 600;
/**
 * Incremental overlap (seconds) applied to the FACEIT `from` window so a match
 * finishing exactly at the boundary is never lost. Deduplication absorbs it.
 */
export const FACEIT_SYNC_OVERLAP_SECONDS = 3600;
/** Profile cache window: the dashboard reads our database, not FACEIT. */
export const FACEIT_PROFILE_CACHE_MINUTES = 20;

/* ---------------------------------------------------------------------------
 * FASE 2.2.1C — job engine / worker budget.
 *
 * A user request only ENQUEUES; the cron worker executes. Every bound below
 * exists so a dead worker, a slow API or a hostile payload cannot produce a
 * stuck job, an infinite retry loop or an unbounded burst of API calls.
 * ------------------------------------------------------------------------- */

/** A `processing` job whose heartbeat is older than this is considered dead. */
export const FACEIT_JOB_STALE_SECONDS = 300;
/** Attempts (including stale recoveries) before a job is failed for good. */
export const FACEIT_MAX_JOB_ATTEMPTS = 3;
/** Global ceiling of simultaneously `processing` FACEIT jobs. */
export const FACEIT_MAX_CONCURRENT_JOBS = 1;
/** Hard ceiling of Data API calls a single job may spend. */
export const FACEIT_JOB_API_CALL_BUDGET = 60;
/** Wall-clock budget for one worker invocation (well under the edge timeout). */
export const FACEIT_WORKER_TIME_BUDGET_MS = 20_000;
/** Jobs a single worker invocation may process before returning. */
export const FACEIT_WORKER_MAX_JOBS = 2;
/** How often the worker refreshes `heartbeat_at` while a job runs. */
export const FACEIT_HEARTBEAT_INTERVAL_MS = 10_000;
/** Minimum spacing between two Data API calls, to avoid needless bursts. */
export const FACEIT_MIN_CALL_SPACING_MS = 120;
/**
 * How many times we may re-fetch the same match trying to complete it. Once
 * exhausted the match is stored with the available fields (missing stays NULL)
 * and marked as converged, so the sync can never loop on it forever.
 */
export const FACEIT_MAX_MATCH_FETCH_ATTEMPTS = 3;
