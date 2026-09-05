/**
 * FASE 2.5 — Steam connection + identity persistence (SERVER ONLY).
 *
 * Reuses the CANONICAL structures — `player_connections` and
 * `player_identities`. No parallel `steam_accounts` / `steam_users` /
 * `steam_profiles` identity table exists, and none may be created.
 *
 * Guarantees:
 *  - one Steam account belongs to exactly ONE GamePro player (checked in the
 *    application, enforced by partial unique indexes as the last defence);
 *  - the identity becomes `verified` with method `openid` only because Steam
 *    itself validated the assertion;
 *  - disconnect is NON-destructive: history and the identity record survive;
 *  - every link/unlink is written to `admin_audit_logs`.
 */
import { assertSafeConnectionMetadata } from "@/lib/sources/connectionMetadata";

import { steamSourceVersion } from "./steam.config.server";
import { SteamError } from "./steam.errors";
import { mapSteamConnectionFields, mapSteamIdentityFields } from "./steam.mapper";
import { invalidateSteamLinkAttempts } from "./steam.openid.server";
import { maskSteamId64 } from "./steam.openid";
import { resolveSteamProfile } from "./steam.profile.server";
import type { SteamProfileView } from "./steam.types";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Postgres unique-violation code. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

export async function requireSteamPlayerId(userId: string): Promise<string> {
  const db = await admin();
  const { data } = await db
    .from("player_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data.id;

  const created = await db
    .from("player_profiles")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (created.error || !created.data) throw new SteamError("STEAM_INTERNAL_ERROR");
  return created.data.id;
}

/** Audit trail. The full SteamID64 is NEVER written to the audit log. */
async function audit(
  userId: string,
  action: "steam_connection_created" | "steam_connection_removed",
  steamId64: string | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const db = await admin();
  await db.from("admin_audit_logs").insert({
    admin_user_id: userId,
    target_user_id: userId,
    action,
    metadata: { source: "steam", steam_id_64_masked: maskSteamId64(steamId64), ...extra } as never,
  });
}

export interface SteamConnectResult {
  connectionId: string;
  playerId: string;
  profile: SteamProfileView;
  reconnected: boolean;
  enriched: boolean;
}

/**
 * Finalises the link after a VALIDATED OpenID assertion.
 * `steamId64` always comes from `validateSteamCallback`, never from the browser.
 */
export async function finalizeSteamConnection(
  userId: string,
  steamId64: string,
): Promise<SteamConnectResult> {
  const db = await admin();
  const playerId = await requireSteamPlayerId(userId);
  const { profile, enriched } = await resolveSteamProfile(steamId64);

  // 1. Unique ownership, application side.
  const { data: connectionOwner } = await db
    .from("player_connections")
    .select("id, player_id")
    .eq("source", "steam")
    .eq("external_id", steamId64)
    .maybeSingle();
  if (connectionOwner && connectionOwner.player_id !== playerId) {
    throw new SteamError("STEAM_DUPLICATE_ACCOUNT");
  }

  const { data: identityOwner } = await db
    .from("player_identities")
    .select("id, player_id")
    .eq("platform", "STEAM")
    .eq("external_id", steamId64)
    .maybeSingle();
  if (identityOwner && identityOwner.player_id !== playerId) {
    throw new SteamError("STEAM_DUPLICATE_ACCOUNT");
  }

  const fields = mapSteamConnectionFields(profile, steamSourceVersion());
  assertSafeConnectionMetadata(fields.metadata);
  const now = new Date().toISOString();

  // 2. Connection: one row per (player, source, connection_type). Relinking
  //    updates it in place instead of creating a second connection.
  const { data: existing } = await db
    .from("player_connections")
    .select("id")
    .eq("player_id", playerId)
    .eq("source", "steam")
    .eq("connection_type", "openid")
    .maybeSingle();

  const payload = {
    external_id: fields.external_id,
    external_username: fields.external_username,
    profile_url: fields.profile_url,
    profile_locator_type: fields.profile_locator_type,
    profile_slug: fields.profile_slug,
    metadata: fields.metadata as never,
    status: "connected" as const,
    connected_at: now,
    disconnected_at: null,
    last_sync_status: null,
    last_sync_error: null,
    updated_at: now,
  };

  let connectionId: string;
  const reconnected = Boolean(existing);
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
          source: "steam",
          connection_type: "openid",
          ...payload,
        })
        .select("id")
        .single();
      if (error) throw error;
      connectionId = data.id;
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw new SteamError("STEAM_DUPLICATE_ACCOUNT");
    throw new SteamError("STEAM_INTERNAL_ERROR");
  }

  // 3. Identity: `verified` because the OFFICIAL Steam sign-in succeeded.
  const identity = mapSteamIdentityFields(profile);
  try {
    const { data: ownIdentity } = await db
      .from("player_identities")
      .select("id")
      .eq("player_id", playerId)
      .eq("platform", "STEAM")
      .maybeSingle();

    const identityPayload = {
      external_id: identity.external_id,
      username: identity.username,
      profile_url: identity.profile_url,
      profile_locator_type: identity.profile_locator_type,
      profile_slug: identity.profile_slug,
      is_verified: true,
      identity_status: "verified" as const,
      confidence_score: 1,
      verification_method: "openid",
      verified_at: now,
      updated_at: now,
    };

    if (ownIdentity) {
      const { error } = await db
        .from("player_identities")
        .update(identityPayload)
        .eq("id", ownIdentity.id);
      if (error) throw error;
    } else {
      const { error } = await db
        .from("player_identities")
        .insert({ player_id: playerId, platform: "STEAM", ...identityPayload });
      if (error) throw error;
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw new SteamError("STEAM_DUPLICATE_ACCOUNT");
    throw new SteamError("STEAM_INTERNAL_ERROR");
  }

  // 4. Evidence + cross-source correlation (never a silent promotion).
  await recordSteamCorrelation(userId, playerId, steamId64);

  await audit(userId, "steam_connection_created", steamId64, { reconnected, enriched });
  console.info(`[steam] steam_link_success reconnected=${reconnected} enriched=${enriched}`);

  return { connectionId, playerId, profile, reconnected, enriched };
}

/**
 * Records the ownership proof and, when another source independently reports the
 * same SteamID64, the resulting correlation evidence. FACEIT/Gamers Club
 * identities are only ever promoted to `strongly_correlated` — `verified`
 * remains reserved for a source that authenticated the user itself.
 */
async function recordSteamCorrelation(
  userId: string,
  playerId: string,
  steamId64: string,
): Promise<void> {
  const db = await admin();
  const { evidenceValueHash } = await import("@/lib/identity/identity.normalize");
  const { EVIDENCE_WEIGHTS } = await import("@/lib/identity/identity.types");
  const now = new Date().toISOString();
  const hashed = evidenceValueHash(steamId64);

  const rows: Array<Record<string, unknown>> = [
    {
      user_id: userId,
      identity_a_source: "gamepro",
      identity_a_id: userId,
      identity_b_source: "steam",
      identity_b_id: steamId64,
      attribute: "authenticated_link",
      match_type: "exact",
      confidence_score: EVIDENCE_WEIGHTS.authenticated_link.weight,
      evidence_value_hash: null,
      provenance: "steam.openid.check_authentication",
      observed_at: now,
    },
  ];

  // Other sources that publish a SteamID64 for this player.
  const { data: connections } = await db
    .from("player_connections")
    .select("source, external_id, metadata, status")
    .eq("player_id", playerId)
    .neq("source", "steam");

  for (const connection of connections ?? []) {
    const metadata = connection.metadata as Record<string, unknown> | null;
    const profile = (metadata?.["profile"] ?? null) as Record<string, unknown> | null;
    const reported = profile?.["steam_id_64"];
    if (typeof reported !== "string" || reported.length === 0) continue;
    const matches = reported === steamId64;
    rows.push({
      user_id: userId,
      identity_a_source: connection.source,
      identity_a_id: connection.external_id,
      identity_b_source: "steam",
      identity_b_id: steamId64,
      attribute: "steam_id64",
      match_type: matches ? "exact" : "conflict",
      confidence_score: matches ? EVIDENCE_WEIGHTS.steam_id64.weight : 0,
      evidence_value_hash: hashed,
      provenance: "steam.openid+player_connections.metadata",
      observed_at: now,
    });

    const nextStatus = matches ? "strongly_correlated" : "conflict";
    const platform =
      connection.source === "faceit"
        ? "FACEIT"
        : connection.source === "gamers_club"
          ? "GAMERS_CLUB"
          : null;
    if (!platform) continue;

    const { data: identity } = await db
      .from("player_identities")
      .select("id, identity_status, confidence_score")
      .eq("player_id", playerId)
      .eq("platform", platform)
      .maybeSingle();
    // A `verified` identity is never downgraded by heuristic evidence, and a
    // conflict is never resolved silently — it is recorded as a conflict.
    if (!identity || identity.identity_status === "verified") continue;
    await db
      .from("player_identities")
      .update({
        identity_status: nextStatus,
        confidence_score: matches
          ? Math.max(Number(identity.confidence_score ?? 0), EVIDENCE_WEIGHTS.steam_id64.weight)
          : Number(identity.confidence_score ?? 0),
        updated_at: now,
      })
      .eq("id", identity.id);
  }

  const { error } = await db.from("identity_correlation_evidence").insert(rows as never);
  if (error) console.warn("[steam] correlation_evidence_write_failed");
}

/**
 * Unlink. NON-destructive by design: matches, metrics, analyses and the identity
 * record are all preserved. Trust is what gets revoked.
 */
export async function unlinkSteamAccount(userId: string): Promise<{ disconnected: boolean }> {
  const db = await admin();
  const playerId = await requireSteamPlayerId(userId);
  const now = new Date().toISOString();

  await invalidateSteamLinkAttempts(userId);

  const { data: connection } = await db
    .from("player_connections")
    .select("id, external_id")
    .eq("player_id", playerId)
    .eq("source", "steam")
    .eq("connection_type", "openid")
    .maybeSingle();

  if (!connection) return { disconnected: false };

  await db
    .from("player_connections")
    .update({
      status: "disconnected",
      disconnected_at: now,
      last_sync_status: null,
      last_sync_error: null,
      updated_at: now,
    })
    .eq("id", connection.id);

  // The identity row survives (history), but ownership proof is revoked: a
  // relink must go through Steam again.
  await db
    .from("player_identities")
    .update({
      is_verified: false,
      identity_status: "correlated",
      verification_method: null,
      verified_at: null,
      updated_at: now,
    })
    .eq("player_id", playerId)
    .eq("platform", "STEAM");

  await audit(userId, "steam_connection_removed", connection.external_id);
  console.info("[steam] steam_unlink_success");
  return { disconnected: true };
}
