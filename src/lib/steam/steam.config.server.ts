/**
 * FASE 2.5 — Steam configuration (SERVER ONLY).
 *
 * Four environment variables, all server-side, none of them ever returned to a
 * browser:
 *
 *   STEAM_OPENID_REALM      e.g. https://app.example.com
 *   STEAM_OPENID_RETURN_URL e.g. https://app.example.com/api/public/integrations/steam/callback
 *   STEAM_OPENID_ENDPOINT   optional override of the official provider endpoint
 *   STEAM_WEB_API_KEY       optional; only enables PUBLIC profile enrichment
 *
 * `steamConfigStatus()` returns BOOLEANS ONLY. No caller can read a value out of
 * it, so it is safe to surface to an admin diagnostics screen.
 *
 * NO KEY IS EVER REQUESTED FROM THE USER HERE, and no value is hardcoded: when
 * the environment is empty the integration reports `not_configured` and the UI
 * renders an honest "unavailable" state instead of a button that cannot work.
 */
import { STEAM_OPENID_DEFAULT_ENDPOINT } from "./steam.constants";
import { SteamError } from "./steam.errors";
import type { SteamIntegrationState } from "./steam.types";

function env(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isHttpsUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Localhost is the only non-HTTPS origin we tolerate, for local development. */
function isLocalUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export interface SteamConfigStatus {
  realm: boolean;
  returnUrl: boolean;
  endpoint: boolean;
  webApiKey: boolean;
  /** Realm and return URL are both HTTPS (or local dev). */
  transportSecure: boolean;
  /** Return URL is inside the realm, as OpenID 2.0 requires. */
  returnUrlInsideRealm: boolean;
  openidReady: boolean;
  webApiReady: boolean;
  state: SteamIntegrationState;
}

export function steamConfigStatus(): SteamConfigStatus {
  const realm = env("STEAM_OPENID_REALM");
  const returnUrl = env("STEAM_OPENID_RETURN_URL");
  const endpoint = env("STEAM_OPENID_ENDPOINT") ?? STEAM_OPENID_DEFAULT_ENDPOINT;
  const webApiKey = env("STEAM_WEB_API_KEY");

  const transportSecure =
    (isHttpsUrl(realm) || isLocalUrl(realm)) &&
    (isHttpsUrl(returnUrl) || isLocalUrl(returnUrl));

  let returnUrlInsideRealm = false;
  if (realm && returnUrl) {
    try {
      returnUrlInsideRealm = new URL(returnUrl).origin === new URL(realm).origin;
    } catch {
      returnUrlInsideRealm = false;
    }
  }

  const openidReady =
    Boolean(realm) &&
    Boolean(returnUrl) &&
    isHttpsUrl(endpoint) &&
    transportSecure &&
    returnUrlInsideRealm;

  const webApiReady = openidReady && Boolean(webApiKey);

  const state: SteamIntegrationState = !openidReady
    ? "not_configured"
    : webApiReady
      ? "available"
      : "configured";

  return {
    realm: Boolean(realm),
    returnUrl: Boolean(returnUrl),
    endpoint: isHttpsUrl(endpoint),
    webApiKey: Boolean(webApiKey),
    transportSecure,
    returnUrlInsideRealm,
    openidReady,
    webApiReady,
    state,
  };
}

export interface SteamOpenIdConfig {
  realm: string;
  returnUrl: string;
  endpoint: string;
}

/** Throws `STEAM_CONFIGURATION_MISSING` instead of guessing any value. */
export function requireSteamOpenIdConfig(): SteamOpenIdConfig {
  const status = steamConfigStatus();
  if (!status.openidReady) throw new SteamError("STEAM_CONFIGURATION_MISSING");
  return {
    realm: env("STEAM_OPENID_REALM")!,
    returnUrl: env("STEAM_OPENID_RETURN_URL")!,
    endpoint: env("STEAM_OPENID_ENDPOINT") ?? STEAM_OPENID_DEFAULT_ENDPOINT,
  };
}

/** The Web API key never leaves this module's callers on the server. */
export function requireSteamWebApiKey(): string {
  const key = env("STEAM_WEB_API_KEY");
  if (!key) throw new SteamError("STEAM_CONFIGURATION_MISSING");
  return key;
}

export function steamSourceVersion(): string {
  return env("STEAM_SOURCE_VERSION") ?? "steam.openid.v1";
}
