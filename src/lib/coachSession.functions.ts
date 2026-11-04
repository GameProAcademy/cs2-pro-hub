/**
 * AI Coach conversations and optional preferences (Fase 3.2).
 *
 * Every function runs with the caller's own Supabase session (`requireSupabaseAuth`) and
 * resolves the player from the caller's RLS-scoped `player_profiles` row (`ownPlayerIds`):
 * nothing about the player comes from the client. RLS backs every read and write
 * (`coach_conversations_rw`, `coach_messages_select_own`, `coach_preferences_own`); each query
 * is also narrowed to the caller's player explicitly. The service role is never used here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { CoachMessageView } from "@/lib/coach.functions";
import { ownPlayerIds } from "@/lib/playerData.functions";

type Db = SupabaseClient<Database>;
// coach_preferences was added by a manual migration and is not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;

export const COACH_DIFFICULTY_CODES = [
  "AIM",
  "POSITIONING",
  "UTILITY",
  "ECONOMY",
  "DECISIONS",
  "TEAMPLAY",
  "CONSISTENCY",
  "MINDSET",
] as const;
export type CoachDifficulty = (typeof COACH_DIFFICULTY_CODES)[number];

/** Must equal the CHECK in supabase/migrations/20261104150000_coach_preferences.sql. */
export const COACH_MAP_CODES = [
  "de_ancient",
  "de_anubis",
  "de_cache",
  "de_dust2",
  "de_inferno",
  "de_mirage",
  "de_nuke",
  "de_overpass",
  "de_train",
  "de_vertigo",
  "de_office",
  "de_italy",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES_SHOWN = 60;

export interface CoachConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface CoachPreferences {
  /**
   * Whether preferences can be stored at all: false while the coach_preferences migration
   * is not applied (the UI then hides the optional onboarding instead of failing).
   */
  available: boolean;
  /** Whether the player saved preferences at all (the onboarding is optional). */
  saved: boolean;
  mainDifficulty: CoachDifficulty | null;
  maps: string[];
}

async function onePlayer(db: Db, userId: string): Promise<string | null> {
  const ids = await ownPlayerIds(db, userId, "COACH");
  return ids.length === 1 ? ids[0]! : null;
}

/** Pure: validates a conversation id from the client (anything else is "no id"). */
export function conversationIdFrom(input: unknown): string | null {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return typeof v["conversationId"] === "string" && UUID.test(v["conversationId"])
    ? v["conversationId"]
    : null;
}

/** Pure: validates preferences from the client against the allowed codes. */
export function preferencesFrom(
  input: unknown,
): { ok: true; mainDifficulty: CoachDifficulty | null; maps: string[] } | { ok: false } {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = v["mainDifficulty"];
  if (d !== null && d !== undefined && !(COACH_DIFFICULTY_CODES as readonly unknown[]).includes(d))
    return { ok: false };
  const maps = v["maps"] ?? [];
  if (!Array.isArray(maps) || maps.length > COACH_MAP_CODES.length) return { ok: false };
  if (!maps.every((m) => (COACH_MAP_CODES as readonly unknown[]).includes(m))) return { ok: false };
  return {
    ok: true,
    mainDifficulty: (d ?? null) as CoachDifficulty | null,
    maps: [...new Set(maps as string[])].sort(),
  };
}

export const listCoachConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CoachConversationSummary[]> => {
    const db = context.supabase;
    const playerId = await onePlayer(db, context.userId);
    if (!playerId) return [];
    const { data, error } = await db
      .from("coach_conversations")
      .select("id, title, updated_at")
      .eq("player_id", playerId)
      .order("updated_at", { ascending: false })
      .limit(MAX_CONVERSATIONS);
    if (error) throw new Error(`COACH_CONVERSATIONS_READ_FAILED:${error.code ?? "unknown"}`);
    return (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
  });

export const getCoachConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({ conversationId: conversationIdFrom(input) }))
  .handler(async ({ context, data }): Promise<{ found: boolean; messages: CoachMessageView[] }> => {
    const db = context.supabase;
    const playerId = await onePlayer(db, context.userId);
    if (!playerId || !data.conversationId) return { found: false, messages: [] };
    // Ownership first: a conversation that is not the caller's is "not found".
    const owned = await db
      .from("coach_conversations")
      .select("id")
      .eq("id", data.conversationId)
      .eq("player_id", playerId)
      .maybeSingle();
    if (owned.error)
      throw new Error(`COACH_CONVERSATION_READ_FAILED:${owned.error.code ?? "unknown"}`);
    if (!owned.data) return { found: false, messages: [] };
    const { data: rows, error } = await db
      .from("coach_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES_SHOWN);
    if (error) throw new Error(`COACH_MESSAGES_READ_FAILED:${error.code ?? "unknown"}`);
    return {
      found: true,
      messages: (rows ?? []).reverse().map((r) => ({
        id: r.id,
        role: r.role === "coach" ? "coach" : "player",
        content: r.content,
        createdAt: r.created_at,
      })),
    };
  });

export const deleteCoachConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({ conversationId: conversationIdFrom(input) }))
  .handler(async ({ context, data }): Promise<{ deleted: boolean }> => {
    const db = context.supabase;
    const playerId = await onePlayer(db, context.userId);
    if (!playerId || !data.conversationId) return { deleted: false };
    // Messages go with it (ON DELETE CASCADE). RLS: coach_conversations_rw (owns_player).
    const { data: rows, error } = await db
      .from("coach_conversations")
      .delete()
      .eq("id", data.conversationId)
      .eq("player_id", playerId)
      .select("id");
    if (error) throw new Error(`COACH_CONVERSATION_DELETE_FAILED:${error.code ?? "unknown"}`);
    return { deleted: (rows ?? []).length === 1 };
  });

/** The caller's preferences (none saved → `saved: false`, nothing invented). */
export async function loadCoachPreferences(db: Db, playerId: string): Promise<CoachPreferences> {
  const { data, error } = await (db as unknown as AnyDb)
    .from("coach_preferences")
    .select("main_difficulty, maps")
    .eq("player_id", playerId)
    .maybeSingle();
  // 42P01 / PGRST205: the table does not exist yet (migration not applied): unavailable.
  if (error && (error.code === "42P01" || error.code === "PGRST205"))
    return { available: false, saved: false, mainDifficulty: null, maps: [] };
  if (error) throw new Error(`COACH_PREFERENCES_READ_FAILED:${error.code ?? "unknown"}`);
  if (!data) return { available: true, saved: false, mainDifficulty: null, maps: [] };
  const row = data as { main_difficulty: string | null; maps: string[] | null };
  return {
    available: true,
    saved: true,
    mainDifficulty: (COACH_DIFFICULTY_CODES as readonly string[]).includes(
      row.main_difficulty ?? "",
    )
      ? (row.main_difficulty as CoachDifficulty)
      : null,
    maps: (row.maps ?? []).filter((m) => (COACH_MAP_CODES as readonly string[]).includes(m)),
  };
}

export const getCoachPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CoachPreferences> => {
    const playerId = await onePlayer(context.supabase, context.userId);
    if (!playerId) return { available: false, saved: false, mainDifficulty: null, maps: [] };
    return loadCoachPreferences(context.supabase, playerId);
  });

export const saveCoachPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => preferencesFrom(input))
  .handler(async ({ context, data }): Promise<{ ok: boolean; preferences: CoachPreferences }> => {
    const db = context.supabase;
    const playerId = await onePlayer(db, context.userId);
    const none = { available: false, saved: false, mainDifficulty: null, maps: [] };
    if (!playerId || !data.ok) return { ok: false, preferences: none };
    const { error } = await (db as unknown as AnyDb).from("coach_preferences").upsert(
      {
        player_id: playerId,
        main_difficulty: data.mainDifficulty,
        maps: data.maps,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id" },
    );
    if (error) throw new Error(`COACH_PREFERENCES_WRITE_FAILED:${error.code ?? "unknown"}`);
    return { ok: true, preferences: await loadCoachPreferences(db, playerId) };
  });

export const deleteCoachPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ deleted: boolean }> => {
    const playerId = await onePlayer(context.supabase, context.userId);
    if (!playerId) return { deleted: false };
    const { error } = await (context.supabase as unknown as AnyDb)
      .from("coach_preferences")
      .delete()
      .eq("player_id", playerId);
    if (error) throw new Error(`COACH_PREFERENCES_DELETE_FAILED:${error.code ?? "unknown"}`);
    return { deleted: true };
  });
