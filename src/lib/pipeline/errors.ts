/**
 * Structured pipeline error codes.
 *
 * These codes are the ONLY processing failure information exposed to a player.
 * Stack traces, internal paths and parser internals never cross the boundary.
 */
export const PIPELINE_ERROR_CODES = [
  "DEMO_TOO_LARGE",
  "DEMO_TOO_SMALL",
  "DEMO_EMPTY",
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
  // FASE 2.7 — precise causes instead of a single "processing failed".
  "IDENTITY_RESOLUTION_ERROR",
  "CANONICAL_RESOLUTION_CONFLICT",
  "CANONICAL_PERSISTENCE_ERROR",
  "METRICS_ERROR",
  "FEATURES_ERROR",
  "JOB_TIMEOUT",
  "JOB_STALE",
  // FASE 2.7 — the job's absolute time budget ran out (never silent).
  "JOB_DEADLINE_EXCEEDED",
  // The parser worker answered with more bytes than the pipeline accepts.
  "PARSER_PAYLOAD_TOO_LARGE",
  // The demo is valid but carries too few usable rounds to analyse honestly.
  "DEMO_INSUFFICIENT_SAMPLE",
  "RESOURCE_LIMIT",
  "STORAGE_ERROR",
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
  "DEMO_EMPTY",
  "INVALID_DEMO_FORMAT",
  "CORRUPTED_DEMO",
  "UNSUPPORTED_DEMO",
  "VALIDATION_ERROR",
  "PLAYER_IDENTITY_UNRESOLVED",
  // A human decision is required: two canonical candidates matched EXACT.
  "CANONICAL_RESOLUTION_CONFLICT",
  "RESOURCE_LIMIT",
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
