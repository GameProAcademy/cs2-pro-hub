/**
 * FASE 2.5 — Steam link attempt lifecycle + assertion validation (SERVER ONLY).
 *
 * `steam_link_attempts` is unreachable from any client role (RLS enabled, zero
 * policies, no GRANT). Only the SHA-256 hash of the state is stored, the attempt
 * is single-use, expires in ten minutes, and is bound to the user who started
 * it — that binding is what prevents CSRF and login confusion.
 *
 * The browser is never trusted: the SteamID64 used to link an account always
 * comes from an assertion validated directly with Steam.
 */
import { requireSteamOpenIdConfig } from "./steam.config.server";
import { STEAM_HTTP_TIMEOUT_MS, STEAM_LINK_STATE_TTL_SECONDS } from "./steam.constants";
import { SteamError, steamErrorFromStatus, toSteamError } from "./steam.errors";
import {
  buildCheckAuthenticationBody,
  buildSteamAuthUrl,
  generateState,
  hashState,
  parseCheckAuthenticationResponse,
  parseSteamCallback,
  type SteamCallbackParams,
} from "./steam.openid";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface StartedSteamAttempt {
  redirectUrl: string;
  expiresAt: string;
}

/** Creates a pending attempt and returns the Steam sign-in URL. */
export async function startSteamLinkAttempt(userId: string): Promise<StartedSteamAttempt> {
  const config = requireSteamOpenIdConfig();
  const state = generateState();
  const expiresAt = new Date(Date.now() + STEAM_LINK_STATE_TTL_SECONDS * 1000).toISOString();
  const db = await admin();

  // Only one live attempt per user: starting a new one burns the old ones.
  await invalidateSteamLinkAttempts(userId);

  const { data: player } = await db
    .from("player_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const { error } = await db.from("steam_link_attempts").insert({
    user_id: userId,
    player_id: player?.id ?? null,
    state_hash: await hashState(state),
    return_url: config.returnUrl,
    realm: config.realm,
    expires_at: expiresAt,
  });
  if (error) throw new SteamError("STEAM_INTERNAL_ERROR");

  return {
    redirectUrl: buildSteamAuthUrl({
      endpoint: config.endpoint,
      realm: config.realm,
      returnUrl: config.returnUrl,
      state,
    }),
    expiresAt,
  };
}

export interface ConsumedSteamAttempt {
  userId: string;
  returnUrl: string;
}

/**
 * Validates and consumes a state. Replay is impossible: the UPDATE that stamps
 * `consumed_at` is conditional on the row still being `pending`, so exactly one
 * caller can win the race.
 */
export async function consumeSteamLinkAttempt(state: string): Promise<ConsumedSteamAttempt> {
  if (!state || state.length < 32) throw new SteamError("STEAM_OPENID_STATE_INVALID");
  const db = await admin();
  const stateHash = await hashState(state);

  const { data: attempt } = await db
    .from("steam_link_attempts")
    .select("id, user_id, status, return_url, expires_at, consumed_at")
    .eq("state_hash", stateHash)
    .maybeSingle();

  if (!attempt) throw new SteamError("STEAM_OPENID_STATE_INVALID");
  if (attempt.status !== "pending" || attempt.consumed_at) {
    throw new SteamError("STEAM_OPENID_STATE_CONSUMED");
  }
  if (new Date(attempt.expires_at).getTime() <= Date.now()) {
    await db
      .from("steam_link_attempts")
      .update({ status: "expired" })
      .eq("id", attempt.id)
      .eq("status", "pending");
    throw new SteamError("STEAM_OPENID_STATE_EXPIRED");
  }

  const { data: consumed } = await db
    .from("steam_link_attempts")
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("id", attempt.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!consumed) throw new SteamError("STEAM_OPENID_STATE_CONSUMED");

  return { userId: attempt.user_id, returnUrl: attempt.return_url };
}

/** Burns an attempt on the failure path so no replay window stays open. */
export async function consumeSteamLinkAttemptQuietly(state: string | null): Promise<void> {
  if (!state) return;
  try {
    await consumeSteamLinkAttempt(state);
  } catch {
    // An invalid/expired/consumed state on the error path is not actionable.
  }
}

/** Cancels every pending attempt of a user (new attempt, disconnect, unlink). */
export async function invalidateSteamLinkAttempts(userId: string): Promise<void> {
  const db = await admin();
  await db
    .from("steam_link_attempts")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "pending");
}

/**
 * Full server-side validation of a callback:
 *   1. structural checks + `return_to` / state binding (no network);
 *   2. `check_authentication` against Steam — the ONLY thing that turns a
 *      claimed id into a proven one;
 *   3. single-use consumption of our attempt, bound to the user who started it.
 */
export async function validateSteamCallback(
  params: SteamCallbackParams,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ userId: string; steamId64: string }> {
  const config = requireSteamOpenIdConfig();
  const parsed = parseSteamCallback(params, config.returnUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STEAM_HTTP_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/plain",
      },
      body: buildCheckAuthenticationBody(params).toString(),
      signal: controller.signal,
    });
  } catch (error) {
    // The attempt is burned: a network failure must not leave a replayable state.
    await consumeSteamLinkAttemptQuietly(parsed.state);
    throw toSteamError(error);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    await consumeSteamLinkAttemptQuietly(parsed.state);
    throw steamErrorFromStatus(response.status);
  }

  const body = await response.text();
  if (!parseCheckAuthenticationResponse(body)) {
    await consumeSteamLinkAttemptQuietly(parsed.state);
    throw new SteamError("STEAM_OPENID_NOT_VALIDATED");
  }

  const attempt = await consumeSteamLinkAttempt(parsed.state);
  return { userId: attempt.userId, steamId64: parsed.steamId64 };
}
