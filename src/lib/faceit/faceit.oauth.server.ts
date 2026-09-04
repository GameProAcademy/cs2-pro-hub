/**
 * FASE 2.2.1 — OAuth attempt lifecycle (SERVER ONLY).
 *
 * The pending attempt lives in `oauth_connection_states`, which no client role
 * can read or write. Only the SHA-256 hash of the state is stored, the attempt is
 * single-use, expires in 10 minutes, and is always bound to the CS2 PRO user who
 * started it — that binding is what prevents CSRF / login confusion.
 *
 * The authorization code is never stored. Access/refresh tokens are used inside
 * this module to resolve the identity and are then discarded: no functional need
 * exists for keeping them in this phase, so they are not persisted anywhere.
 */
import { FACEIT_OAUTH_STATE_TTL_SECONDS, requireFaceitOAuthConfig } from "./faceit.config.server";
import { FaceitError, faceitErrorFromStatus, toFaceitError } from "./faceit.errors";
import {
  buildAuthorizeUrl,
  extractFaceitPlayerId,
  resolveFaceitIdentityFromPayload,
  codeChallengeS256,
  FACEIT_OAUTH_DEFAULT_SCOPE,
  generateCodeVerifier,
  generateState,
  hashState,
} from "./faceit.oauth";
import { faceitTokenResponseSchema, parseFaceit } from "./faceit.types";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface StartedAttempt {
  authorizeUrl: string;
  expiresAt: string;
}

/** Creates a pending attempt and returns the FACEIT authorization URL. */
export async function startFaceitOAuthAttempt(userId: string): Promise<StartedAttempt> {
  const config = requireFaceitOAuthConfig();
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const challenge = await codeChallengeS256(codeVerifier);
  const expiresAt = new Date(Date.now() + FACEIT_OAUTH_STATE_TTL_SECONDS * 1000).toISOString();

  const db = await admin();
  const { error } = await db.from("oauth_connection_states").insert({
    user_id: userId,
    provider: "faceit",
    state_hash: await hashState(state),
    code_verifier: codeVerifier,
    redirect_uri: config.redirectUri,
    expires_at: expiresAt,
  });
  if (error) throw new FaceitError("FACEIT_INTERNAL_ERROR");

  return {
    authorizeUrl: buildAuthorizeUrl({
      authorizeUrl: config.authorizeUrl,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
      codeChallenge: challenge,
      scope: FACEIT_OAUTH_DEFAULT_SCOPE,
    }),
    expiresAt,
  };
}

export interface ConsumedAttempt {
  userId: string;
  codeVerifier: string;
  redirectUri: string;
}

/**
 * Validates and consumes a state. Replay is impossible: the UPDATE that stamps
 * `consumed_at` is conditional on it still being NULL, so only one caller wins.
 */
export async function consumeFaceitOAuthState(state: string): Promise<ConsumedAttempt> {
  if (!state || state.length < 16) throw new FaceitError("FACEIT_OAUTH_STATE_INVALID");
  const db = await admin();
  const stateHash = await hashState(state);

  const { data: attempt } = await db
    .from("oauth_connection_states")
    .select("id, user_id, provider, code_verifier, redirect_uri, expires_at, consumed_at")
    .eq("state_hash", stateHash)
    .maybeSingle();

  if (!attempt) throw new FaceitError("FACEIT_OAUTH_STATE_INVALID");
  if (attempt.provider !== "faceit") throw new FaceitError("FACEIT_OAUTH_STATE_INVALID");
  if (attempt.consumed_at) throw new FaceitError("FACEIT_OAUTH_STATE_CONSUMED");
  if (new Date(attempt.expires_at).getTime() <= Date.now()) {
    throw new FaceitError("FACEIT_OAUTH_STATE_EXPIRED");
  }

  const { data: consumed } = await db
    .from("oauth_connection_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", attempt.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  if (!consumed) throw new FaceitError("FACEIT_OAUTH_STATE_CONSUMED");

  return {
    userId: attempt.user_id,
    codeVerifier: attempt.code_verifier,
    redirectUri: attempt.redirect_uri,
  };
}

/**
 * Consumes a state without raising. Used on the ERROR callback path so that a
 * failed/denied consent still burns the attempt (no replay window is left open).
 */
export async function consumeFaceitOAuthStateQuietly(state: string | null): Promise<void> {
  if (!state) return;
  try {
    await consumeFaceitOAuthState(state);
  } catch {
    // An invalid/expired/consumed state on the error path is not actionable.
  }
}

/** Invalidates every pending attempt of a user (used on disconnect). */
export async function invalidateFaceitOAuthAttempts(userId: string): Promise<void> {
  const db = await admin();
  await db
    .from("oauth_connection_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "faceit")
    .is("consumed_at", null);
}

export interface FaceitTokenResult {
  accessToken: string;
  idToken: string | null;
}

/**
 * Server-to-server code exchange with PKCE. The client secret never leaves the
 * server and the request body is never logged.
 */
export async function exchangeFaceitCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<FaceitTokenResult> {
  const config = requireFaceitOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });

  let response: Response;
  try {
    response = await fetchImpl(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      },
      body: body.toString(),
    });
  } catch (error) {
    throw toFaceitError(error);
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new FaceitError("FACEIT_OAUTH_INVALID_GRANT", { status: response.status });
    }
    throw faceitErrorFromStatus(response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new FaceitError("FACEIT_MALFORMED_RESPONSE");
  }

  // OAuth error object returned with a 200 body is still a failure.
  if (payload && typeof payload === "object" && "error" in (payload as object)) {
    throw new FaceitError("FACEIT_OAUTH_INVALID_GRANT");
  }

  const token = parseFaceit(faceitTokenResponseSchema, payload);
  // Only bearer tokens are usable by this integration; anything else is refused
  // rather than silently sent as a bearer credential.
  if (token.token_type && token.token_type.toLowerCase() !== "bearer") {
    throw new FaceitError("FACEIT_OAUTH_FAILED");
  }
  return { accessToken: token.access_token, idToken: token.id_token ?? null };
}

/**
 * Resolves the FACEIT player id from the OAuth session.
 *
 * The userinfo endpoint is configuration, never a hardcoded guess. The token is
 * used here and immediately dropped.
 */
export async function resolveFaceitPlayerId(
  accessToken: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<string> {
  // HTTPS enforced HERE, at the point where the Bearer token is actually sent.
  const { requireFaceitUserinfoUrl } = await import("./faceit.config.server");
  const userinfoUrl = requireFaceitUserinfoUrl();

  let response: Response;
  try {
    response = await fetchImpl(userinfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
  } catch (error) {
    throw toFaceitError(error);
  }
  if (!response.ok) throw faceitErrorFromStatus(response.status);

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw new FaceitError("FACEIT_MALFORMED_RESPONSE");
  }

  const resolution = resolveFaceitIdentityFromPayload(payload);
  if (!resolution) throw new FaceitError("FACEIT_PLAYER_NOT_FOUND");
  // Traceability without secrets: which documented field resolved the identity.
  console.info(`[faceit] identity_resolved source=${resolution.source}`);
  return resolution.playerId;
}

export { extractFaceitPlayerId, resolveFaceitIdentityFromPayload };
