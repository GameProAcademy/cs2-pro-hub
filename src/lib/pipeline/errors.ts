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
  // FASE 2.7.2 GATE 1E — parser worker transport/contract taxonomy. A transport
  // or configuration failure is never reported as an invalid demo.
  "PARSER_CONFIG_ERROR",
  "PARSER_UNAUTHORIZED",
  "PARSER_FORBIDDEN",
  "PARSER_CONTRACT_MISMATCH",
  "PARSER_INVALID_RESPONSE",
  "PARSER_DOWNLOAD_ERROR",
  "PARSER_HASH_MISMATCH",
  "PARSER_FILE_SIZE_MISMATCH",
  // FASE 2.7.2 GATE 1E.1 — REVISION LOCK. The deployed worker is not the parser
  // build this deployment expects (name, version or revision). Fail closed: a
  // silent parser swap or downgrade must never analyse a player's demo.
  "PARSER_IDENTITY_MISMATCH",
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
  "RAW_AUDIT_BLOCKED",
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
  // A payload above the ceiling will be above it on every retry.
  "PARSER_PAYLOAD_TOO_LARGE",
  // The demo will never gain rounds by being parsed again.
  "DEMO_INSUFFICIENT_SAMPLE",
  "RESOURCE_LIMIT",
  // GATE 1E — retrying cannot fix configuration, credentials, a contract
  // mismatch, a structurally invalid response or an integrity mismatch.
  "PARSER_CONFIG_ERROR",
  "PARSER_UNAUTHORIZED",
  "PARSER_FORBIDDEN",
  "PARSER_CONTRACT_MISMATCH",
  "PARSER_INVALID_RESPONSE",
  "PARSER_HASH_MISMATCH",
  "PARSER_FILE_SIZE_MISMATCH",
  // GATE 1E.1 — a mismatched parser build stays mismatched on every retry.
  "PARSER_IDENTITY_MISMATCH",
  "RAW_AUDIT_BLOCKED",
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
