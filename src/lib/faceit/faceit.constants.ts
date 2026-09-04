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
/** Profile cache window: the dashboard reads our database, not FACEIT. */
export const FACEIT_PROFILE_CACHE_MINUTES = 20;
