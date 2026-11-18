/**
 * FASE 2.2.1 — FACEIT configuration (SERVER ONLY).
 *
 * FACEIT_CLIENT_SECRET and FACEIT_API_KEY are read from `process.env` inside
 * functions, never at module scope, never prefixed with `VITE_`, never returned
 * to the browser. The diagnostics helper exposes `configured / missing` booleans
 * and never a value.
 */
import { FaceitError } from "./faceit.errors";

export * from "./faceit.constants";
import {
  FACEIT_DEFAULT_API_BASE_URL,
  FACEIT_HISTORY_MAX_LIMIT,
  FACEIT_DEFAULT_GAME_ID,
  FACEIT_DEFAULT_MAX_RETRIES,
  FACEIT_DEFAULT_SYNC_MATCH_LIMIT,
  FACEIT_DEFAULT_SYNC_MAX_PAGES,
  FACEIT_DEFAULT_TIMEOUT_MS,
} from "./faceit.constants";

function env(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

/**
 * PM5 — secret names accepted in production. The owner created the PM5 names
 * (`FACEIT_DATA_API_KEY`, `FACEIT_OAUTH_REDIRECT_URI`); the Fase 2.2.1 names still win when set.
 */
const ALIASES: Record<string, string> = {
  FACEIT_API_KEY: "FACEIT_DATA_API_KEY",
  FACEIT_REDIRECT_URI: "FACEIT_OAUTH_REDIRECT_URI",
};

/**
 * PM5 — FACEIT Connect endpoints published by FACEIT's own OpenID discovery document
 * (https://api.faceit.com/auth/v1/openid_configuration, read 2026-11-18). Used only when the
 * corresponding variable is not set; an explicitly configured value always wins.
 */
export const FACEIT_DISCOVERED_ENDPOINTS: Record<string, string> = {
  FACEIT_OAUTH_AUTHORIZE_URL: "https://accounts.faceit.com",
  FACEIT_OAUTH_TOKEN_URL: "https://api.faceit.com/auth/v1/oauth/token",
  FACEIT_OAUTH_USERINFO_URL: "https://api.faceit.com/auth/v1/resources/userinfo",
};

/** Configured value, its PM5 alias, or the documented FACEIT endpoint (never a guess). */
function setting(name: string): string | null {
  return (
    env(name) ??
    (ALIASES[name] ? env(ALIASES[name]) : null) ??
    FACEIT_DISCOVERED_ENDPOINTS[name] ??
    null
  );
}

function int(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface FaceitOAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  redirectUri: string;
}

export interface FaceitDataApiConfig {
  apiKey: string;
  baseUrl: string;
  gameId: string;
  timeoutMs: number;
  maxRetries: number;
  syncMatchLimit: number;
  syncMaxPages: number;
}

export interface FaceitConfigStatus {
  clientId: boolean;
  clientSecret: boolean;
  apiKey: boolean;
  authorizeUrl: boolean;
  tokenUrl: boolean;
  userinfoUrl: boolean;
  redirectUri: boolean;
  apiBaseUrl: boolean;
  gameId: boolean;
  oauthReady: boolean;
  dataApiReady: boolean;
}

/** Booleans only — never the values. Safe to show to the master admin. */
export function faceitConfigStatus(): FaceitConfigStatus {
  const status = {
    clientId: env("FACEIT_CLIENT_ID") !== null,
    clientSecret: env("FACEIT_CLIENT_SECRET") !== null,
    apiKey: setting("FACEIT_API_KEY") !== null,
    authorizeUrl: isHttpsUrl(setting("FACEIT_OAUTH_AUTHORIZE_URL")),
    tokenUrl: isHttpsUrl(setting("FACEIT_OAUTH_TOKEN_URL")),
    userinfoUrl: isHttpsUrl(setting("FACEIT_OAUTH_USERINFO_URL")),
    redirectUri: isAllowedRedirectUri(setting("FACEIT_REDIRECT_URI")),
    apiBaseUrl: isHttpsUrl(env("FACEIT_API_BASE_URL") ?? FACEIT_DEFAULT_API_BASE_URL),
    gameId: true,
  };
  return {
    ...status,
    oauthReady:
      status.clientId &&
      status.clientSecret &&
      status.authorizeUrl &&
      status.tokenUrl &&
      status.userinfoUrl &&
      status.redirectUri,
    dataApiReady: status.apiKey,
  };
}

export function isHttpsUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * FASE 2.2.1C — HTTPS is enforced at the EFFECTIVE POINT OF USE, not only in the
 * diagnostics view. A Bearer token (API key or access token) must never be sent
 * over plain HTTP. Loopback HTTP is tolerated only outside production, so a
 * local mock server remains usable during development.
 */
export function requireSecureFaceitUrl(name: string, value: string | null): string {
  if (!value) throw new FaceitError("FACEIT_CONFIGURATION_MISSING");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FaceitError("FACEIT_CONFIGURATION_MISSING");
  }
  if (url.protocol === "https:") return value;
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "http:" && isLoopback && process.env["NODE_ENV"] !== "production") {
    console.warn(`[faceit] insecure_url_allowed_in_development name=${name}`);
    return value;
  }
  throw new FaceitError("FACEIT_CONFIGURATION_MISSING");
}

/** OAuth userinfo endpoint — HTTPS enforced here, where the token is sent. */
export function requireFaceitUserinfoUrl(): string {
  return requireSecureFaceitUrl("FACEIT_OAUTH_USERINFO_URL", setting("FACEIT_OAUTH_USERINFO_URL"));
}

/** HTTPS required; plain http tolerated only for localhost in development. */
export function isAllowedRedirectUri(value: string | null): boolean {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return url.protocol === "http:" && isLocal && process.env["NODE_ENV"] !== "production";
}

/**
 * OAuth endpoints come from configuration or, when unset, from FACEIT's published OpenID
 * discovery document (FACEIT_DISCOVERED_ENDPOINTS) — never from a guess.
 */
export function requireFaceitOAuthConfig(): FaceitOAuthConfig {
  const clientId = env("FACEIT_CLIENT_ID");
  const clientSecret = env("FACEIT_CLIENT_SECRET");
  const authorizeUrl = setting("FACEIT_OAUTH_AUTHORIZE_URL");
  const tokenUrl = setting("FACEIT_OAUTH_TOKEN_URL");
  const redirectUri = setting("FACEIT_REDIRECT_URI");

  if (
    !clientId ||
    !clientSecret ||
    !isHttpsUrl(authorizeUrl) ||
    !isHttpsUrl(tokenUrl) ||
    !isAllowedRedirectUri(redirectUri)
  ) {
    throw new FaceitError("FACEIT_CONFIGURATION_MISSING");
  }

  return {
    clientId,
    clientSecret,
    authorizeUrl: authorizeUrl!,
    tokenUrl: tokenUrl!,
    redirectUri: redirectUri!,
  };
}

export function requireFaceitDataApiConfig(): FaceitDataApiConfig {
  const apiKey = setting("FACEIT_API_KEY");
  if (!apiKey) throw new FaceitError("FACEIT_CONFIGURATION_MISSING");
  return {
    apiKey,
    // The API key travels in the Authorization header: HTTPS is mandatory.
    baseUrl: requireSecureFaceitUrl(
      "FACEIT_API_BASE_URL",
      env("FACEIT_API_BASE_URL") ?? FACEIT_DEFAULT_API_BASE_URL,
    ),
    gameId: env("FACEIT_GAME_ID") ?? FACEIT_DEFAULT_GAME_ID,
    timeoutMs: int("FACEIT_REQUEST_TIMEOUT_MS", FACEIT_DEFAULT_TIMEOUT_MS),
    maxRetries: int("FACEIT_MAX_RETRIES", FACEIT_DEFAULT_MAX_RETRIES),
    syncMatchLimit: Math.min(
      int("FACEIT_SYNC_MATCH_LIMIT", FACEIT_DEFAULT_SYNC_MATCH_LIMIT),
      FACEIT_HISTORY_MAX_LIMIT * FACEIT_DEFAULT_SYNC_MAX_PAGES,
    ),
    syncMaxPages: int("FACEIT_SYNC_MAX_PAGES", FACEIT_DEFAULT_SYNC_MAX_PAGES),
  };
}

/** Non-sensitive version tag stored in metadata for traceability. */
export function faceitSourceVersion(): string {
  return env("FACEIT_API_VERSION") ?? "data-v4";
}
