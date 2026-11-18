/**
 * STEAM — public profile synchronisation and nickname aliases (SERVER ONLY).
 *
 * Only for a player whose Steam identity is PROVEN (OpenID). Reads the public
 * `GetPlayerSummaries` entry with the server-side Web API key, updates the connection
 * (persona name, avatar, profile URL, visibility) and records the persona name as a
 * nickname ALIAS (never as identity) through `public.record_steam_alias`.
 *
 * A private profile is not a failure: the SteamID64 stays proven and missing fields stay
 * null. Without a Web API key the sync is reported as unavailable, never faked.
 */
import { assertSafeConnectionMetadata } from "@/lib/sources/connectionMetadata";
import { readVerifiedSteamId64 } from "@/lib/identity/verifiedSteam";

import { steamConfigStatus, steamSourceVersion } from "./steam.config.server";
import { SteamError, toSteamError } from "./steam.errors";
import { mapSteamConnectionFields, mapSteamIdentityFields } from "./steam.mapper";
import { fetchSteamPlayerSummary } from "./steam.profile.server";
import type { SteamProfileView } from "./steam.types";

/** Manual sync ceiling per player (Steam allows 100k calls/day per key; be frugal). */
export const STEAM_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Best effort: an alias failure never breaks a link or a sync. Returns true when new. */
export async function recordSteamAlias(
  playerId: string,
  personaName: string | null,
  steamId64: string,
): Promise<boolean> {
  if (!personaName) return false;
  try {
    const db = await admin();
    const { data, error } = await db.rpc(
      "record_steam_alias" as never,
      {
        _player_id: playerId,
        _nickname: personaName,
        _steam_id: steamId64,
      } as never,
    );
    if (error) {
      console.warn("[steam] steam_alias_failed");
      return false;
    }
    return data === true;
  } catch {
    console.warn("[steam] steam_alias_failed");
    return false;
  }
}

export interface SteamSyncResult {
  status: "SYNCED" | "UNAVAILABLE" | "THROTTLED";
  profilePublic: boolean | null;
  aliasAdded: boolean;
  syncedAt: string | null;
}

/** Writes a fetched public profile onto the player's Steam connection and identity. */
export async function applySteamProfile(
  playerId: string,
  profile: SteamProfileView,
  now: string,
): Promise<void> {
  const db = await admin();
  const fields = mapSteamConnectionFields(profile, steamSourceVersion());
  const metadata = { ...fields.metadata, synced_at: now };
  assertSafeConnectionMetadata(metadata);
  const identity = mapSteamIdentityFields(profile);

  const { error: connError } = await db
    .from("player_connections")
    .update({
      external_username: fields.external_username,
      profile_url: fields.profile_url,
      metadata: metadata as never,
      last_sync_at: now,
      last_sync_status: "success",
      last_sync_error: null,
      updated_at: now,
    })
    .eq("player_id", playerId)
    .eq("source", "steam")
    .eq("connection_type", "openid")
    .eq("external_id", profile.steamId64)
    .eq("status", "connected");
  if (connError) throw new SteamError("STEAM_INTERNAL_ERROR");

  // Display fields only; the trust fields are never touched here.
  const { error: idError } = await db
    .from("player_identities")
    .update({ username: identity.username, profile_url: identity.profile_url, updated_at: now })
    .eq("player_id", playerId)
    .eq("platform", "STEAM")
    .eq("external_id", profile.steamId64);
  if (idError) throw new SteamError("STEAM_INTERNAL_ERROR");
}

/** Manual "Sync" for the signed-in player. */
export async function syncSteamProfile(
  userId: string,
  fetchImpl: typeof fetch = globalThis.fetch,
  nowMs: number = Date.now(),
): Promise<SteamSyncResult> {
  const db = await admin();
  const { data: player } = await db
    .from("player_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!player) throw new SteamError("STEAM_NOT_CONNECTED");

  const steamId64 = await readVerifiedSteamId64(db, player.id);
  if (!steamId64) throw new SteamError("STEAM_NOT_CONNECTED");

  const { data: connection } = await db
    .from("player_connections")
    .select("status, last_sync_at")
    .eq("player_id", player.id)
    .eq("source", "steam")
    .eq("connection_type", "openid")
    .maybeSingle();
  if (!connection || connection.status !== "connected") throw new SteamError("STEAM_NOT_CONNECTED");

  if (!steamConfigStatus().webApiReady) {
    return { status: "UNAVAILABLE", profilePublic: null, aliasAdded: false, syncedAt: null };
  }
  const last = connection.last_sync_at ? Date.parse(connection.last_sync_at) : NaN;
  if (Number.isFinite(last) && nowMs - last < STEAM_SYNC_MIN_INTERVAL_MS) {
    return {
      status: "THROTTLED",
      profilePublic: null,
      aliasAdded: false,
      syncedAt: connection.last_sync_at,
    };
  }

  const now = new Date(nowMs).toISOString();
  let profile: SteamProfileView | null;
  try {
    profile = await fetchSteamPlayerSummary(steamId64, fetchImpl);
  } catch (error) {
    const code = toSteamError(error).code;
    await db
      .from("player_connections")
      .update({ last_sync_status: "error", last_sync_error: code, updated_at: now })
      .eq("player_id", player.id)
      .eq("source", "steam")
      .eq("connection_type", "openid");
    throw toSteamError(error);
  }
  if (!profile) {
    // The API answered without this account (or no key): proven link, no public data.
    return { status: "UNAVAILABLE", profilePublic: null, aliasAdded: false, syncedAt: null };
  }

  await applySteamProfile(player.id, profile, now);
  const aliasAdded = await recordSteamAlias(player.id, profile.personaName, steamId64);
  console.info(`[steam] steam_sync_success public=${profile.isPublic}`);
  return { status: "SYNCED", profilePublic: profile.isPublic, aliasAdded, syncedAt: now };
}
