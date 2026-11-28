/**
 * FASE 2.2.1 — client-facing FACEIT server functions.
 *
 * The browser never sees a client id, client secret, API key, OAuth code, state,
 * code verifier or token. It can only:
 *   1. ask the server to start a connection (`startFaceitConnection`);
 *   2. read its own connection status (`getFaceitConnection`);
 *   3. request a synchronisation (`requestFaceitSync`);
 *   4. disconnect (`disconnectFaceitConnection`).
 *
 * Server-only modules (`*.server.ts`) are imported INSIDE the handlers so they
 * never reach the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { FaceitError, toFaceitError, type FaceitErrorCode } from "./faceit/faceit.errors";
import { fillFaceitLang } from "./faceit/faceit.mapper";

export type FaceitConnectionState =
  "disconnected" | "connected" | "syncing" | "error" | "configuration_missing";

export interface FaceitSyncView {
  status: "queued" | "processing" | "completed" | "failed" | "retrying";
  type: string;
  matchesFound: number | null;
  matchesNew: number | null;
  matchesUpdated: number | null;
  lastError: string | null;
  finishedAt: string | null;
}

export interface FaceitConnectionView {
  state: FaceitConnectionState;
  connected: boolean;
  nickname: string | null;
  profileUrl: string | null;
  avatar: string | null;
  country: string | null;
  skillLevel: number | null;
  faceitElo: number | null;
  region: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  syncedMatches: number;
  currentJob: FaceitSyncView | null;
  /** Data API configured? The connection can exist while sync is unavailable. */
  dataApiReady: boolean;
  oauthReady: boolean;
  /**
   * VGL 5.1: automatic import of new matches. null = the player has not chosen yet (no periodic
   * sync happens until they do), true = on, false = off.
   */
  autoSync: boolean | null;
}

function profileNumber(metadata: unknown, key: string): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const profile = (metadata as Record<string, unknown>)["profile"];
  if (!profile || typeof profile !== "object") return null;
  const raw = (profile as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function profileString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const profile = (metadata as Record<string, unknown>)["profile"];
  if (!profile || typeof profile !== "object") return null;
  const raw = (profile as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** Reads the signed-in player's FACEIT state. Always from OUR database. */
export const getFaceitConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FaceitConnectionView> => {
    const { faceitConfigStatus } = await import("./faceit/faceit.config.server");
    const status = faceitConfigStatus();
    const { supabase, userId } = context;

    const empty: FaceitConnectionView = {
      state: status.oauthReady ? "disconnected" : "configuration_missing",
      connected: false,
      nickname: null,
      profileUrl: null,
      avatar: null,
      country: null,
      skillLevel: null,
      faceitElo: null,
      region: null,
      connectedAt: null,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      syncedMatches: 0,
      currentJob: null,
      dataApiReady: status.dataApiReady,
      oauthReady: status.oauthReady,
      autoSync: null,
    };

    const { data: player } = await supabase
      .from("player_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!player) return empty;

    const { data: connection } = await supabase
      .from("player_connections")
      .select(
        "id, status, external_username, profile_url, metadata, connected_at, last_sync_at, last_sync_status, last_sync_error, auto_sync",
      )
      .eq("player_id", player.id)
      .eq("source", "faceit")
      .eq("connection_type", "oauth")
      .maybeSingle();
    if (!connection) return empty;

    const { count } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("player_id", player.id)
      .eq("data_source", "faceit");

    const { data: job } = await supabase
      .from("faceit_sync_jobs")
      .select("status, type, matches_found, matches_new, matches_updated, last_error, finished_at")
      .eq("connection_id", connection.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentJob: FaceitSyncView | null = job
      ? {
          status: job.status,
          type: job.type,
          matchesFound: job.matches_found,
          matchesNew: job.matches_new,
          matchesUpdated: job.matches_updated,
          lastError: job.last_error,
          finishedAt: job.finished_at,
        }
      : null;

    const connected = connection.status === "connected";
    const syncing =
      currentJob?.status === "queued" ||
      currentJob?.status === "processing" ||
      currentJob?.status === "retrying";

    let state: FaceitConnectionState = "disconnected";
    if (!status.oauthReady) state = "configuration_missing";
    else if (connected && syncing) state = "syncing";
    else if (connected && connection.last_sync_status === "error") state = "error";
    else if (connected) state = "connected";

    return {
      state,
      connected,
      nickname: connection.external_username,
      profileUrl: connection.profile_url ? fillFaceitLang(connection.profile_url) : null,
      avatar: profileString(connection.metadata, "avatar"),
      country: profileString(connection.metadata, "country"),
      skillLevel: profileNumber(connection.metadata, "skill_level"),
      faceitElo: profileNumber(connection.metadata, "faceit_elo"),
      region: profileString(connection.metadata, "region"),
      connectedAt: connection.connected_at,
      lastSyncAt: connection.last_sync_at,
      lastSyncStatus: connection.last_sync_status,
      lastSyncError: connection.last_sync_error,
      syncedMatches: count ?? 0,
      currentJob,
      dataApiReady: status.dataApiReady,
      oauthReady: status.oauthReady,
      autoSync: typeof connection.auto_sync === "boolean" ? connection.auto_sync : null,
    };
  });

export interface StartConnectionResult {
  ok: boolean;
  authorizeUrl?: string;
  errorCode?: FaceitErrorCode;
}

/**
 * Starts the OAuth2 + PKCE flow. State and code verifier are generated and
 * stored server-side, bound to this authenticated user, and never returned.
 */
export const startFaceitConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StartConnectionResult> => {
    try {
      const { startFaceitOAuthAttempt } = await import("./faceit/faceit.oauth.server");
      const attempt = await startFaceitOAuthAttempt(context.userId);
      console.info("[faceit] faceit_connection_attempt");
      return { ok: true, authorizeUrl: attempt.authorizeUrl };
    } catch (error) {
      const faceitError = toFaceitError(error);
      console.warn(`[faceit] faceit_connection_failure code=${faceitError.code}`);
      return { ok: false, errorCode: faceitError.code };
    }
  });

export interface SyncRequestResult {
  ok: boolean;
  alreadyRunning?: boolean;
  errorCode?: FaceitErrorCode;
}

/** Requests a manual synchronisation. Concurrency is rejected by the database. */
export const requestFaceitSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyncRequestResult> => {
    try {
      const { requirePlayerId } = await import("./faceit/faceit.connect.server");
      const { enqueueFaceitSync } = await import("./faceit/faceit.sync.server");
      const { faceitConfigStatus } = await import("./faceit/faceit.config.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const playerId = await requirePlayerId(context.userId);
      const { data: connection } = await supabaseAdmin
        .from("player_connections")
        .select("id, status")
        .eq("player_id", playerId)
        .eq("source", "faceit")
        .eq("connection_type", "oauth")
        .maybeSingle();

      if (!connection || connection.status !== "connected") {
        return { ok: false, errorCode: "FACEIT_NOT_CONNECTED" };
      }

      if (!faceitConfigStatus().dataApiReady) {
        return { ok: false, errorCode: "FACEIT_CONFIGURATION_MISSING" };
      }

      const queued = await enqueueFaceitSync(playerId, connection.id, "manual");
      if (queued.alreadyRunning) return { ok: true, alreadyRunning: true };

      // FASE 2.2.1C: the request ONLY enqueues. Execution belongs to the cron
      // worker, because a promise left running after the response is not
      // guaranteed to complete on a serverless/edge runtime.
      console.info("[faceit] faceit_sync_enqueued");
      return { ok: true, alreadyRunning: false };
    } catch (error) {
      return { ok: false, errorCode: toFaceitError(error).code };
    }
  });

export interface AutoSyncResult {
  ok: boolean;
  autoSync?: boolean;
  errorCode?: FaceitErrorCode;
}

/**
 * VGL 5.1 — the player's choice for automatic FACEIT import. Written by the server for the
 * caller's OWN connection only (clients have no UPDATE on player_connections). Turning it on
 * queues one incremental sync right away (no duplicate: one active job per connection, and
 * matches are deduplicated by the canonical resolver); turning it off stops future automatic
 * syncs and deletes nothing.
 */
export const setFaceitAutoSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({
    enabled: (input as { enabled?: unknown } | null)?.enabled === true,
  }))
  .handler(async ({ context, data }): Promise<AutoSyncResult> => {
    try {
      const { requirePlayerId } = await import("./faceit/faceit.connect.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const playerId = await requirePlayerId(context.userId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabaseAdmin as any;
      const { data: connection } = await db
        .from("player_connections")
        .select("id, status")
        .eq("player_id", playerId)
        .eq("source", "faceit")
        .eq("connection_type", "oauth")
        .maybeSingle();
      if (!connection || connection.status !== "connected")
        return { ok: false, errorCode: "FACEIT_NOT_CONNECTED" };
      const { error } = await db
        .from("player_connections")
        .update({ auto_sync: data.enabled, auto_sync_set_at: new Date().toISOString() })
        .eq("id", connection.id)
        .eq("player_id", playerId);
      if (error) return { ok: false, errorCode: "FACEIT_INTERNAL_ERROR" };
      if (data.enabled) {
        const { faceitConfigStatus } = await import("./faceit/faceit.config.server");
        if (faceitConfigStatus().dataApiReady) {
          const { enqueueFaceitSync } = await import("./faceit/faceit.sync.server");
          await enqueueFaceitSync(playerId, connection.id, "incremental");
        }
      }
      console.info(`[faceit] faceit_auto_sync_${data.enabled ? "on" : "off"}`);
      return { ok: true, autoSync: data.enabled };
    } catch (error) {
      return { ok: false, errorCode: toFaceitError(error).code };
    }
  });

/** Disconnects without deleting any historical data. */
export const disconnectFaceitConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; errorCode?: FaceitErrorCode }> => {
    try {
      const { disconnectFaceit } = await import("./faceit/faceit.connect.server");
      const result = await disconnectFaceit(context.userId);
      console.info("[faceit] faceit_disconnect");
      return { ok: result.disconnected };
    } catch (error) {
      return { ok: false, errorCode: toFaceitError(error).code };
    }
  });

export interface FaceitDiagnostics {
  clientId: boolean;
  clientSecret: boolean;
  apiKey: boolean;
  authorizeUrl: boolean;
  tokenUrl: boolean;
  redirectUri: boolean;
  userinfoUrl: boolean;
  oauthReady: boolean;
  dataApiReady: boolean;
  connections: number;
  connected: number;
}

/** Master-admin diagnostics: configured / missing booleans only, never values. */
export const getFaceitDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FaceitDiagnostics> => {
    const { data: isMaster } = await context.supabase.rpc("is_admin_master", {
      _user_id: context.userId,
    });
    if (!isMaster) throw new FaceitError("FACEIT_API_FORBIDDEN");

    const { faceitConfigStatus } = await import("./faceit/faceit.config.server");
    const status = faceitConfigStatus();

    const { count: connections } = await context.supabase
      .from("player_connections")
      .select("id", { count: "exact", head: true })
      .eq("source", "faceit");
    const { count: connected } = await context.supabase
      .from("player_connections")
      .select("id", { count: "exact", head: true })
      .eq("source", "faceit")
      .eq("status", "connected");

    return {
      clientId: status.clientId,
      clientSecret: status.clientSecret,
      apiKey: status.apiKey,
      authorizeUrl: status.authorizeUrl,
      tokenUrl: status.tokenUrl,
      redirectUri: status.redirectUri,
      userinfoUrl: status.userinfoUrl,
      oauthReady: status.oauthReady,
      dataApiReady: status.dataApiReady,
      connections: connections ?? 0,
      connected: connected ?? 0,
    };
  });
