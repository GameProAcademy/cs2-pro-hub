/**
 * FASE 2.6.0 — central configuration of the transactional email budget.
 *
 * Nothing in the email layer is allowed to hard-code these values inline.
 */

/** Attempts allowed inside ONE dispatch call (per-call retry window). */
export const MAX_EMAIL_ATTEMPTS_PER_CALL = 3;

/**
 * GLOBAL attempt budget for one logical message (one idempotency key), across
 * every call, retry, worker restart and cron pass. Without this ceiling a
 * message could restart `attempt 1..3` forever, one call at a time.
 */
export const MAX_TOTAL_EMAIL_ATTEMPTS = 9;

/** Base backoff, doubled per attempt, plus jitter. */
export const EMAIL_BACKOFF_BASE_MS = 250;

/** Upper bound honoured for a provider `Retry-After`. */
export const EMAIL_MAX_RETRY_AFTER_MS = 30_000;

/** Lease held while an attempt is in flight; an abandoned row expires with it. */
export const EMAIL_LEASE_SECONDS = 120;
