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
    apiKey: env("FACEIT_API_KEY") !== null,
    authorizeUrl: isHttpsUrl(env("FACEIT_OAUTH_AUTHORIZE_URL")),
    tokenUrl: isHttpsUrl(env("FACEIT_OAUTH_TOKEN_URL")),
    userinfoUrl: isHttpsUrl(env("FACEIT_OAUTH_USERINFO_URL")),
    redirectUri: isAllowedRedirectUri(env("FACEIT_REDIRECT_URI")),
    apiBaseUrl: true,
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


function isHttpsUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
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
 * OAuth endpoints are NEVER hardcoded: FACEIT documents them through its own
 * app configuration, so a missing value is a configuration error, not a guess.
 */
export function requireFaceitOAuthConfig(): FaceitOAuthConfig {
  const clientId = env("FACEIT_CLIENT_ID");
  const clientSecret = env("FACEIT_CLIENT_SECRET");
  const authorizeUrl = env("FACEIT_OAUTH_AUTHORIZE_URL");
  const tokenUrl = env("FACEIT_OAUTH_TOKEN_URL");
  const redirectUri = env("FACEIT_REDIRECT_URI");

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
  const apiKey = env("FACEIT_API_KEY");
  if (!apiKey) throw new FaceitError("FACEIT_CONFIGURATION_MISSING");
  return {
    apiKey,
    baseUrl: env("FACEIT_API_BASE_URL") ?? FACEIT_DEFAULT_API_BASE_URL,
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
