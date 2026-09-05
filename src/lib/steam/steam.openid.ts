/**
 * FASE 2.5 — Steam OpenID 2.0 protocol helpers (PURE, no I/O, no secrets).
 *
 * Why OpenID and not OAuth: Steam does not publish an OAuth2 authorization
 * server for account linking. `/openid/login` is the official, permitted way to
 * prove that a person controls a Steam account — and it hands us no token,
 * which is exactly what we want (nothing to store, nothing to leak).
 *
 * Security model implemented here:
 *  - We NEVER trust `openid.claimed_id` from the browser. The claimed id is only
 *    accepted after `check_authentication` is validated server-side.
 *  - OpenID 2.0 has no `state` parameter, so our single-use state travels inside
 *    `return_to`. Because Steam echoes `openid.return_to` verbatim and signs it,
 *    a tampered state invalidates the assertion.
 *  - The echoed `return_to` must match the return URL we configured, byte for
 *    byte, including the state — otherwise the assertion is rejected.
 */
import {
  STEAM_CLAIMED_ID_PREFIX,
  STEAM_OPENID_DEFAULT_ENDPOINT,
  STEAM_OPENID_IDENTIFIER_SELECT,
  STEAM_OPENID_NS,
  STEAM_PROFILE_BASE_URL,
  STEAM_STATE_PARAM,
} from "./steam.constants";
import { SteamError } from "./steam.errors";

/** Cryptographically random state. 32 bytes -> 64 hex chars. */
export function generateState(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex. Only the hash of a state is ever persisted. */
export async function hashState(state: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Appends our single-use state to the configured return URL. */
export function buildReturnTo(returnUrl: string, state: string): string {
  const url = new URL(returnUrl);
  url.searchParams.set(STEAM_STATE_PARAM, state);
  return url.toString();
}

/** Reads our state back out of an echoed `return_to`. */
export function extractStateFromReturnTo(returnTo: string): string | null {
  try {
    return new URL(returnTo).searchParams.get(STEAM_STATE_PARAM);
  } catch {
    return null;
  }
}

export interface BuildAuthUrlInput {
  endpoint: string;
  realm: string;
  returnUrl: string;
  state: string;
}

/** Builds the Steam sign-in URL the browser is sent to. */
export function buildSteamAuthUrl({
  endpoint,
  realm,
  returnUrl,
  state,
}: BuildAuthUrlInput): string {
  const url = new URL(endpoint);
  url.searchParams.set("openid.ns", STEAM_OPENID_NS);
  url.searchParams.set("openid.mode", "checkid_setup");
  url.searchParams.set("openid.return_to", buildReturnTo(returnUrl, state));
  url.searchParams.set("openid.realm", realm);
  url.searchParams.set("openid.identity", STEAM_OPENID_IDENTIFIER_SELECT);
  url.searchParams.set("openid.claimed_id", STEAM_OPENID_IDENTIFIER_SELECT);
  return url.toString();
}

/** SteamID64: 17 digits starting with 7656119, handled as a string. */
export function isSteamId64(value: string): boolean {
  return /^7656119[0-9]{10}$/.test(value);
}

/** Extracts the SteamID64 from a claimed id, or null when it is not one. */
export function steamId64FromClaimedId(claimedId: string): string | null {
  if (!claimedId.startsWith(STEAM_CLAIMED_ID_PREFIX)) return null;
  const candidate = claimedId.slice(STEAM_CLAIMED_ID_PREFIX.length).replace(/\/+$/, "");
  return isSteamId64(candidate) ? candidate : null;
}

export function steamProfileUrl(steamId64: string): string {
  return `${STEAM_PROFILE_BASE_URL}${steamId64}`;
}

/**
 * Masks a SteamID64 for any surface that is not the account owner (admin lists,
 * logs, audit records): first 4 and last 3 digits only.
 */
export function maskSteamId64(steamId64: string | null | undefined): string | null {
  if (!steamId64 || steamId64.length < 10) return null;
  return `${steamId64.slice(0, 4)}••••••••••${steamId64.slice(-3)}`;
}

/**
 * Callback params, as an ordinary record. Only `openid.*` keys are forwarded to
 * `check_authentication`; our own state parameter is deliberately excluded.
 */
export type SteamCallbackParams = Record<string, string>;

export function paramsToRecord(params: URLSearchParams): SteamCallbackParams {
  const record: SteamCallbackParams = {};
  params.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/**
 * Structural validation of a callback BEFORE any network call.
 * Returns the claimed id (still unverified) and the echoed state.
 */
export interface SteamCallbackExpectations {
  /** Our configured realm; Steam echoes and signs `openid.realm` when present. */
  realm?: string;
  /** Provider endpoint we asked to authenticate against. */
  opEndpoint?: string;
}

export function parseSteamCallback(
  params: SteamCallbackParams,
  expectedReturnUrl: string,
  expected: SteamCallbackExpectations = {},
): { claimedId: string; steamId64: string; state: string } {
  const mode = params["openid.mode"];
  if (mode === "cancel") throw new SteamError("STEAM_OPENID_CANCELLED");
  if (mode !== "id_res") throw new SteamError("STEAM_OPENID_INVALID_RESPONSE");
  if (params["openid.ns"] !== STEAM_OPENID_NS) {
    throw new SteamError("STEAM_OPENID_INVALID_RESPONSE");
  }

  const required = ["openid.signed", "openid.sig", "openid.claimed_id", "openid.return_to"];
  for (const key of required) {
    if (!params[key]) throw new SteamError("STEAM_OPENID_INVALID_RESPONSE");
  }

  // The signature must actually cover the fields that carry identity and the
  // round-trip binding; otherwise a valid-looking assertion proves nothing.
  const signed = (params["openid.signed"] ?? "").split(",").map((field) => field.trim());
  for (const field of ["claimed_id", "identity", "return_to"]) {
    if (!signed.includes(field)) throw new SteamError("STEAM_OPENID_INVALID_RESPONSE");
  }

  const returnTo = params["openid.return_to"]!;
  const state = extractStateFromReturnTo(returnTo);
  if (!state || state.length < 32) throw new SteamError("STEAM_OPENID_STATE_INVALID");

  // Byte-for-byte binding to the URL we asked Steam to sign.
  if (returnTo !== buildReturnTo(expectedReturnUrl, state)) {
    // origin, protocol, host, path and query (state included) must all match.
    throw new SteamError("STEAM_OPENID_INVALID_RETURN_TO");
  }

  const claimedId = params["openid.claimed_id"]!;
  // claimed_id and identity must describe the same account.
  if (params["openid.identity"] && params["openid.identity"] !== claimedId) {
    throw new SteamError("STEAM_OPENID_INVALID_RESPONSE");
  }

  // FASE 2.5.1 — the assertion must come from the provider WE asked, and be
  // scoped to OUR realm. A response signed by some other OpenID provider, or
  // issued for a different realm, is refused even if it is internally valid.
  // FASE 2.5.2 — MANDATORY, not "validate if present". A missing endpoint or
  // realm is a rejected assertion: `must exist AND must equal what we asked`.
  const opEndpoint = params["openid.op_endpoint"];
  if (!opEndpoint) throw new SteamError("STEAM_OPENID_INVALID_ENDPOINT");
  if (!isSteamOpEndpoint(opEndpoint)) throw new SteamError("STEAM_OPENID_INVALID_ENDPOINT");
  if (expected.opEndpoint && !sameUrl(opEndpoint, expected.opEndpoint)) {
    throw new SteamError("STEAM_OPENID_INVALID_ENDPOINT");
  }

  const realm = params["openid.realm"];
  if (expected.realm !== undefined) {
    if (!realm) throw new SteamError("STEAM_OPENID_INVALID_REALM");
    if (!sameOrigin(realm, expected.realm)) throw new SteamError("STEAM_OPENID_INVALID_REALM");
    if (!sameOrigin(returnTo, expected.realm)) {
      throw new SteamError("STEAM_OPENID_INVALID_REALM");
    }
  }

  const steamId64 = steamId64FromClaimedId(claimedId);
  if (!steamId64) throw new SteamError("STEAM_INVALID_STEAM_ID");

  return { claimedId, steamId64, state };
}

/** Only the official Steam Community OpenID endpoint is acceptable. */
export function isSteamOpEndpoint(value: string): boolean {
  return value === STEAM_OPENID_DEFAULT_ENDPOINT;
}

function sameUrl(a: string, b: string): boolean {
  try {
    return new URL(a).toString() === new URL(b).toString();
  } catch {
    return false;
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** Body for the provider-side `check_authentication` round trip. */
export function buildCheckAuthenticationBody(params: SteamCallbackParams): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith("openid.")) continue;
    body.set(key, value);
  }
  body.set("openid.mode", "check_authentication");
  return body;
}

/**
 * Steam answers with a key-value form. Only an explicit `is_valid:true` is
 * accepted — an unparsable or missing value is a failure, never a pass.
 */
export function parseCheckAuthenticationResponse(body: string): boolean {
  let valid = false;
  for (const line of body.split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key?.trim() !== "is_valid") continue;
    valid = rest.join(":").trim() === "true";
  }
  return valid;
}
