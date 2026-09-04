/**
 * Gamers Club — constants.
 *
 * SCOPE (read before adding anything here):
 * There is NO official public Gamers Club API for this product, and the public
 * website answers every unauthenticated server-side request with a Cloudflare
 * interstitial challenge (HTTP 403, `cf-mitigated: challenge`). Bypassing it —
 * cookies, session capture, stealth browsers, proxy rotation, CAPTCHA solving,
 * fingerprint evasion — is explicitly forbidden.
 *
 * The architecture below is therefore complete and provider-agnostic: when a
 * permitted, documented access path exists, only a provider implementation is
 * added. No collector is enabled here.
 */

/** Hosts we accept as an official Gamers Club profile location. */
export const GAMERS_CLUB_ALLOWED_HOSTS = ["gamersclub.com.br"] as const;

/** Path prefix of a public player profile: /player/<identifier>. */
export const GAMERS_CLUB_PROFILE_PATH = "player" as const;

/** Version stamps for anything persisted from this module. */
export const GAMERS_CLUB_SOURCE_VERSION = "gamers-club-public-profile/0.2.0" as const;
export const GAMERS_CLUB_COLLECTOR_VERSION = "gc-collector/0.0.0-unavailable" as const;
export const GAMERS_CLUB_PARSER_VERSION = "gc-parser/0.0.0-unavailable" as const;

/**
 * Ownership: a player-supplied public URL proves intent, not identity. Linking
 * a profile NEVER sets `is_verified`; there is no verification method today.
 * The Gamers Club "verified account" badge is about the GC account, never about
 * the GamePro user who typed the URL.
 */
export const GAMERS_CLUB_IDENTITY_VERIFIABLE = false as const;

/* ------------------------------------------------------------------ *
 * HTTP hardening budgets (mirrors the FACEIT client semantics)         *
 * ------------------------------------------------------------------ */

export const GC_DEFAULT_TIMEOUT_MS = 10_000;
export const GC_DEFAULT_MAX_RETRIES = 2;
export const GC_MIN_CALL_SPACING_MS = 250;
/** Hard ceiling for a single wait (backoff or Retry-After). */
export const GC_MAX_RETRY_WAIT_MS = 5_000;
export const GC_JOB_API_CALL_BUDGET = 20;
export const GC_WORKER_TIME_BUDGET_MS = 20_000;
export const GC_HEARTBEAT_INTERVAL_MS = 10_000;
export const GC_JOB_STALE_SECONDS = 300;
export const GC_MAX_JOB_ATTEMPTS = 3;

/** Concurrency ceilings. Deliberately conservative. */
export const GC_MAX_CONCURRENT_JOBS_GLOBAL = 1;
export const GC_MAX_CONCURRENT_JOBS_PER_USER = 1;

/* ------------------------------------------------------------------ *
 * Pagination bounds                                                   *
 * ------------------------------------------------------------------ */

export const GC_HISTORY_PAGE_SIZE = 20;
export const GC_HISTORY_MAX_PAGES = 5;
export const GC_HISTORY_MAX_ITEMS = 100;
export const GC_HISTORY_MAX_OFFSET = 500;
export const GC_HISTORY_DUPLICATE_PAGE_TOLERANCE = 2;

/* ------------------------------------------------------------------ *
 * Cache TTLs, per data kind (minutes)                                 *
 * ------------------------------------------------------------------ */

export const GC_CACHE_TTL_MINUTES = {
  identity: 60 * 24,
  profile: 30,
  match_history: 15,
  match_detail: 60 * 24 * 7,
  stats: 60,
} as const;

export type GamersClubCacheKind = keyof typeof GC_CACHE_TTL_MINUTES;

/**
 * Capability flags. When external access is blocked, only the affected
 * capabilities are disabled — the rest of the app keeps working.
 */
export const GC_FEATURE_FLAGS = {
  GC_PROFILE_ENABLED: false,
  GC_MATCH_HISTORY_ENABLED: false,
  GC_MATCH_DETAILS_ENABLED: false,
  GC_STATS_ENABLED: false,
  GC_AUTO_SYNC_ENABLED: false,
  /** Correlation runs on data we already hold; it needs no external access. */
  GC_IDENTITY_CORRELATION_ENABLED: true,
  /** Architecture only: no importer is wired to a parser in this phase. */
  GC_MANUAL_IMPORT_ENABLED: false,
} as const;

export type GamersClubFeatureFlag = keyof typeof GC_FEATURE_FLAGS;

export function isGamersClubFeatureEnabled(flag: GamersClubFeatureFlag): boolean {
  return GC_FEATURE_FLAGS[flag];
}
