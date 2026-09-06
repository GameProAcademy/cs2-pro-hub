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

/**
 * Fire-and-record security notice. Imported lazily so the email layer never
 * enters a bundle that does not send email, and wrapped so a provider outage can
 * never undo a committed link/unlink.
 */
async function notifySteamLink(
  kind: "steam_linked" | "steam_unlinked",
  userId: string,
  steamId64: string | null,
  personaName: string | null,
  occurredAt: string,
): Promise<void> {
  try {
    const masked = maskSteamId64(steamId64);
    if (!masked) return;
    const { notifySteamLinked, notifySteamUnlinked } =
      await import("@/lib/email/email.events.server");
    const notify = kind === "steam_linked" ? notifySteamLinked : notifySteamUnlinked;
    await notify({ userId, steamIdMasked: masked, personaName, eventId: occurredAt, occurredAt });
  } catch {
    console.warn(`[email] steam_notice_failed kind=${kind}`);
  }
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
 *
 * FASE 2.5.2C — the write is ATOMIC. Connection, identity, correlation evidence
 * and the audit record are applied by `public.steam_link_commit` inside ONE
 * database transaction, so a failure halfway can no longer leave a connected
 * connection with an unverified identity, or a link with no audit trail. The
 * routine re-checks ownership and takeover server-side; the partial unique
 * indexes remain the last line of defence.
 */
export async function finalizeSteamConnection(
  userId: string,
  steamId64: string,
): Promise<SteamConnectResult> {
  const db = await admin();
  const playerId = await requireSteamPlayerId(userId);
  const { profile, enriched } = await resolveSteamProfile(steamId64);

  const fields = mapSteamConnectionFields(profile, steamSourceVersion());
  assertSafeConnectionMetadata(fields.metadata);
  const identity = mapSteamIdentityFields(profile);
  const now = new Date().toISOString();

  // Read-only: builds the evidence/correlation payload. Nothing is written here.
  const { evidence, correlations } = await buildSteamCorrelation(userId, playerId, steamId64, now);

  const { data, error } = await db.rpc("steam_link_commit", {
    _user_id: userId,
    _player_id: playerId,
    _steam_id: steamId64,
    _connection: {
      external_username: fields.external_username,
      profile_url: fields.profile_url,
      profile_locator_type: fields.profile_locator_type,
      profile_slug: fields.profile_slug,
      metadata: fields.metadata,
    } as never,
    _identity: {
      username: identity.username,
      profile_url: identity.profile_url,
      profile_locator_type: identity.profile_locator_type,
      profile_slug: identity.profile_slug,
    } as never,
    _evidence: evidence as never,
    _correlations: correlations as never,
    // The full SteamID64 is NEVER written to the audit log.
    _audit: {
      source: "steam",
      steam_id_64_masked: maskSteamId64(steamId64),
      enriched,
    } as never,
  });

  if (error) {
    if (isUniqueViolation(error) || /STEAM_DUPLICATE_ACCOUNT/.test(error.message ?? "")) {
      throw new SteamError("STEAM_DUPLICATE_ACCOUNT");
    }
    if (/STEAM_FORBIDDEN/.test(error.message ?? "")) throw new SteamError("STEAM_FORBIDDEN");
    console.warn("[steam] steam_link_commit_failed");
    throw new SteamError("STEAM_INTERNAL_ERROR");
  }

  const result = (data ?? {}) as { connection_id?: string; reconnected?: boolean };
  if (!result.connection_id) throw new SteamError("STEAM_INTERNAL_ERROR");
  const reconnected = Boolean(result.reconnected);

  console.info(`[steam] steam_link_success reconnected=${reconnected} enriched=${enriched}`);

  // FASE 2.5.2 — email LAST: identity committed, correlation written, audit
  // written. A delivery failure is logged, never rolled back onto the link.
  await notifySteamLink("steam_linked", userId, steamId64, profile.personaName ?? null, now);

  return { connectionId: result.connection_id, playerId, profile, reconnected, enriched };
}

interface SteamCorrelationPayload {
  evidence: Array<Record<string, unknown>>;
  correlations: Array<Record<string, unknown>>;
}

/**
 * BUILDS (never writes) the ownership proof and, when another source
 * independently reports the same SteamID64, the resulting correlation evidence.
 * FACEIT/Gamers Club identities are only ever promoted to `strongly_correlated` —
 * `verified` remains reserved for a source that authenticated the user itself.
 *
 * FASE 2.5.2C — the returned payload is applied by `public.steam_link_commit` in
 * the SAME transaction as the connection and the identity, so evidence can no
 * longer be lost while the link is kept.
 */
async function buildSteamCorrelation(
  userId: string,
  playerId: string,
  steamId64: string,
  now: string,
): Promise<SteamCorrelationPayload> {
  const db = await admin();
  const { evidenceValueHash } = await import("@/lib/identity/identity.normalize");
  const { EVIDENCE_WEIGHTS } = await import("@/lib/identity/identity.types");
  const hashed = evidenceValueHash(steamId64);

  const evidence: Array<Record<string, unknown>> = [
    {
      user_id: userId,
      // FASE 2.5.1 — this side of the pair is the INTERNAL account, not an
      // external identity source. Labelling it "gamepro" made an internal
      // assertion look like third-party evidence; `internal_account` states
      // plainly that the proof is "our own authenticated session".
      identity_a_source: "internal_account",
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
  const correlations: Array<Record<string, unknown>> = [];

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
    evidence.push({
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

    const platform =
      connection.source === "faceit"
        ? "FACEIT"
        : connection.source === "gamers_club"
          ? "GAMERS_CLUB"
          : null;
    if (!platform) continue;

    // A `verified` identity is never downgraded (the routine skips it), and a
    // conflict is never resolved silently — it is recorded as a conflict.
    correlations.push({
      platform,
      identity_status: matches ? "strongly_correlated" : "conflict",
      confidence_score: matches ? EVIDENCE_WEIGHTS.steam_id64.weight : 0,
    });
  }

  return { evidence, correlations };
}

/**
 * Unlink. NON-destructive by design: matches, metrics, analyses and the identity
 * record are all preserved. Trust is what gets revoked.
 *
 * FASE 2.5.2C — one transaction (`public.steam_unlink_commit`): the connection is
 * disconnected, the ownership proof is revoked and the audit record is written
 * together, or nothing happens. A recorded `conflict` is NEVER rewritten by an
 * unlink, so conflict history survives.
 */
export async function unlinkSteamAccount(userId: string): Promise<{ disconnected: boolean }> {
  const db = await admin();
  const playerId = await requireSteamPlayerId(userId);
  const now = new Date().toISOString();

  await invalidateSteamLinkAttempts(userId);

  const { data, error } = await db.rpc("steam_unlink_commit", {
    _user_id: userId,
    _player_id: playerId,
    _audit: { source: "steam" } as never,
  });

  if (error) {
    if (/STEAM_FORBIDDEN/.test(error.message ?? "")) throw new SteamError("STEAM_FORBIDDEN");
    console.warn("[steam] steam_unlink_commit_failed");
    throw new SteamError("STEAM_INTERNAL_ERROR");
  }

  const result = (data ?? {}) as { disconnected?: boolean; external_id?: string | null };
  if (!result.disconnected) return { disconnected: false };

  console.info("[steam] steam_unlink_success");

  await notifySteamLink("steam_unlinked", userId, result.external_id ?? null, null, now);
  return { disconnected: true };
}
