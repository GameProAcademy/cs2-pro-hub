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
    case "PAYLOAD_TOO_LARGE":
      return new PipelineError("DEMO_TOO_LARGE", detail);
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
  if (status === 413) return new PipelineError("DEMO_TOO_LARGE", detail);
  // 400/422 without a code is a REQUEST contract problem, not a broken demo.
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
  contractVersion: number;
}

/** Validates a `GET /version` payload. Nothing is inferred or fabricated. */
export function parseWorkerIdentity(value: unknown): ParserWorkerIdentity {
  if (!value || typeof value !== "object")
    throw new PipelineError("PARSER_INVALID_RESPONSE", "empty /version payload");
  const raw = value as {
    parser?: { name?: unknown; version?: unknown; revision?: unknown };
    contract_version?: unknown;
  };
  const name = raw.parser?.name;
  const version = raw.parser?.version;
  const contract = raw.contract_version;
  if (typeof name !== "string" || typeof version !== "string" || typeof contract !== "number") {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "/version is missing parser identity");
  }
  return {
    name,
    version,
    revision: typeof raw.parser?.revision === "string" ? raw.parser.revision : null,
    contractVersion: contract,
  };
}
