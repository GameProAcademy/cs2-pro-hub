/**
 * Structured pipeline error codes.
 *
 * These codes are the ONLY processing failure information exposed to a player.
 * Stack traces, internal paths and parser internals never cross the boundary.
 */
export const PIPELINE_ERROR_CODES = [
  "DEMO_TOO_LARGE",
  "DEMO_TOO_SMALL",
  "INVALID_DEMO_FORMAT",
  "CORRUPTED_DEMO",
  "UNSUPPORTED_DEMO",
  "DEMO_NOT_FOUND",
  "PARSER_UNAVAILABLE",
  "PARSER_ERROR",
  "PARSER_TIMEOUT",
  "NORMALIZATION_ERROR",
  "VALIDATION_ERROR",
  "PERSISTENCE_ERROR",
  "PLAYER_IDENTITY_UNRESOLVED",
  "PROCESSING_ERROR",
  "CLEANUP_ERROR",
] as const;

export type PipelineErrorCode = (typeof PIPELINE_ERROR_CODES)[number];

/**
 * Permanent failures: retrying cannot change the outcome, so the job stops.
 * Everything else is treated as transient and eligible for controlled retry.
 */
const PERMANENT: ReadonlySet<PipelineErrorCode> = new Set([
  "DEMO_TOO_LARGE",
  "DEMO_TOO_SMALL",
  "INVALID_DEMO_FORMAT",
  "CORRUPTED_DEMO",
  "UNSUPPORTED_DEMO",
  "VALIDATION_ERROR",
  "PLAYER_IDENTITY_UNRESOLVED",
]);

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;
  /** Internal-only detail. Never returned to the client. */
  readonly detail: string | undefined;

  constructor(code: PipelineErrorCode, detail?: string) {
    super(code);
    this.name = "PipelineError";
    this.code = code;
    this.detail = detail;
  }

  get permanent(): boolean {
    return isPermanentError(this.code);
  }
}

export function isPermanentError(code: PipelineErrorCode): boolean {
  return PERMANENT.has(code);
}

/** Never leaks internals: unknown throwables collapse to PROCESSING_ERROR. */
export function toPipelineError(error: unknown): PipelineError {
  if (error instanceof PipelineError) return error;
  return new PipelineError("PROCESSING_ERROR", error instanceof Error ? error.message : undefined);
}
