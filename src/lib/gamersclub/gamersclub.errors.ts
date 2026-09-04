/**
 * Gamers Club — structured error codes.
 *
 * Control errors (deadline, budget, cancellation) are FIRST-CLASS: they must
 * reach the job layer and may never be swallowed by a generic `safe*()` helper,
 * nor converted into `success` / `completed` / `source_complete`.
 */
export const GAMERS_CLUB_ERROR_CODES = [
  // URL / input validation
  "GAMERS_CLUB_INVALID_URL",
  "GAMERS_CLUB_UNSUPPORTED_HOST",
  "GAMERS_CLUB_INSECURE_URL",
  "GAMERS_CLUB_URL_CREDENTIALS",
  "GAMERS_CLUB_INVALID_PROFILE_PATH",
  "GAMERS_CLUB_DUPLICATE_ACCOUNT",

  // External access classification
  "GC_BLOCKED_EXTERNAL_ACCESS",
  "GC_RATE_LIMITED",
  "GC_TIMEOUT",
  "GC_INVALID_RESPONSE",
  "GC_NOT_FOUND",
  "GC_UNSUPPORTED",
  "GC_UNKNOWN_ERROR",
  /** No permitted, unauthenticated collection path exists today. */
  "GAMERS_CLUB_PUBLIC_DATA_UNAVAILABLE",

  // Control errors — never swallow these
  "GC_WORKER_DEADLINE_EXCEEDED",
  "GC_API_BUDGET_EXHAUSTED",
  "GC_CANCELLED",

  // Ownership / lifecycle
  "GC_CONNECTION_GONE",
  "GC_CONNECTION_NOT_OWNED",
] as const;

export type GamersClubErrorCode = (typeof GAMERS_CLUB_ERROR_CODES)[number];

/** Control errors: they describe our own execution boundary, not the source. */
const CONTROL_CODES: readonly GamersClubErrorCode[] = [
  "GC_WORKER_DEADLINE_EXCEEDED",
  "GC_API_BUDGET_EXHAUSTED",
  "GC_CANCELLED",
];

/** Transient source conditions where a later retry may legitimately differ. */
const RETRYABLE_CODES: readonly GamersClubErrorCode[] = [
  "GC_RATE_LIMITED",
  "GC_TIMEOUT",
  "GC_UNKNOWN_ERROR",
];

export function isGamersClubControlError(code: GamersClubErrorCode): boolean {
  return CONTROL_CODES.includes(code);
}

export function isRetryableGamersClubError(code: GamersClubErrorCode): boolean {
  return RETRYABLE_CODES.includes(code);
}

export class GamersClubError extends Error {
  readonly code: GamersClubErrorCode;
  readonly status: number | null;

  constructor(code: GamersClubErrorCode, status: number | null = null) {
    super(code);
    this.name = "GamersClubError";
    this.code = code;
    this.status = status;
  }

  get retryable(): boolean {
    return isRetryableGamersClubError(this.code);
  }

  get control(): boolean {
    return isGamersClubControlError(this.code);
  }
}

export function isGamersClubError(value: unknown): value is GamersClubError {
  return value instanceof GamersClubError;
}

/**
 * Wraps a "best effort" step WITHOUT swallowing control errors.
 * A generic try/catch is not acceptable here: an interrupted execution must
 * never look like a successful one.
 */
export async function safeGamersClubStep<T>(
  step: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (isGamersClubError(error) && error.control) throw error;
    return fallback;
  }
}
