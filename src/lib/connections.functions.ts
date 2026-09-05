/**
 * Read-only server functions for the source/connection surface.
 *
 * There is NO connect/sync function in this phase: no integration exists, so
 * exposing one would be a lie with a security surface. Everything here runs as
 * the signed-in user (RLS applies) and never touches the service role.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isConnectionStatus,
  isDataSource,
  type ConnectionStatus,
  type DataSource,
} from "@/lib/sources/sources";

export interface PlayerConnectionView {
  id: string;
  source: DataSource;
  connectionType: string;
  status: ConnectionStatus;
  externalUsername: string | null;
  profileUrl: string | null;
  lastSyncAt: string | null;
}

/**
 * Lists the signed-in player's declared connections. Returns an empty list when
 * the player has no player_profile row yet. Never returns tokens — none exist.
 */
export const listMyConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlayerConnectionView[]> => {
    const { supabase, userId } = context;

    const { data: player } = await supabase
      .from("player_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!player) return [];

    const { data, error } = await supabase
      .from("player_connections")
      .select("id, source, connection_type, status, external_username, profile_url, last_sync_at")
      .eq("player_id", player.id)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).flatMap((row) => {
      if (!isDataSource(row.source) || !isConnectionStatus(row.status)) return [];
      return [
        {
          id: row.id,
          source: row.source,
          connectionType: row.connection_type,
          status: row.status,
          externalUsername: row.external_username,
          profileUrl: row.profile_url,
          lastSyncAt: row.last_sync_at,
        },
      ];
    });
  });
