/**
 * FASE 2.2.1 — structured FACEIT errors.
 *
 * Pure module (no env, no network): every failure becomes a stable machine code.
 * A FACEIT response body is NEVER propagated to the client and never logged raw.
 */

export const FACEIT_ERROR_CODES = [
  "FACEIT_CONFIGURATION_MISSING",
  "FACEIT_API_UNAUTHORIZED",
  "FACEIT_API_FORBIDDEN",
  "FACEIT_RESOURCE_NOT_FOUND",
  "FACEIT_RATE_LIMITED",
  "FACEIT_TEMPORARY_ERROR",
  "FACEIT_TIMEOUT",
  "FACEIT_NETWORK_ERROR",
  "FACEIT_BAD_REQUEST",
  "FACEIT_MALFORMED_RESPONSE",
  "FACEIT_PLAYER_NOT_FOUND",
  "FACEIT_DUPLICATE_ACCOUNT",
  "FACEIT_OAUTH_STATE_INVALID",
  "FACEIT_OAUTH_STATE_EXPIRED",
  "FACEIT_OAUTH_STATE_CONSUMED",
  "FACEIT_OAUTH_MISSING_CODE",
  "FACEIT_OAUTH_ACCESS_DENIED",
  "FACEIT_OAUTH_INVALID_GRANT",
  "FACEIT_OAUTH_FAILED",
  "FACEIT_NOT_CONNECTED",
  "FACEIT_SYNC_IN_PROGRESS",
  "FACEIT_JOB_STALE",
  "FACEIT_INTERNAL_ERROR",
] as const;

export type FaceitErrorCode = (typeof FACEIT_ERROR_CODES)[number];

/** Codes that justify an automatic retry. Nothing else is ever retried. */
const RETRYABLE: ReadonlySet<FaceitErrorCode> = new Set<FaceitErrorCode>([
  "FACEIT_RATE_LIMITED",
  "FACEIT_TEMPORARY_ERROR",
  "FACEIT_TIMEOUT",
  "FACEIT_NETWORK_ERROR",
  // A job abandoned by a dead worker deserves exactly one more chance.
  "FACEIT_JOB_STALE",
]);

export function isRetryableFaceitError(code: FaceitErrorCode): boolean {
  return RETRYABLE.has(code);
}

export class FaceitError extends Error {
  readonly code: FaceitErrorCode;
  /** HTTP status when the failure came from an HTTP response. */
  readonly status?: number;
  /** Seconds advertised by `Retry-After`, when present. */
  readonly retryAfterSeconds?: number;

  constructor(
    code: FaceitErrorCode,
    options: { status?: number; retryAfterSeconds?: number } = {},
  ) {
    // The message is intentionally the code: no external body, no secret.
    super(code);
    this.name = "FaceitError";
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get retryable(): boolean {
    return isRetryableFaceitError(this.code);
  }
}

export function toFaceitError(error: unknown): FaceitError {
  if (error instanceof FaceitError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new FaceitError("FACEIT_TIMEOUT");
  }
  if (error instanceof TypeError) return new FaceitError("FACEIT_NETWORK_ERROR");
  return new FaceitError("FACEIT_INTERNAL_ERROR");
}

/** Maps a Data API HTTP status onto a stable code. */
export function faceitErrorFromStatus(status: number, retryAfterSeconds?: number): FaceitError {
  const options = retryAfterSeconds === undefined ? {} : { retryAfterSeconds };
  if (status === 400) return new FaceitError("FACEIT_BAD_REQUEST", { status });
  if (status === 401) return new FaceitError("FACEIT_API_UNAUTHORIZED", { status });
  if (status === 403) return new FaceitError("FACEIT_API_FORBIDDEN", { status });
  if (status === 404) return new FaceitError("FACEIT_RESOURCE_NOT_FOUND", { status });
  if (status === 429) return new FaceitError("FACEIT_RATE_LIMITED", { status, ...options });
  if (status >= 500) return new FaceitError("FACEIT_TEMPORARY_ERROR", { status, ...options });
  return new FaceitError("FACEIT_BAD_REQUEST", { status });
}

/** OAuth `error` query parameter -> internal code. */
export function faceitErrorFromOAuthParam(oauthError: string | null | undefined): FaceitErrorCode {
  switch ((oauthError ?? "").trim()) {
    case "access_denied":
      return "FACEIT_OAUTH_ACCESS_DENIED";
    case "invalid_grant":
      return "FACEIT_OAUTH_INVALID_GRANT";
    case "server_error":
    case "temporarily_unavailable":
      return "FACEIT_TEMPORARY_ERROR";
    case "invalid_request":
    case "unauthorized_client":
    case "invalid_scope":
    case "unsupported_response_type":
      return "FACEIT_OAUTH_FAILED";
    case "":
      return "FACEIT_OAUTH_FAILED";
    default:
      return "FACEIT_OAUTH_FAILED";
  }
}

/**
 * Short, non-technical reason used in the callback redirect URL.
 * No token, no code, no state, no upstream body ever reaches the URL.
 */
export function callbackReason(code: FaceitErrorCode): string {
  switch (code) {
    case "FACEIT_OAUTH_ACCESS_DENIED":
      return "access_denied";
    case "FACEIT_DUPLICATE_ACCOUNT":
      return "duplicate_account";
    case "FACEIT_OAUTH_STATE_EXPIRED":
    case "FACEIT_OAUTH_INVALID_GRANT":
      return "expired";
    case "FACEIT_OAUTH_STATE_INVALID":
    case "FACEIT_OAUTH_STATE_CONSUMED":
    case "FACEIT_OAUTH_MISSING_CODE":
      return "invalid_request";
    case "FACEIT_CONFIGURATION_MISSING":
      return "configuration_missing";
    case "FACEIT_RATE_LIMITED":
      return "rate_limited";
    case "FACEIT_TEMPORARY_ERROR":
    case "FACEIT_TIMEOUT":
    case "FACEIT_NETWORK_ERROR":
      return "temporary";
    case "FACEIT_PLAYER_NOT_FOUND":
      return "player_not_found";
    default:
      return "error";
  }
}
