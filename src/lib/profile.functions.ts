/**
 * REAL player profile persistence (FASE 2.4 / 2.4.1).
 *
 * Everything here reads and writes the database as the signed-in user through
 * RLS. There is no mock, no demo fallback and no localStorage: what the player
 * sees after a reload or a new sign-in is exactly what was persisted.
 *
 * The write path is a SINGLE transactional RPC (public.save_player_profile), so
 * a failure can never leave roles deleted and goals half-written.
 *
 * Read errors are NEVER swallowed: a failing query throws instead of degrading
 * into an empty list, otherwise a database problem would look like "this player
 * has no identities".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  COUNTRY_CODES,
  EXPERIENCE_CODES,
  GOAL_CODES,
  LEVEL_CODES,
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

export interface PlayerNicknameHistoryRow {
  nickname: string;
  source: string;
  method: string | null;
  confidenceLabel: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  timesSeen: number;
}

export interface PlayerProfilePayload {
  playerId: string;
  displayName: string | null;
  email: string | null;
  nickname: string | null;
  country: string | null;
  mainPlatform: string | null;
  /** DECLARED level. Never a FACEIT level / ELO / Premier rating. */
  currentLevel: string | null;
  experience: string | null;
  team: string | null;
  roleCodes: string[];
  goals: Array<{ code: string; isPrimary: boolean }>;
  identities: PlayerIdentityRow[];
  connections: PlayerConnectionRow[];
  nicknameHistory: PlayerNicknameHistoryRow[];
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
  currentLevel: z.enum(LEVEL_CODES).nullable().optional(),
  experience: z.enum(EXPERIENCE_CODES).nullable().optional(),
  team: nullableText(60),
  roleCodes: z.array(z.enum(TEAM_ROLE_CODES)).max(TEAM_ROLE_CODES.length).default([]),
  goalCodes: z.array(z.enum(GOAL_CODES)).max(GOAL_CODES.length).default([]),
  primaryGoalCode: z.enum(GOAL_CODES).nullable().optional(),
});

export type SavePlayerProfileInput = z.input<typeof saveSchema>;

/** Any query result whose `error` is set aborts the read: no silent empties. */
function unwrap<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`profile.read.${label}: ${result.error.message}`);
  return result.data;
}

/** Loads (and lazily creates) the player row that belongs to the caller. */
async function loadOwnPlayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<Record<string, unknown> & { id: string }> {
  const columns = "id, nickname, country, main_platform, current_level, experience, team";
  const existing = await supabase
    .from("player_profiles")
    .select(columns)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const created = await supabase
    .from("player_profiles")
    .insert({ user_id: userId })
    .select(columns)
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
  const player = await loadOwnPlayer(supabase, userId);

  const [account, roles, goals, identities, connections, nicknameHistory] = await Promise.all([
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
    supabase
      .from("player_nickname_history")
      .select("nickname, source, method, confidence_label, first_seen_at, last_seen_at, times_seen")
      .eq("player_id", player.id)
      .order("last_seen_at", { ascending: false }),
  ]);

  const accountRow = unwrap("account", account) as {
    display_name?: string | null;
    email?: string | null;
  } | null;
  const roleRows = unwrap("roles", roles) as Array<{ role_code: string }> | null;
  const goalRows = unwrap("goals", goals) as Array<{
    goal_code: string;
    is_primary: boolean;
  }> | null;
  const identityRows = unwrap("identities", identities) as PlayerIdentityRow[] | null;
  const connectionRows = unwrap("connections", connections) as PlayerConnectionRow[] | null;
  const nicknameRows = unwrap("nicknameHistory", nicknameHistory) as Array<{
    nickname: string;
    source: string;
    method: string | null;
    confidence_label: string | null;
    first_seen_at: string;
    last_seen_at: string;
    times_seen: number;
  }> | null;

  return {
    playerId: player.id,
    displayName: accountRow?.display_name ?? null,
    email: accountRow?.email ?? null,
    nickname: (player["nickname"] as string | null) ?? null,
    country: (player["country"] as string | null) ?? null,
    mainPlatform: (player["main_platform"] as string | null) ?? null,
    currentLevel: (player["current_level"] as string | null) ?? null,
    experience: (player["experience"] as string | null) ?? null,
    team: (player["team"] as string | null) ?? null,
    roleCodes: (roleRows ?? []).map((row) => row.role_code),
    goals: (goalRows ?? []).map((row) => ({ code: row.goal_code, isPrimary: row.is_primary })),
    identities: identityRows ?? [],
    connections: connectionRows ?? [],
    nicknameHistory: (nicknameRows ?? []).map((row) => ({
      nickname: row.nickname,
      source: row.source,
      method: row.method,
      confidenceLabel: row.confidence_label,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      timesSeen: row.times_seen,
    })),
  };
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

    // ONE transaction. Every write (profiles.display_name, player_profiles,
    // declared roles, declared goals) commits or rolls back together. The RPC
    // derives the owner from auth.uid(); no caller-supplied user id exists, so
    // a tampered payload cannot touch another account.
    // The generated RPC arg types are non-nullable, but every one of these
    // columns is nullable in the schema, so nulls are the real contract.
    const saved = await supabase.rpc("save_player_profile", {
      _display_name: data.displayName ?? null,
      _nickname: data.nickname ?? null,
      _country: data.country ?? null,
      _main_platform: data.mainPlatform ?? null,
      _current_level: data.currentLevel ?? null,
      _experience: data.experience ?? null,
      _team: data.team ?? null,
      _role_codes: data.roleCodes,
      _goal_codes: data.goalCodes,
      _primary_goal:
        data.primaryGoalCode && data.goalCodes.includes(data.primaryGoalCode)
          ? data.primaryGoalCode
          : (data.goalCodes[0] ?? null),
    } as never);
    if (saved.error) throw new Error(saved.error.message);

    return readProfilePayload(supabase, userId);
  });
