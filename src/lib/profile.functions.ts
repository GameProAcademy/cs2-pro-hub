/**
 * REAL player profile persistence (FASE 2.4).
 *
 * Everything here reads and writes the database as the signed-in user through
 * RLS. There is no mock, no demo fallback and no localStorage: what the player
 * sees after a reload or a new sign-in is exactly what was persisted.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  COUNTRY_CODES,
  EXPERIENCE_CODES,
  GOAL_CODES,
  PLATFORM_CODES,
  TEAM_ROLE_CODES,
} from "@/lib/profile/taxonomy";

export interface PlayerIdentityRow {
  platform: string;
  external_id: string | null;
  username: string | null;
  profile_url: string | null;
  identity_status: string;
  confidence_score: number;
  verification_method: string | null;
  verified_at: string | null;
  is_verified: boolean;
}

export interface PlayerConnectionRow {
  source: string;
  connection_type: string;
  status: string;
  external_username: string | null;
  profile_url: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
}

export interface PlayerProfilePayload {
  playerId: string;
  displayName: string | null;
  email: string | null;
  nickname: string | null;
  country: string | null;
  mainPlatform: string | null;
  experience: string | null;
  team: string | null;
  roleCodes: string[];
  goals: Array<{ code: string; isPrimary: boolean }>;
  identities: PlayerIdentityRow[];
  connections: PlayerConnectionRow[];
}

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

const saveSchema = z.object({
  displayName: nullableText(80),
  nickname: nullableText(32),
  country: z.enum(COUNTRY_CODES).nullable().optional(),
  mainPlatform: z.enum(PLATFORM_CODES).nullable().optional(),
  experience: z.enum(EXPERIENCE_CODES).nullable().optional(),
  team: nullableText(60),
  roleCodes: z.array(z.enum(TEAM_ROLE_CODES)).max(TEAM_ROLE_CODES.length).default([]),
  goalCodes: z.array(z.enum(GOAL_CODES)).max(GOAL_CODES.length).default([]),
});

export type SavePlayerProfileInput = z.input<typeof saveSchema>;

/** Loads (and lazily creates) the player row that belongs to the caller. */
async function loadOwnPlayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<{ id: string } & Record<string, unknown>> {
  const existing = await supabase
    .from("player_profiles")
    .select("id, nickname, country, main_platform, experience, team")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const created = await supabase
    .from("player_profiles")
    .insert({ user_id: userId })
    .select("id, nickname, country, main_platform, experience, team")
    .single();
  if (created.error) throw new Error(created.error.message);
  return created.data;
}

/** Single read path, shared by the read and the write server functions. */
async function readProfilePayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<PlayerProfilePayload> {
  {
    const player = await loadOwnPlayer(supabase, userId);

    const [account, roles, goals, identities, connections] = await Promise.all([
      supabase.from("profiles").select("display_name, email").eq("id", userId).maybeSingle(),
      supabase
        .from("player_profile_roles")
        .select("role_code")
        .eq("player_id", player.id)
        .order("role_code"),
      supabase
        .from("player_profile_goals")
        .select("goal_code, is_primary")
        .eq("player_id", player.id)
        .order("goal_code"),
      supabase
        .from("player_identities")
        .select(
          "platform, external_id, username, profile_url, identity_status, confidence_score, verification_method, verified_at, is_verified",
        )
        .eq("player_id", player.id),
      supabase
        .from("player_connections")
        .select(
          "source, connection_type, status, external_username, profile_url, last_sync_at, last_sync_status",
        )
        .eq("player_id", player.id),
    ]);

    return {
      playerId: player.id,
      displayName: (account.data?.display_name as string | null) ?? null,
      email: (account.data?.email as string | null) ?? null,
      nickname: (player.nickname as string | null) ?? null,
      country: (player.country as string | null) ?? null,
      mainPlatform: (player.main_platform as string | null) ?? null,
      experience: (player.experience as string | null) ?? null,
      team: (player.team as string | null) ?? null,
      roleCodes: (roles.data ?? []).map((row: { role_code: string }) => row.role_code),
      goals: (goals.data ?? []).map((row: { goal_code: string; is_primary: boolean }) => ({
        code: row.goal_code,
        isPrimary: row.is_primary,
      })),
      identities: (identities.data ?? []) as PlayerIdentityRow[],
      connections: (connections.data ?? []) as PlayerConnectionRow[],
    };
  }
}

export const getPlayerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlayerProfilePayload> =>
    readProfilePayload(context.supabase, context.userId),
  );

export const savePlayerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SavePlayerProfileInput) => saveSchema.parse(input))
  .handler(async ({ data, context }): Promise<PlayerProfilePayload> => {
    const { supabase, userId } = context;
    const player = await loadOwnPlayer(supabase, userId);

    const update = await supabase
      .from("player_profiles")
      .update({
        nickname: data.nickname ?? null,
        country: data.country ?? null,
        main_platform: data.mainPlatform ?? null,
        experience: data.experience ?? null,
        team: data.team ?? null,
      })
      .eq("id", player.id)
      .eq("user_id", userId);
    if (update.error) throw new Error(update.error.message);

    if (data.displayName !== undefined) {
      // guard_profile_role() blocks role/status/email changes; display_name is
      // the only account field the player owns here.
      const accountUpdate = await supabase
        .from("profiles")
        .update({ display_name: data.displayName })
        .eq("id", userId);
      if (accountUpdate.error) throw new Error(accountUpdate.error.message);
    }

    // Declared roles/goals are a full replacement of the player's own rows.
    const clearRoles = await supabase
      .from("player_profile_roles")
      .delete()
      .eq("player_id", player.id);
    if (clearRoles.error) throw new Error(clearRoles.error.message);
    if (data.roleCodes.length > 0) {
      const insertRoles = await supabase
        .from("player_profile_roles")
        .insert(data.roleCodes.map((role_code) => ({ player_id: player.id, role_code })));
      if (insertRoles.error) throw new Error(insertRoles.error.message);
    }

    const clearGoals = await supabase
      .from("player_profile_goals")
      .delete()
      .eq("player_id", player.id);
    if (clearGoals.error) throw new Error(clearGoals.error.message);
    if (data.goalCodes.length > 0) {
      const insertGoals = await supabase.from("player_profile_goals").insert(
        data.goalCodes.map((goal_code, index) => ({
          player_id: player.id,
          goal_code,
          is_primary: index === 0,
        })),
      );
      if (insertGoals.error) throw new Error(insertGoals.error.message);
    }

    return readProfilePayload(supabase, userId);
  });
