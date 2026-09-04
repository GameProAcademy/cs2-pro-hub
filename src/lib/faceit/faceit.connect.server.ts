/**
 * FASE 2.2.1 — connection persistence (SERVER ONLY).
 *
 * Reuses `player_connections` and `player_identities`. Every write is idempotent
 * and a FACEIT account can only ever belong to a single CS2 PRO user: the
 * application checks first and the database's partial unique indexes are the last
 * line of defence against a concurrent race.
 */
import { assertSafeConnectionMetadata } from "@/lib/sources/connectionMetadata";

import { faceitRuntime } from "./faceit.runtime.server";
import { faceitSourceVersion } from "./faceit.config.server";
import { FaceitError } from "./faceit.errors";
import {
  mapFaceitPlayerToConnection,
  mapFaceitPlayerToIdentity,
  mapFaceitPlayerToProfileView,
  type FaceitProfileView,
} from "./faceit.mapper";
import { fetchFaceitPlayer } from "./faceit.player";
import { invalidateFaceitOAuthAttempts } from "./faceit.oauth.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function requirePlayerId(userId: string): Promise<string> {
  const db = await admin();
  const { data } = await db
    .from("player_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new FaceitError("FACEIT_INTERNAL_ERROR");
  return data.id;
}

/** Postgres unique-violation code. */
const UNIQUE_VIOLATION = "23505";

export interface ConnectResult {
  connectionId: string;
  playerId: string;
  profile: FaceitProfileView;
  reconnected: boolean;
}

/**
 * Finalises the link after a validated OAuth callback.
 * `faceitPlayerId` always comes from the OAuth resolution, never from the browser.
 */
export async function finalizeFaceitConnection(
  userId: string,
  faceitPlayerId: string,
): Promise<ConnectResult> {
  const db = await admin();
  const playerId = await requirePlayerId(userId);
  const { client, config } = faceitRuntime();
  const player = await fetchFaceitPlayer(client, faceitPlayerId);
  if (player.player_id !== faceitPlayerId) throw new FaceitError("FACEIT_PLAYER_NOT_FOUND");

  // 1. Duplicate protection (application-side).
  const { data: owner } = await db
    .from("player_connections")
    .select("id, player_id")
    .eq("source", "faceit")
    .eq("external_id", faceitPlayerId)
    .maybeSingle();
  if (owner && owner.player_id !== playerId) throw new FaceitError("FACEIT_DUPLICATE_ACCOUNT");

  const { data: identityOwner } = await db
    .from("player_identities")
    .select("id, player_id")
    .eq("platform", "FACEIT")
    .eq("external_id", faceitPlayerId)
    .maybeSingle();
  if (identityOwner && identityOwner.player_id !== playerId) {
    throw new FaceitError("FACEIT_DUPLICATE_ACCOUNT");
  }

  const fields = mapFaceitPlayerToConnection(player, config.gameId, faceitSourceVersion());
  assertSafeConnectionMetadata(fields.metadata);
  const now = new Date().toISOString();

  // 2. Connection: one row per (player, source, connection_type) — reconnect
  //    updates it in place instead of creating a second connection.
  const { data: existing } = await db
    .from("player_connections")
    .select("id, status, connected_at")
    .eq("player_id", playerId)
    .eq("source", "faceit")
    .eq("connection_type", "oauth")
    .maybeSingle();

  let connectionId: string;
  const reconnected = Boolean(existing);
  const payload = {
    external_id: fields.external_id,
    external_username: fields.external_username,
    profile_url: fields.profile_url,
    metadata: fields.metadata,
    status: "connected" as const,
    connected_at: now,
    disconnected_at: null,
    updated_at: now,
  };

  try {
    if (existing) {
      const { data, error } = await db
        .from("player_connections")
        .update(payload)
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) throw error;
      connectionId = data.id;
    } else {
      const { data, error } = await db
        .from("player_connections")
        .insert({
          player_id: playerId,
          source: "faceit",
          connection_type: "oauth",
          ...payload,
        })
        .select("id")
        .single();
      if (error) throw error;
      connectionId = data.id;
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw new FaceitError("FACEIT_DUPLICATE_ACCOUNT");
    throw new FaceitError("FACEIT_INTERNAL_ERROR");
  }

  // 3. Identity: verified only because the official OAuth flow succeeded.
  const identity = mapFaceitPlayerToIdentity(player, config.gameId);
  try {
    const { data: ownIdentity } = await db
      .from("player_identities")
      .select("id")
      .eq("player_id", playerId)
      .eq("platform", "FACEIT")
      .maybeSingle();

    if (ownIdentity) {
      await db
        .from("player_identities")
        .update({
          external_id: identity.external_id,
          username: identity.username,
          profile_url: identity.profile_url,
          is_verified: true,
          updated_at: now,
        })
        .eq("id", ownIdentity.id);
    } else {
      await db.from("player_identities").insert({
        player_id: playerId,
        platform: "FACEIT",
        external_id: identity.external_id,
        username: identity.username,
        profile_url: identity.profile_url,
        is_verified: true,
      });
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw new FaceitError("FACEIT_DUPLICATE_ACCOUNT");
    throw new FaceitError("FACEIT_INTERNAL_ERROR");
  }

  return {
    connectionId,
    playerId,
    profile: mapFaceitPlayerToProfileView(player, config.gameId),
    reconnected,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

/**
 * Disconnect is NOT destructive: matches, metrics, uploads, analyses and
 * training plans are all preserved, and the historic identity is kept.
 */
export async function disconnectFaceit(userId: string): Promise<{ disconnected: boolean }> {
  const db = await admin();
  const playerId = await requirePlayerId(userId);
  const now = new Date().toISOString();

  await invalidateFaceitOAuthAttempts(userId);

  const { data } = await db
    .from("player_connections")
    .update({
      status: "disconnected",
      disconnected_at: now,
      last_sync_status: null,
      last_sync_error: null,
      updated_at: now,
    })
    .eq("player_id", playerId)
    .eq("source", "faceit")
    .eq("connection_type", "oauth")
    .select("id");

  // Cancel pending sync work so nothing keeps running for a disconnected account.
  await db
    .from("faceit_sync_jobs")
    .update({ status: "failed", last_error: "FACEIT_NOT_CONNECTED", finished_at: now })
    .eq("player_id", playerId)
    .in("status", ["queued", "retrying"]);

  return { disconnected: (data?.length ?? 0) > 0 };
}
