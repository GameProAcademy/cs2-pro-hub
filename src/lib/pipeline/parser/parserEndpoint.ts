/**
 * FASE 2.7.2 — GATE 1E — PARSER WORKER ↔ APP CONTRACT ALIGNMENT.
 *
 * SINGLE SOURCE OF TRUTH for
 *   1. the parser worker endpoint,
 *   2. the worker error envelope,
 *   3. the HTTP status / worker `error_code` -> pipeline error matrix.
 *
 * `/v1/parse` is NEVER concatenated anywhere in the app: `DEMO_PARSER_URL` must
 * already be the FULL parse endpoint, e.g.
 *   https://cs2-demo-parser-production.up.railway.app/v1/parse
 * A missing, non-HTTPS or non-`/v1/parse` value is a configuration error, never
 * a silent fallback and never "the demo is invalid".
 *
 * No secret lives in this module: the bearer token is read only inside the
 * server-only transport (`remoteParser.server.ts`).
 */
import { PipelineError } from "@/lib/pipeline/errors";

/** Path the worker exposes for parsing. Declared once, concatenated nowhere. */
export const PARSER_PARSE_PATH = "/v1/parse";
/** Worker healthcheck path (no token, no parsing, no storage access). */
export const PARSER_HEALTH_PATH = "/health";
/** Worker identity path: parser name/version/revision + contract version. */
export const PARSER_VERSION_PATH = "/version";

export interface ParserEndpoints {
  /** Full parse endpoint, exactly as configured. */
  parse: string;
  health: string;
  version: string;
  /** Origin only — safe to log, carries no query string or token. */
  origin: string;
}

/**
 * Resolves and VALIDATES the configured parse endpoint.
 * Throws PARSER_CONFIG_ERROR — the only accepted failure for bad configuration.
 */
export function resolveParserEndpoints(rawUrl: string | undefined | null): ParserEndpoints {
  const value = (rawUrl ?? "").trim();
  if (!value) throw new PipelineError("PARSER_CONFIG_ERROR", "DEMO_PARSER_URL is not set");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PipelineError("PARSER_CONFIG_ERROR", "DEMO_PARSER_URL is not a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new PipelineError("PARSER_CONFIG_ERROR", "DEMO_PARSER_URL must use https");
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  if (path !== PARSER_PARSE_PATH) {
    throw new PipelineError(
      "PARSER_CONFIG_ERROR",
      `DEMO_PARSER_URL must end with ${PARSER_PARSE_PATH}`,
    );
  }

  const origin = parsed.origin;
  return {
    parse: `${origin}${PARSER_PARSE_PATH}`,
    health: `${origin}${PARSER_HEALTH_PATH}`,
    version: `${origin}${PARSER_VERSION_PATH}`,
    origin,
  };
}

/** True when the endpoint configuration is usable, without throwing. */
export function isParserEndpointConfigured(rawUrl: string | undefined | null): boolean {
  try {
    resolveParserEndpoints(rawUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * GATE 1E.1 — OFFICIAL WORKER PROTOCOL CODES.
 *
 * This is the documented wire protocol the Railway worker must emit in
 * `detail.error_code`. It exists so APP and worker share ONE matrix instead of
 * two divergent ones; every entry is handled explicitly by
 * `classifyWorkerFailure` (proved by the Gate 1E.1 test suite).
 */
export const WORKER_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "CONTRACT_MISMATCH",
  "SAFE_REPLAY_REQUIRES_RECONCILIATION",
  "UNSUPPORTED_CONTRACT_VERSION",
  "INVALID_DEMO_FORMAT",
  "CORRUPTED_DEMO",
  "UNSUPPORTED_DEMO",
  "HASH_MISMATCH",
  "FILE_SIZE_MISMATCH",
  "DEMO_TOO_LARGE",
  "PAYLOAD_TOO_LARGE",
  "DOWNLOAD_ERROR",
  "DOWNLOAD_FAILED",
  "TIMEOUT",
  "PARSE_TIMEOUT",
  "DOWNLOAD_TIMEOUT",
  "PARSER_ERROR",
] as const;

export type WorkerErrorCode = (typeof WORKER_ERROR_CODES)[number];

export interface WorkerErrorEnvelope {
  errorCode: string | null;
  /** Internal-only worker message. Never surfaced to a player. */
  message: string | null;
}

/**
 * The worker is FastAPI: `HTTPException(detail={ error_code, message })` gives
 * `{ "detail": { "error_code": ..., "message": ... } }`. A flat
 * `{ error_code, message }` body is accepted too, so both shapes converge on ONE
 * canonical envelope instead of two parallel readers.
 */
export function extractWorkerError(body: unknown): WorkerErrorEnvelope {
  const read = (source: unknown): WorkerErrorEnvelope | null => {
    if (!source || typeof source !== "object") return null;
    const record = source as { error_code?: unknown; message?: unknown };
    const code = typeof record.error_code === "string" ? record.error_code : null;
    const message = typeof record.message === "string" ? record.message : null;
    if (code == null && message == null) return null;
    return { errorCode: code, message };
  };

  if (!body || typeof body !== "object") return { errorCode: null, message: null };
  const detail = (body as { detail?: unknown }).detail;
  // FastAPI validation errors use `detail: string | array` — still no code.
  return read(detail) ?? read(body) ?? { errorCode: null, message: null };
}

/**
 * ERROR MATRIX — worker `error_code` first, HTTP status as fallback.
 *
 * A transport failure NEVER becomes "invalid demo": 5xx/timeout/network map to
 * transient parser errors, while semantic demo failures stay permanent (see
 * `isPermanentError`, which owns the retryable/non-retryable decision).
 */
export function classifyWorkerFailure(status: number, body: unknown): PipelineError {
  const { errorCode, message } = extractWorkerError(body);
  const detail = `worker status ${status}${errorCode ? ` code ${errorCode}` : ""}${
    message ? `: ${message}` : ""
  }`;

  switch (errorCode) {
    case "SAFE_REPLAY_REQUIRES_RECONCILIATION":
      return new PipelineError("PARSER_CONTRACT_MISMATCH", detail);
    case "UNAUTHORIZED":
      return new PipelineError("PARSER_UNAUTHORIZED", detail);
    case "FORBIDDEN":
      return new PipelineError("PARSER_FORBIDDEN", detail);
    case "CONTRACT_MISMATCH":
    case "UNSUPPORTED_CONTRACT_VERSION":
      return new PipelineError("PARSER_CONTRACT_MISMATCH", detail);
    case "INVALID_DEMO_FORMAT":
      return new PipelineError("INVALID_DEMO_FORMAT", detail);
    case "CORRUPTED_DEMO":
      return new PipelineError("CORRUPTED_DEMO", detail);
    case "UNSUPPORTED_DEMO":
      return new PipelineError("UNSUPPORTED_DEMO", detail);
    case "HASH_MISMATCH":
      return new PipelineError("PARSER_HASH_MISMATCH", detail);
    case "FILE_SIZE_MISMATCH":
      return new PipelineError("PARSER_FILE_SIZE_MISMATCH", detail);
    case "DEMO_TOO_LARGE":
      return new PipelineError("DEMO_TOO_LARGE", detail);
    // The worker response itself was too large. This is deliberately distinct
    // from an input .dem that exceeds the ingestion ceiling.
    case "PAYLOAD_TOO_LARGE":
      return new PipelineError("PARSER_PAYLOAD_TOO_LARGE", detail);
    case "DOWNLOAD_ERROR":
    case "DOWNLOAD_FAILED":
      return new PipelineError("PARSER_DOWNLOAD_ERROR", detail);
    case "TIMEOUT":
    case "PARSE_TIMEOUT":
    case "DOWNLOAD_TIMEOUT":
      return new PipelineError("PARSER_TIMEOUT", detail);
    case "PARSER_ERROR":
      return new PipelineError("PARSER_ERROR", detail);
    default:
      break;
  }

  if (status === 401) return new PipelineError("PARSER_UNAUTHORIZED", detail);
  if (status === 403) return new PipelineError("PARSER_FORBIDDEN", detail);
  if (status === 409) return new PipelineError("PARSER_CONTRACT_MISMATCH", detail);
  if (status === 408 || status === 504) return new PipelineError("PARSER_TIMEOUT", detail);
  // A bare 413 is intentionally treated as DEMO_TOO_LARGE because without a
  // worker error_code the APP cannot prove whether the input or response limit
  // was exceeded. The real worker always emits one of the two explicit codes.
  if (status === 413) return new PipelineError("DEMO_TOO_LARGE", detail);
  if (status === 400 || status === 422) {
    return new PipelineError("PARSER_INVALID_RESPONSE", detail);
  }
  if (status === 429) return new PipelineError("PARSER_UNAVAILABLE", detail);
  if (status === 502 || status === 503) return new PipelineError("PARSER_UNAVAILABLE", detail);
  if (status >= 500) return new PipelineError("PARSER_ERROR", detail);
  return new PipelineError("PARSER_ERROR", detail);
}

export interface ParserWorkerIdentity {
  name: string;
  version: string;
  revision: string | null;
  semanticRevision: string | null;
  buildRevision: string | null;
  contractVersion: number;
}

/** Validates a `GET /version` payload. Nothing is inferred or fabricated. */
export function parseWorkerIdentity(value: unknown): ParserWorkerIdentity {
  if (!value || typeof value !== "object") {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "empty /version payload");
  }
  const raw = value as {
    parser?: {
      name?: unknown;
      version?: unknown;
      revision?: unknown;
      semantic_revision?: unknown;
      build_revision?: unknown;
    };
    contract_version?: unknown;
  };
  const name = raw.parser?.name;
  const version = raw.parser?.version;
  const contract = raw.contract_version;
  if (typeof name !== "string" || typeof version !== "string" || typeof contract !== "number") {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "/version is missing parser identity");
  }
  const revision = typeof raw.parser?.revision === "string" ? raw.parser.revision.trim() : "";
  const semantic =
    typeof raw.parser?.semantic_revision === "string" ? raw.parser.semantic_revision.trim() : "";
  const build =
    typeof raw.parser?.build_revision === "string" ? raw.parser.build_revision.trim() : "";
  if (semantic && revision && semantic !== revision) {
    throw new PipelineError("PARSER_IDENTITY_MISMATCH", "revision and semantic revision diverge");
  }
  return {
    name,
    version,
    revision: revision.length > 0 ? revision : null,
    semanticRevision: semantic || revision || null,
    buildRevision: build || null,
    contractVersion: contract,
  };
}

/** What this deployment demands from the worker build. */
export interface ExpectedParserIdentity {
  name: string;
  version: string;
  /** Exact worker build. `null` = not pinned by configuration. */
  revision: string | null;
  buildRevision?: string | null;
  buildRevisionRequired?: boolean;
  /** When true, an unpinned or unreported revision fails closed. */
  revisionRequired: boolean;
  contractVersion: number;
}

/**
 * GATE 1E.1 — REVISION LOCK, FAIL CLOSED.
 *
 * Proves `worker.name/version/revision/contract_version` against what this
 * deployment expects. There is no downgrade, no "close enough" acceptance and no
 * silent parser swap: any divergence throws.
 *   - configuration cannot satisfy the lock  -> PARSER_CONFIG_ERROR
 *   - the worker is a different parser build -> PARSER_IDENTITY_MISMATCH
 *   - the worker speaks another contract     -> PARSER_CONTRACT_MISMATCH
 */
export function assertParserIdentity(
  worker: {
    name: string;
    version: string;
    revision: string | null;
    contractVersion?: number | null;
    semanticRevision?: string | null;
    buildRevision?: string | null;
  },
  expected: ExpectedParserIdentity,
): void {
  if (expected.revisionRequired && !expected.revision) {
    throw new PipelineError(
      "PARSER_CONFIG_ERROR",
      "DEMO_PARSER_EXPECTED_REVISION is required in this environment",
    );
  }
  if (worker.name !== expected.name) {
    throw new PipelineError(
      "PARSER_IDENTITY_MISMATCH",
      `parser name mismatch: got ${worker.name}, expected ${expected.name}`,
    );
  }
  if (worker.version !== expected.version) {
    throw new PipelineError(
      "PARSER_IDENTITY_MISMATCH",
      `parser version mismatch: got ${worker.version}, expected ${expected.version}`,
    );
  }
  if (expected.revisionRequired && !worker.revision) {
    throw new PipelineError("PARSER_IDENTITY_MISMATCH", "worker did not report a build revision");
  }
  if (worker.semanticRevision != null && worker.semanticRevision !== worker.revision) {
    throw new PipelineError("PARSER_IDENTITY_MISMATCH", "worker semantic revision mismatch");
  }
  if (expected.revision != null && worker.revision !== expected.revision) {
    throw new PipelineError(
      "PARSER_IDENTITY_MISMATCH",
      `parser revision mismatch: got ${String(worker.revision)}, expected ${expected.revision}`,
    );
  }
  if (expected.buildRevisionRequired && !expected.buildRevision) {
    throw new PipelineError(
      "PARSER_CONFIG_ERROR",
      "DEMO_PARSER_EXPECTED_BUILD_REVISION is required",
    );
  }
  if (expected.buildRevisionRequired && !worker.buildRevision) {
    throw new PipelineError(
      "PARSER_IDENTITY_MISMATCH",
      "worker did not report an exact build revision",
    );
  }
  if (expected.buildRevision != null && worker.buildRevision !== expected.buildRevision) {
    throw new PipelineError("PARSER_IDENTITY_MISMATCH", "parser build revision mismatch");
  }
  if (worker.contractVersion != null && worker.contractVersion !== expected.contractVersion) {
    throw new PipelineError(
      "PARSER_CONTRACT_MISMATCH",
      `expected contract ${expected.contractVersion}, got ${worker.contractVersion}`,
    );
  }
}

/** Binds a parse response to the identity observed from `/version`. */
export function assertParserIdentityConsistency(
  version: ParserWorkerIdentity,
  parsed: {
    name: string;
    version: string;
    revision?: string | undefined;
    semantic_revision?: string | undefined;
    build_revision?: string | null | undefined;
  },
  contractVersion: number,
): void {
  const parsedRevision = parsed.revision?.trim() || null;
  const parsedSemantic = parsed.semantic_revision?.trim() || parsedRevision;
  const parsedBuild = parsed.build_revision?.trim() || null;
  if (
    version.name !== parsed.name ||
    version.version !== parsed.version ||
    version.revision !== parsedRevision ||
    version.semanticRevision !== parsedSemantic ||
    version.buildRevision !== parsedBuild ||
    version.contractVersion !== contractVersion
  ) {
    throw new PipelineError("PARSER_IDENTITY_MISMATCH", "/version and parse identity diverge");
  }
}
