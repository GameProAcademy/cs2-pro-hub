/**
 * FASE 2.2.1 — OAuth2 Authorization Code Flow + PKCE primitives.
 *
 * Pure and testable: no env, no database, no network. Randomness always comes
 * from the runtime WebCrypto (`crypto.getRandomValues`), never `Math.random()`.
 */

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 43-128 chars of unreserved characters, per RFC 7636. */
export function generateCodeVerifier(length = 64): string {
  const size = Math.min(128, Math.max(43, length));
  const bytes = randomBytes(size);
  let verifier = "";
  for (const byte of bytes) {
    verifier += BASE64URL_ALPHABET[byte % BASE64URL_ALPHABET.length];
  }
  return verifier;
}

export async function codeChallengeS256(codeVerifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return base64url(digest);
}

/** 256 bits of entropy, base64url-encoded. Single-use, short TTL. */
export function generateState(): string {
  return base64url(randomBytes(32));
}

/** Only the hash of the state is persisted — never the raw state. */
export async function hashState(state: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(state),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface AuthorizeUrlInput {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
}

/** Authorization Code Flow only: `response_type=code`, PKCE `S256`. */
export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const url = new URL(input.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.scope) url.searchParams.set("scope", input.scope);
  return url.toString();
}

export const FACEIT_OAUTH_DEFAULT_SCOPE = "openid profile email";

/**
 * FACEIT exposes the canonical player id under a few documented names
 * (`guid` in OpenID userinfo, `player_id` in the Data API). The nickname is
 * NEVER accepted as an identifier.
 */
export function extractFaceitPlayerId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["guid", "player_id", "playerId", "sub"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}
