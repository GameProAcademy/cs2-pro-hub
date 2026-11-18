/**
 * The signed-in player's external accounts (FACEIT, Gamers Club, Steam) as ONE list with
 * a derived state each. Read under the caller's RLS; never another player's rows, never
 * a full external id, never a secret.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { buildExternalLinks, type ExternalLinkView } from "./externalLinks";

export const getMyExternalLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExternalLinkView[]> => {
    const { supabase, userId } = context;
    const { faceitConfigStatus } = await import("@/lib/faceit/faceit.config.server");
    const { steamConfigStatus } = await import("@/lib/steam/steam.config.server");
    const { fillFaceitLang } = await import("@/lib/faceit/faceit.mapper");
    const { maskSteamId64 } = await import("@/lib/steam/steam.openid");
    const configured = {
      FACEIT: faceitConfigStatus().oauthReady,
      GAMERS_CLUB: false,
      STEAM: steamConfigStatus().openidReady,
    };

    const { data: player } = await supabase
      .from("player_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!player) return buildExternalLinks({ connections: [], identities: [], configured });

    const [{ data: connections }, { data: identities }] = await Promise.all([
      supabase
        .from("player_connections")
        .select(
          "id, source, connection_type, status, external_id, external_username, profile_url, last_sync_at, last_sync_status, metadata",
        )
        .eq("player_id", player.id),
      supabase
        .from("player_identities")
        .select("platform, identity_status, is_verified, username")
        .eq("player_id", player.id),
    ]);

    const faceit = (connections ?? []).find(
      (c) => c.source === "faceit" && c.connection_type === "oauth",
    );
    let faceitRunning = false;
    if (faceit?.status === "connected") {
      const { data: job } = await supabase
        .from("faceit_sync_jobs")
        .select("status")
        .eq("connection_id", faceit.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      faceitRunning = job?.status === "queued" || job?.status === "processing";
    }

    return buildExternalLinks({
      connections: connections ?? [],
      identities: identities ?? [],
      configured,
      syncRunning: { FACEIT: faceitRunning },
      profileUrl: (platform, url) => (url && platform === "FACEIT" ? fillFaceitLang(url) : url),
      maskId: (platform, id) => (platform === "STEAM" ? maskSteamId64(id) : null),
    });
  });
