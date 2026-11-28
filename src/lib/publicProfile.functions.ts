/**
 * VGL 5.0 — public player profile endpoints.
 *
 * getPublicProfile (no session needed): resolves a public id with the service role ONLY when the
 * owner made the profile public, then builds the whitelisted view (`buildPublicProfile`) from the
 * same loaders and pure functions the owner's own pages use. A private profile and an id that
 * does not exist get the SAME answer ("NOT_FOUND"), so the endpoint cannot be used to learn
 * which ids exist or who is private. Ids are random (~50 bits), so enumeration is impractical.
 *
 * getMyPublicProfileSettings / setMyPublicProfile: the signed-in owner reads their own id and
 * toggles visibility under their own session (RLS: player_profiles_rw). The id itself can never
 * be changed from the browser (database trigger).
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  buildPublicProfile,
  normalizePublicId,
  type PublicProfile,
} from "./publicProfile/publicProfile";

export type PublicProfileResult =
  { state: "OK"; profile: PublicProfile } | { state: "NOT_FOUND" | "INVALID_ID" };

export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => ({
    publicId: normalizePublicId((input as { publicId?: unknown } | null)?.publicId),
  }))
  .handler(async ({ data }): Promise<PublicProfileResult> => {
    if (!data.publicId) return { state: "INVALID_ID" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: player, error } = await db
      .from("player_profiles")
      .select("user_id, nickname, country, main_platform, role, team, public_id, public_profile")
      .eq("public_id", data.publicId)
      .eq("public_profile", true)
      .maybeSingle();
    if (error || !player) return { state: "NOT_FOUND" };

    const [{ loadPlayerOverview, loadPlayerDna }, { buildProScore }, { asRealPlayerDna }] =
      await Promise.all([
        import("@/lib/playerData.functions"),
        import("@/lib/proScore"),
        import("@/lib/playerDnaV3"),
      ]);
    // The same loaders as the owner's own pages, scoped explicitly to that player's user id.
    const [overview, dna, account] = await Promise.all([
      loadPlayerOverview(db, player.user_id),
      loadPlayerDna(db, player.user_id),
      db.from("profiles").select("avatar_url, nickname").eq("id", player.user_id).maybeSingle(),
    ]);
    let avatarUrl: string | null = null;
    const avatar: unknown = account.data?.avatar_url;
    if (typeof avatar === "string" && avatar) {
      if (/^https:\/\//i.test(avatar)) avatarUrl = avatar;
      else {
        const signed = await db.storage.from("avatars").createSignedUrl(avatar, 60 * 10);
        avatarUrl = signed.data?.signedUrl ?? null;
      }
    }
    return {
      state: "OK",
      profile: buildPublicProfile({
        identity: {
          publicId: player.public_id,
          nickname: player.nickname ?? account.data?.nickname ?? null,
          country: player.country,
          platform: player.main_platform,
          role: player.role,
          team: player.team,
          avatarUrl,
        },
        matches: overview.matches,
        score: buildProScore(dna.rows),
        dna: asRealPlayerDna(dna.dnaV3),
      }),
    };
  });

export interface PublicProfileSettings {
  hasPlayer: boolean;
  publicId: string | null;
  isPublic: boolean;
}

export const getMyPublicProfileSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PublicProfileSettings> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const { data } = await db
      .from("player_profiles")
      .select("public_id, public_profile")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!data) return { hasPlayer: false, publicId: null, isPublic: false };
    return {
      hasPlayer: true,
      publicId: data.public_id ?? null,
      isPublic: data.public_profile === true,
    };
  });

export const setMyPublicProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({
    isPublic: (input as { isPublic?: unknown } | null)?.isPublic === true,
  }))
  .handler(async ({ context, data }): Promise<PublicProfileSettings> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const { data: rows, error } = await db
      .from("player_profiles")
      .update({ public_profile: data.isPublic })
      .eq("user_id", context.userId)
      .select("public_id, public_profile");
    if (error || !rows?.length) throw new Error("PUBLIC_PROFILE_UPDATE_FAILED");
    return {
      hasPlayer: true,
      publicId: rows[0].public_id,
      isPublic: rows[0].public_profile === true,
    };
  });
