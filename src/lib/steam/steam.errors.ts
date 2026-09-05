/**
 * FASE 2.5 — Steam error taxonomy.
 *
 * Every failure is a CODE, never an upstream body. Nothing here can leak a
 * SteamID64, a Web API key, a state value or an OpenID signature: the callback
 * redirect only ever carries one of `callbackReason()`'s stable slugs.
 */
export const STEAM_ERROR_CODES = [
  "STEAM_CONFIGURATION_MISSING",
  "STEAM_OPENID_STATE_INVALID",
  "STEAM_OPENID_STATE_EXPIRED",
  "STEAM_OPENID_STATE_CONSUMED",
  "STEAM_OPENID_INVALID_RESPONSE",
  "STEAM_OPENID_INVALID_ENDPOINT",
  "STEAM_OPENID_INVALID_REALM",
  "STEAM_OPENID_INVALID_RETURN_TO",
  "STEAM_OPENID_NOT_VALIDATED",
  "STEAM_OPENID_CANCELLED",
  "STEAM_INVALID_STEAM_ID",
  "STEAM_DUPLICATE_ACCOUNT",
  "STEAM_NOT_CONNECTED",
  "STEAM_PROFILE_UNAVAILABLE",
  "STEAM_RATE_LIMITED",
  "STEAM_CALLBACK_RATE_LIMITED",
  "STEAM_TIMEOUT",
  "STEAM_NETWORK_ERROR",
  "STEAM_TEMPORARY_ERROR",
  "STEAM_INTERNAL_ERROR",
] as const;

export type SteamErrorCode = (typeof STEAM_ERROR_CODES)[number];

export class SteamError extends Error {
  readonly code: SteamErrorCode;
  readonly status?: number;

  constructor(code: SteamErrorCode, options?: { status?: number }) {
    // The message is the code on purpose: it can be logged safely.
    super(code);
    this.name = "SteamError";
    this.code = code;
    if (typeof options?.status === "number") this.status = options.status;
  }
}

export function isSteamError(error: unknown): error is SteamError {
  return error instanceof SteamError;
}

/** HTTP status -> code. Unknown statuses degrade to a temporary error. */
export function steamErrorFromStatus(status: number): SteamError {
  if (status === 429) return new SteamError("STEAM_RATE_LIMITED", { status });
  if (status === 401 || status === 403) {
    return new SteamError("STEAM_CONFIGURATION_MISSING", { status });
  }
  if (status === 404) return new SteamError("STEAM_PROFILE_UNAVAILABLE", { status });
  if (status >= 500) return new SteamError("STEAM_TEMPORARY_ERROR", { status });
  return new SteamError("STEAM_TEMPORARY_ERROR", { status });
}

/** Normalises anything thrown into a SteamError without exposing details. */
export function toSteamError(error: unknown): SteamError {
  if (isSteamError(error)) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new SteamError("STEAM_TIMEOUT");
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new SteamError("STEAM_TIMEOUT");
  }
  if (error instanceof TypeError) return new SteamError("STEAM_NETWORK_ERROR");
  return new SteamError("STEAM_INTERNAL_ERROR");
}

/** Stable, non-sensitive slug used in the callback redirect and in the UI. */
export function callbackReason(code: SteamErrorCode): string {
  switch (code) {
    case "STEAM_CONFIGURATION_MISSING":
      return "configuration_missing";
    case "STEAM_OPENID_CANCELLED":
      return "cancelled";
    case "STEAM_OPENID_STATE_INVALID":
    case "STEAM_OPENID_STATE_EXPIRED":
    case "STEAM_OPENID_STATE_CONSUMED":
      return "state_invalid";
    case "STEAM_OPENID_INVALID_ENDPOINT":
    case "STEAM_OPENID_INVALID_REALM":
    case "STEAM_OPENID_INVALID_RETURN_TO":
    case "STEAM_OPENID_INVALID_RESPONSE":
    case "STEAM_OPENID_NOT_VALIDATED":
    case "STEAM_INVALID_STEAM_ID":
      return "not_validated";
    case "STEAM_DUPLICATE_ACCOUNT":
      return "duplicate_account";
    case "STEAM_CALLBACK_RATE_LIMITED":
      return "rate_limited";
    case "STEAM_NOT_CONNECTED":
      return "not_connected";
    case "STEAM_PROFILE_UNAVAILABLE":
      return "profile_unavailable";
    case "STEAM_RATE_LIMITED":
      return "rate_limited";
    case "STEAM_TIMEOUT":
    case "STEAM_NETWORK_ERROR":
    case "STEAM_TEMPORARY_ERROR":
      return "temporary";
    default:
      return "error";
  }
}
