/**
 * FASE 2.5 — client-facing Steam server functions.
 *
 * The browser can only:
 *   1. read its OWN Steam link state (`getSteamConnection`);
 *   2. ask the server to start a link (`startSteamConnection`);
 *   3. unlink (`unlinkSteamConnection`).
 *
 * It never sees a Web API key, a realm, a state value, an OpenID signature or
 * another player's SteamID64. Server-only modules are imported INSIDE the
 * handlers so they never reach the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { maskSteamId64 } from "./steam/steam.openid";
import { toSteamError, type SteamErrorCode } from "./steam/steam.errors";
import type { SteamConnectionView } from "./steam/steam.types";

function profileField(metadata: unknown, key: string): unknown {
  if (!metadata || typeof metadata !== "object") return null;
  const profile = (metadata as Record<string, unknown>)["profile"];
  if (!profile || typeof profile !== "object") return null;
  return (profile as Record<string, unknown>)[key] ?? null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Reads the signed-in player's Steam state. Always from OUR database. */
export const getSteamConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SteamConnectionView> => {
    const { steamConfigStatus } = await import("./steam/steam.config.server");
    const status = steamConfigStatus();
    const { supabase, userId } = context;

    const base: SteamConnectionView = {
      state: status.openidReady ? "disconnected" : "configuration_missing",
      connected: false,
      steamId64: null,
      steamId64Masked: null,
      personaName: null,
      profileUrl: null,
      avatar: null,
      profilePublic: null,
      identityStatus: "unlinked",
      confidence: 0,
      verified: false,
      connectedAt: null,
      disconnectedAt: null,
      integrationState: status.state,
      webApiReady: status.webApiReady,
      openidReady: status.openidReady,
    };

    const { data: player } = await supabase
      .from("player_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!player) return base;

    const [{ data: connection }, { data: identity }] = await Promise.all([
      supabase
        .from("player_connections")
        .select(
          "status, external_id, external_username, profile_url, metadata, connected_at, disconnected_at",
        )
        .eq("player_id", player.id)
        .eq("source", "steam")
        .eq("connection_type", "openid")
        .maybeSingle(),
      supabase
        .from("player_identities")
        .select("identity_status, confidence_score, is_verified")
        .eq("player_id", player.id)
        .eq("platform", "STEAM")
        .maybeSingle(),
    ]);

    if (identity) {
      base.identityStatus = identity.identity_status ?? "unlinked";
      base.confidence = Number(identity.confidence_score ?? 0);
      base.verified = Boolean(identity.is_verified);
    }
    if (!connection) return base;

    const connected = connection.status === "connected";
    const visibility = profileField(connection.metadata, "profile_public");

    return {
      ...base,
      state: !status.openidReady
        ? "configuration_missing"
        : connected
          ? "connected"
          : "disconnected",
      connected,
      // The full id is returned ONLY to the owner of the account.
      steamId64: connection.external_id,
      steamId64Masked: maskSteamId64(connection.external_id),
      personaName:
        connection.external_username ?? text(profileField(connection.metadata, "persona_name")),
      profileUrl: connection.profile_url,
      avatar: text(profileField(connection.metadata, "avatar")),
      profilePublic: typeof visibility === "boolean" ? visibility : null,
      connectedAt: connection.connected_at,
      disconnectedAt: connection.disconnected_at,
    };
  });

export interface StartSteamLinkResult {
  ok: boolean;
  redirectUrl?: string;
  errorCode?: SteamErrorCode;
}

/**
 * Starts the official Steam OpenID sign-in. The single-use state is generated
 * and stored server-side, bound to this authenticated user, and never returned.
 */
export const startSteamConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StartSteamLinkResult> => {
    try {
      const { startSteamLinkAttempt } = await import("./steam/steam.openid.server");
      const attempt = await startSteamLinkAttempt(context.userId);
      console.info("[steam] steam_link_attempt");
      return { ok: true, redirectUrl: attempt.redirectUrl };
    } catch (error) {
      const steamError = toSteamError(error);
      console.warn(`[steam] steam_link_failure code=${steamError.code}`);
      return { ok: false, errorCode: steamError.code };
    }
  });

/** Unlinks without deleting any historical data. */
export const unlinkSteamConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; errorCode?: SteamErrorCode }> => {
    try {
      const { unlinkSteamAccount } = await import("./steam/steam.connect.server");
      const result = await unlinkSteamAccount(context.userId);
      return {
        ok: result.disconnected,
        ...(result.disconnected ? {} : { errorCode: "STEAM_NOT_CONNECTED" as const }),
      };
    } catch (error) {
      return { ok: false, errorCode: toSteamError(error).code };
    }
  });

export interface SteamDiagnostics {
  realm: boolean;
  returnUrl: boolean;
  endpoint: boolean;
  webApiKey: boolean;
  transportSecure: boolean;
  returnUrlInsideRealm: boolean;
  openidReady: boolean;
  webApiReady: boolean;
  state: string;
  connections: number;
  connected: number;
  pendingAttempts: number;
}

/** Master-admin diagnostics: booleans and counters only, never values. */
export const getSteamDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SteamDiagnostics | null> => {
    const { data: isMaster } = await context.supabase.rpc("is_admin_master", {
      _user_id: context.userId,
    });
    if (!isMaster) return null;

    const { steamConfigStatus } = await import("./steam/steam.config.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const status = steamConfigStatus();

    const [all, connected, pending] = await Promise.all([
      supabaseAdmin
        .from("player_connections")
        .select("id", { count: "exact", head: true })
        .eq("source", "steam"),
      supabaseAdmin
        .from("player_connections")
        .select("id", { count: "exact", head: true })
        .eq("source", "steam")
        .eq("status", "connected"),
      supabaseAdmin
        .from("steam_link_attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    return {
      ...status,
      connections: all.count ?? 0,
      connected: connected.count ?? 0,
      pendingAttempts: pending.count ?? 0,
    };
  });
