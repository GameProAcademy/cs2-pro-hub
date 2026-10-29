/**
 * AI Coach server functions (authenticated).
 *
 * Identity: the player is the caller's own `player_profiles` row read with the
 * caller's RLS session; nothing about the player comes from the client.
 * Context: the same RLS-scoped loaders the Dashboard and Player DNA pages use
 * (`loadPlayerOverview`, `loadPlayerDna`), shaped by `buildCoachFacts`.
 * Persistence: the conversation and the player's message are written with the
 * caller's RLS session (`coach_conversations_rw`, `coach_messages_insert_player`).
 * The coach reply is written with the service role, because RLS reserves the
 * `coach` role for the server, and only after ownership of the conversation was
 * proved with the caller's session in the same request.
 * Provider: the Lovable AI Gateway (`coach/coachProvider.server.ts`); the key
 * never leaves the server. Every failure returns a stable code, never a stack.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  buildCoachFacts,
  buildCoachMessages,
  COACH_MAX_HISTORY,
  COACH_MAX_PLAYER_MESSAGES_PER_HOUR,
  COACH_MAX_REPLY_TOKENS,
  COACH_VERSION,
  validateCoachInput,
  type CoachFacts,
} from "@/lib/coach/coachContext";
import type { CoachProviderError } from "@/lib/coach/coachProvider.server";
import { loadPlayerDna, loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";

export type CoachErrorCode =
  | "COACH_MESSAGE_EMPTY"
  | "COACH_MESSAGE_TOO_LONG"
  | "COACH_LOCALE_INVALID"
  | "COACH_NO_PLAYER"
  | "COACH_PLAYER_AMBIGUOUS"
  | "COACH_NO_DATA"
  | "COACH_CONVERSATION_NOT_FOUND"
  | "COACH_RATE_LIMITED"
  | CoachProviderError
  | "COACH_INTERNAL";

export interface CoachMessageView {
  id: string;
  role: "player" | "coach";
  content: string;
  createdAt: string;
}

export interface CoachState {
  player: "NONE" | "AMBIGUOUS" | "OK";
  dataState: CoachFacts["dataState"] | null;
  conversationId: string | null;
  messages: CoachMessageView[];
  remainingThisHour: number;
}

export type CoachSendResult =
  | { ok: true; conversationId: string; player: CoachMessageView; coach: CoachMessageView }
  | { ok: false; error: CoachErrorCode };

type Db = SupabaseClient<Database>;
const HOUR_MS = 60 * 60 * 1000;
const MAX_MESSAGES_SHOWN = 60;

function view(row: {
  id: string;
  role: string;
  content: string;
  created_at: string;
}): CoachMessageView {
  return {
    id: row.id,
    role: row.role === "coach" ? "coach" : "player",
    content: row.content,
    createdAt: row.created_at,
  };
}

async function latestConversation(db: Db, playerId: string): Promise<string | null> {
  const { data, error } = await db
    .from("coach_conversations")
    .select("id")
    .eq("player_id", playerId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`COACH_CONVERSATION_READ_FAILED:${error.code ?? "unknown"}`);
  return data?.[0]?.id ?? null;
}

async function conversationMessages(db: Db, conversationId: string, limit: number) {
  const { data, error } = await db
    .from("coach_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`COACH_MESSAGES_READ_FAILED:${error.code ?? "unknown"}`);
  return (data ?? []).reverse();
}

/** Player messages the caller sent in the last hour, across their own conversations. */
async function playerMessagesLastHour(db: Db, playerId: string): Promise<number> {
  const { data: conversations, error } = await db
    .from("coach_conversations")
    .select("id")
    .eq("player_id", playerId);
  if (error) throw new Error(`COACH_CONVERSATION_READ_FAILED:${error.code ?? "unknown"}`);
  const ids = (conversations ?? []).map((c) => c.id);
  if (!ids.length) return 0;
  const { count, error: countError } = await db
    .from("coach_messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", ids)
    .eq("role", "player")
    .gte("created_at", new Date(Date.now() - HOUR_MS).toISOString());
  if (countError) throw new Error(`COACH_RATE_READ_FAILED:${countError.code ?? "unknown"}`);
  return count ?? 0;
}

function logFailure(stage: string, error: unknown) {
  // Only the stable code is logged: no message text, facts, keys or stacks.
  const code = error instanceof Error ? error.message.split(":")[0] : "unknown";
  console.error("[ai-coach] failure", { stage, code });
}

export const getCoachState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CoachState> => {
    const db = context.supabase;
    const playerIds = await ownPlayerIds(db, context.userId, "COACH");
    if (playerIds.length !== 1) {
      return {
        player: playerIds.length ? "AMBIGUOUS" : "NONE",
        dataState: null,
        conversationId: null,
        messages: [],
        remainingThisHour: 0,
      };
    }
    const playerId = playerIds[0]!;
    const [{ dna }, conversationId, used] = await Promise.all([
      loadPlayerDna(db, context.userId),
      latestConversation(db, playerId),
      playerMessagesLastHour(db, playerId),
    ]);
    const messages = conversationId
      ? await conversationMessages(db, conversationId, MAX_MESSAGES_SHOWN)
      : [];
    return {
      player: "OK",
      dataState:
        dna.state === "EMPTY"
          ? "NO_MATCHES"
          : dna.state === "READY"
            ? "READY"
            : "INSUFFICIENT_SAMPLE",
      conversationId,
      messages: messages.map(view),
      remainingThisHour: Math.max(0, COACH_MAX_PLAYER_MESSAGES_PER_HOUR - used),
    };
  });

export const sendCoachMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input)
  .handler(async ({ context, data }): Promise<CoachSendResult> => {
    const input = validateCoachInput(data);
    if (!input.ok) return { ok: false, error: input.error };
    const db = context.supabase;

    let stage = "player";
    try {
      const playerIds = await ownPlayerIds(db, context.userId, "COACH");
      if (!playerIds.length) return { ok: false, error: "COACH_NO_PLAYER" };
      if (playerIds.length > 1) return { ok: false, error: "COACH_PLAYER_AMBIGUOUS" };
      const playerId = playerIds[0]!;

      stage = "rate";
      if ((await playerMessagesLastHour(db, playerId)) >= COACH_MAX_PLAYER_MESSAGES_PER_HOUR)
        return { ok: false, error: "COACH_RATE_LIMITED" };

      stage = "conversation";
      let conversationId = input.conversationId;
      if (conversationId) {
        const { data: owned, error } = await db
          .from("coach_conversations")
          .select("id")
          .eq("id", conversationId)
          .eq("player_id", playerId)
          .maybeSingle();
        if (error) throw new Error(`COACH_CONVERSATION_READ_FAILED:${error.code ?? "unknown"}`);
        if (!owned) return { ok: false, error: "COACH_CONVERSATION_NOT_FOUND" };
      }

      stage = "context";
      const [overview, { dna }] = await Promise.all([
        loadPlayerOverview(db, context.userId),
        loadPlayerDna(db, context.userId),
      ]);
      const facts = buildCoachFacts(overview, dna, input.locale);
      if (facts.dataState === "NO_MATCHES") return { ok: false, error: "COACH_NO_DATA" };
      const history = conversationId
        ? (await conversationMessages(db, conversationId, COACH_MAX_HISTORY)).map((m) => ({
            role: m.role === "coach" ? ("coach" as const) : ("player" as const),
            content: m.content,
          }))
        : [];

      stage = "provider";
      const { completeCoach, CoachProviderFailure } =
        await import("@/lib/coach/coachProvider.server");
      let completion;
      try {
        completion = await completeCoach(
          buildCoachMessages(facts, history, input.message, input.locale),
          {
            maxTokens: COACH_MAX_REPLY_TOKENS,
          },
        );
      } catch (error) {
        if (error instanceof CoachProviderFailure) {
          console.error("[ai-coach] provider failure", {
            code: error.code,
            status: error.status,
            attempts: error.attempts.map((a) => `${a.provider}:${a.code ?? "ok"}`),
          });
          return { ok: false, error: error.code };
        }
        throw error;
      }

      // Persist only after the provider answered, so a failed attempt can be retried
      // without leaving an unanswered message (and is not counted against the limit).
      stage = "persist";
      if (!conversationId) {
        const { data: created, error } = await db
          .from("coach_conversations")
          .insert({ player_id: playerId, title: input.message.slice(0, 80) })
          .select("id")
          .single();
        if (error || !created)
          throw new Error(`COACH_CONVERSATION_CREATE_FAILED:${error?.code ?? "unknown"}`);
        conversationId = created.id;
      }
      const { data: playerRow, error: playerError } = await db
        .from("coach_messages")
        .insert({ conversation_id: conversationId, role: "player", content: input.message })
        .select("id, role, content, created_at")
        .single();
      if (playerError || !playerRow)
        throw new Error(`COACH_PLAYER_MESSAGE_FAILED:${playerError?.code ?? "unknown"}`);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: coachRow, error: coachError } = await supabaseAdmin
        .from("coach_messages")
        .insert({
          conversation_id: conversationId,
          role: "coach",
          content: completion.content,
          // Provenance of the reply (no content, no key): who answered, why a fallback
          // answered, the data state it was grounded on, tokens and provider-reported cost.
          context_type: coachProvenance(completion, facts).slice(0, 255),
        })
        .select("id, role, content, created_at")
        .single();
      if (coachError || !coachRow)
        throw new Error(`COACH_REPLY_WRITE_FAILED:${coachError?.code ?? "unknown"}`);
      await db
        .from("coach_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      return { ok: true, conversationId, player: view(playerRow), coach: view(coachRow) };
    } catch (error) {
      logFailure(stage, error);
      return { ok: false, error: "COACH_INTERNAL" };
    }
  });

function coachProvenance(
  completion: {
    provider: string;
    model: string;
    fallbackReason: string | null;
    usage: {
      promptTokens: number | null;
      completionTokens: number | null;
      reasoningTokens: number | null;
      costUsd: number | null;
    };
  },
  facts: { dataState: string; matches: unknown[] },
): string {
  const u = completion.usage;
  return [
    COACH_VERSION,
    `provider=${completion.provider}`,
    `model=${completion.model}`,
    `fallback=${completion.fallbackReason ?? "none"}`,
    `data=${facts.dataState}`,
    `matches=${facts.matches.length}`,
    `in=${u.promptTokens ?? "?"}`,
    `out=${u.completionTokens ?? "?"}`,
    `reasoning=${u.reasoningTokens ?? "?"}`,
    `cost_usd=${u.costUsd ?? "?"}`,
  ].join("|");
}
