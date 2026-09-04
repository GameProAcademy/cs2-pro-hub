/**
 * Gamers Club — external access classification and health.
 *
 * A block is NOT a missing profile. HTTP 403 + a Cloudflare challenge means
 * "this environment is not allowed to read the page", which we record as
 * BLOCKED_EXTERNAL_ACCESS and never as NOT_FOUND.
 */
import type { GamersClubErrorCode } from "./gamersclub.errors";

export const GC_ACCESS_STATUSES = [
  "available",
  "blocked_external_access",
  "rate_limited",
  "timeout",
  "invalid_response",
  "not_found",
  "unsupported",
  "unknown_error",
] as const;

export type GamersClubAccessStatus = (typeof GC_ACCESS_STATUSES)[number];

export interface GamersClubResponseFacts {
  status: number;
  /** Lower-cased header lookup; only non-sensitive headers are inspected. */
  headers?: Record<string, string | null | undefined>;
  /** First bytes of the body, used only for challenge detection. */
  bodySample?: string;
}

const CHALLENGE_MARKERS = [
  "just a moment",
  "cf-browser-verification",
  "attention required",
  "checking your browser",
  "cf_chl_opt",
];

function header(facts: GamersClubResponseFacts, name: string): string {
  const raw = facts.headers?.[name] ?? facts.headers?.[name.toLowerCase()];
  return (raw ?? "").toLowerCase();
}

/** Classifies a real HTTP response into an honest access status. */
export function classifyGamersClubResponse(facts: GamersClubResponseFacts): GamersClubAccessStatus {
  const mitigated = header(facts, "cf-mitigated");
  const server = header(facts, "server");
  const body = (facts.bodySample ?? "").toLowerCase();
  const challenged =
    mitigated.includes("challenge") ||
    CHALLENGE_MARKERS.some((marker) => body.includes(marker)) ||
    (server.includes("cloudflare") && (facts.status === 403 || facts.status === 503));

  if (facts.status === 429) return challenged ? "blocked_external_access" : "rate_limited";
  if (challenged) return "blocked_external_access";
  if (facts.status === 401 || facts.status === 403) return "blocked_external_access";
  if (facts.status === 404 || facts.status === 410) return "not_found";
  if (facts.status === 408 || facts.status === 504) return "timeout";
  if (facts.status >= 500) return "unknown_error";
  if (facts.status >= 400) return "invalid_response";
  if (facts.status >= 200 && facts.status < 300) return "available";
  return "unknown_error";
}

export function accessStatusToErrorCode(status: GamersClubAccessStatus): GamersClubErrorCode {
  switch (status) {
    case "blocked_external_access":
      return "GC_BLOCKED_EXTERNAL_ACCESS";
    case "rate_limited":
      return "GC_RATE_LIMITED";
    case "timeout":
      return "GC_TIMEOUT";
    case "invalid_response":
      return "GC_INVALID_RESPONSE";
    case "not_found":
      return "GC_NOT_FOUND";
    case "unsupported":
      return "GC_UNSUPPORTED";
    case "available":
    case "unknown_error":
    default:
      return "GC_UNKNOWN_ERROR";
  }
}

/** A single diagnostic observation. Sanitized: no cookies, no bodies, no PII. */
export interface GamersClubHealthProbe {
  operation: string;
  status: GamersClubAccessStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  requestId: string | null;
  observedAt: string;
  /** Machine-readable, sanitized reason. Never a raw provider message. */
  errorCode: GamersClubErrorCode | null;
}

export interface GamersClubHealthProbeInput {
  operation: string;
  facts?: GamersClubResponseFacts;
  status?: GamersClubAccessStatus;
  latencyMs?: number | null;
  requestId?: string | null;
  observedAt?: string;
}

const REQUEST_ID_SHAPE = /^[A-Za-z0-9_.:-]{1,64}$/;

export function recordGamersClubProbe(input: GamersClubHealthProbeInput): GamersClubHealthProbe {
  const status = input.status ?? (input.facts ? classifyGamersClubResponse(input.facts) : "unknown_error");
  const requestId =
    input.requestId && REQUEST_ID_SHAPE.test(input.requestId) ? input.requestId : null;
  return {
    operation: input.operation,
    status,
    httpStatus: input.facts?.status ?? null,
    latencyMs: input.latencyMs ?? null,
    requestId,
    observedAt: input.observedAt ?? new Date().toISOString(),
    errorCode: status === "available" ? null : accessStatusToErrorCode(status),
  };
}
