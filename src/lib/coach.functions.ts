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
  coachDnaReadings,
  EMPTY_DECLARED,
  type CoachDeclaredProfile,
  COACH_MAX_HISTORY,
  COACH_MAX_PLAYER_MESSAGES_PER_HOUR,
  COACH_MAX_REPLY_TOKENS,
  COACH_VERSION,
  validateCoachInput,
  contextChars,
  fitHistory,
  type CoachFacts,
} from "@/lib/coach/coachContext";
import type { CoachProviderError } from "@/lib/coach/coachProvider.server";
import { fetchCatalogCandidates } from "@/lib/catalog/catalogData.server";
import { coachNeeds, pickRecommendations, sanitizeReplyLinks } from "@/lib/catalog/catalogSelect";
import { guardCoachReply, guardTag } from "@/lib/coach/coachReplyGuard";
import { buildXRay } from "@/lib/diagnostics/xray";
import { loadPlayerDna, loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";
import { loadCoachPreferences } from "@/lib/coachSession.functions";
import { loadSideRounds } from "@/lib/xray.functions";

export type CoachErrorCode =
  | "COACH_MESSAGE_EMPTY"
  | "COACH_MESSAGE_TOO_LONG"
  | "COACH_LOCALE_INVALID"
  | "COACH_NO_PLAYER"
  | "COACH_PLAYER_AMBIGUOUS"
  | "COACH_NO_DATA"
  | "COACH_CONVERSATION_NOT_FOUND"
  | "COACH_RATE_LIMITED"
  | "COACH_REQUEST_IN_PROGRESS"
  | "COACH_REQUEST_ID_CONFLICT"
  | "COACH_PERSIST_FAILED"
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
  | {
      ok: true;
      conversationId: string;
      player: CoachMessageView;
      coach: CoachMessageView;
      /** True when this request id had already been answered: nothing was generated again. */
      replayed?: boolean;
    }
  | {
      ok: false;
      error: CoachErrorCode;
      /**
       * Provider attempts behind a provider failure (provider name, stable code, HTTP status).
       * Operational metadata for diagnosis: no content, prompt, key or user data. Not rendered.
       */
      attempts?: Array<{
        provider: string;
        code: string | null;
        status: number | null;
        transport: string | null;
      }>;
    };

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

/** A request id younger than this without a reply is treated as still being answered. */
const IN_PROGRESS_MS = 90_000;

type MessageRow = { id: string; role: string; content: string; created_at: string };

/**
 * The stored question for a request id and, when it exists, the reply that answered it.
 * Read through the caller's client, so RLS (owns_conversation) hides anyone else's rows.
 */
async function priorRequest(
  db: Db,
  requestId: string,
): Promise<{ conversationId: string; player: MessageRow; reply: MessageRow | null } | null> {
  const { data: player, error } = await db
    .from("coach_messages")
    .select("id, role, content, created_at, conversation_id")
    .eq("id", requestId)
    .eq("role", "player")
    .maybeSingle();
  if (error) throw new Error(`COACH_MESSAGES_READ_FAILED:${error.code ?? "unknown"}`);
  if (!player) return null;
  const { data: reply, error: replyError } = await db
    .from("coach_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", player.conversation_id)
    .eq("context_id", requestId)
    .eq("role", "coach")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (replyError) throw new Error(`COACH_MESSAGES_READ_FAILED:${replyError.code ?? "unknown"}`);
  return { conversationId: player.conversation_id, player, reply: reply ?? null };
}

/**
 * Whether ANY message already uses this id. Called only when the caller's own (RLS) read found
 * nothing, so a hit means another account's message. Returns a boolean, never the row.
 */
async function requestIdTaken(requestId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("coach_messages")
    .select("id", { count: "exact", head: true })
    .eq("id", requestId);
  if (error) throw new Error(`COACH_MESSAGES_READ_FAILED:${error.code ?? "unknown"}`);
  return (count ?? 0) > 0;
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

/**
 * What the player declared in their profile (RLS: the caller's own player only). A
 * preference, never a measurement; a failed read means "nothing declared", never an error.
 */
async function loadDeclaredProfile(db: Db, playerId: string): Promise<CoachDeclaredProfile> {
  try {
    const [player, goals, roles, preferences] = await Promise.all([
      db
        .from("player_profiles")
        .select("current_level, experience")
        .eq("id", playerId)
        .maybeSingle(),
      db.from("player_profile_goals").select("goal_code, is_primary").eq("player_id", playerId),
      db.from("player_profile_roles").select("role_code").eq("player_id", playerId),
      // Optional preferences: a failed read only means "none declared", never losing the rest.
      loadCoachPreferences(db, playerId).catch(() => ({
        available: false,
        saved: false,
        mainDifficulty: null,
        maps: [] as string[],
      })),
    ]);
    if (player.error || goals.error || roles.error) throw new Error("COACH_DECLARED_READ_FAILED");
    const goalRows = (goals.data ?? []) as Array<{ goal_code: string; is_primary: boolean }>;
    return {
      ...EMPTY_DECLARED,
      goals: goalRows.map((g) => g.goal_code).sort(),
      primaryGoal: goalRows.find((g) => g.is_primary)?.goal_code ?? null,
      level: (player.data?.current_level as string | null) ?? null,
      experience: (player.data?.experience as string | null) ?? null,
      roles: ((roles.data ?? []) as Array<{ role_code: string }>).map((r) => r.role_code).sort(),
      mainDifficulty: preferences.mainDifficulty,
      mapsOfInterest: preferences.maps,
    };
  } catch (error) {
    logFailure("declared", error);
    return EMPTY_DECLARED;
  }
}

/** A short, readable title from the first message: one line, cut at a word, at most 60 chars. */
export function conversationTitle(message: string): string {
  const line = message.replace(/\s+/g, " ").trim();
  if (line.length <= 60) return line;
  const cut = line.slice(0, 60);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > 30 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
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

      // Idempotency (Fase 3.3): a request id already answered returns the stored pair, with
      // no new provider call and no new rows. RLS narrows the read to the caller's messages.
      stage = "idempotency";
      let repairOf: { conversationId: string } | null = null;
      if (input.requestId) {
        const prior = await priorRequest(db, input.requestId);
        if (prior?.reply)
          return {
            ok: true,
            conversationId: prior.conversationId,
            player: view(prior.player),
            coach: view(prior.reply),
            replayed: true,
          };
        if (prior) {
          // The question is stored but its reply is not: still running, or its reply write
          // failed. Only an old orphan is answered again (never two generations at once).
          if (Date.now() - Date.parse(prior.player.created_at) < IN_PROGRESS_MS)
            return { ok: false, error: "COACH_REQUEST_IN_PROGRESS" };
          repairOf = { conversationId: prior.conversationId };
        } else if (await requestIdTaken(input.requestId)) {
          // The id exists but RLS hides it: it belongs to someone else. Refuse BEFORE the
          // rate limit and the provider, so a foreign id can never trigger a billed call.
          console.warn("[ai-coach] foreign request id refused");
          return { ok: false, error: "COACH_REQUEST_ID_CONFLICT" };
        }
      }

      stage = "rate";
      if (
        !repairOf &&
        (await playerMessagesLastHour(db, playerId)) >= COACH_MAX_PLAYER_MESSAGES_PER_HOUR
      )
        return { ok: false, error: "COACH_RATE_LIMITED" };

      stage = "conversation";
      let conversationId = repairOf?.conversationId ?? input.conversationId;
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
      const [overview, { dna }, declared] = await Promise.all([
        loadPlayerOverview(db, context.userId),
        loadPlayerDna(db, context.userId),
        loadDeclaredProfile(db, playerId),
      ]);
      // The same X-ray contract the /analysis page renders: the Coach never recomputes it.
      const sides = await loadSideRounds(
        db,
        [playerId],
        overview.matches.map((m) => m.matchId),
      );
      const facts = buildCoachFacts(overview, dna, input.locale, {
        message: input.message,
        xray: buildXRay({ overview, dna, sides }),
        declared,
      });
      // Catalog: a few items relevant to THIS message (never the catalog itself). A catalog
      // read failure only means no suggestions; the Coach still answers.
      stage = "catalog";
      try {
        // DNA dimensions pick lessons only when the profile is READY (Fase 3.1).
        const needs = coachNeeds(input.message, coachDnaReadings(dna));
        if (needs.length) {
          const candidates = await fetchCatalogCandidates(db, input.locale, [
            ...new Set(needs.map((n) => n.topic)),
          ]);
          facts.catalogSuggestions = pickRecommendations(candidates, needs, input.locale, {
            max: 3,
            onePerNeed: true,
          }).map((r) => ({
            kind: r.kind,
            title: r.title,
            url: r.url,
            track: r.track,
            reason: `${r.need.topic} (${r.need.source === "message" ? "asked by the player" : `weakest DNA: ${r.need.detail}`})`,
          }));
        }
      } catch (error) {
        logFailure("catalog", error);
      }
      if (facts.dataState === "NO_MATCHES") return { ok: false, error: "COACH_NO_DATA" };
      const fullHistory = conversationId
        ? (await conversationMessages(db, conversationId, COACH_MAX_HISTORY))
            // A repaired request must not see its own unanswered question twice.
            .filter((m) => m.id !== input.requestId)
            .map((m) => ({
              role: m.role === "coach" ? ("coach" as const) : ("player" as const),
              content: m.content,
            }))
        : [];
      // Context size guard: the oldest turns go first; facts, rules and the question stay.
      const fixedChars = contextChars(buildCoachMessages(facts, [], input.message, input.locale));
      const { history, dropped } = fitHistory(fullHistory, fixedChars);
      const correlationId = input.requestId ?? crypto.randomUUID();
      if (dropped)
        console.info("[ai-coach] history trimmed", { correlationId, dropped, fixedChars });

      stage = "provider";
      const { completeCoach, CoachProviderFailure } =
        await import("@/lib/coach/coachProvider.server");
      let completion;
      try {
        completion = await completeCoach(
          buildCoachMessages(facts, history, input.message, input.locale),
          {
            maxTokens: COACH_MAX_REPLY_TOKENS,
            correlationId,
          },
        );
      } catch (error) {
        if (error instanceof CoachProviderFailure) {
          console.error("[ai-coach] provider failure", {
            correlationId,
            code: error.code,
            status: error.status,
            attempts: error.attempts.map((a) => `${a.provider}:${a.code ?? "ok"}`),
          });
          return {
            ok: false,
            error: error.code,
            attempts: error.attempts.map((a) => ({
              provider: a.provider,
              code: a.code,
              status: a.status,
              transport: a.transport,
            })),
          };
        }
        throw error;
      }

      // Persist only after the provider answered, so a failed attempt can be retried
      // without leaving an unanswered message (and is not counted against the limit).
      // Only links the server selected may reach the player or the history.
      const sanitized = sanitizeReplyLinks(
        completion.content,
        new Set(facts.catalogSuggestions.map((s) => s.url)),
      );
      // Every number, comparison and source is checked against PLAYER_FACTS before the
      // player sees it; unbacked lines are removed (coachReplyGuard).
      const guarded = guardCoachReply(sanitized.text.trim(), facts, input.locale);
      const content = guarded.text.trim();
      if (Object.values(guarded.removed).some((n) => n > 0))
        console.info("[ai-coach] reply guarded", { correlationId, ...guarded.removed });
      // Never fall back to the unsanitized text: an empty result is an empty reply.
      if (!content) return { ok: false, error: "COACH_PROVIDER_EMPTY" };
      stage = "persist";
      let createdConversation = false;
      if (!conversationId) {
        const { data: created, error } = await db
          .from("coach_conversations")
          .insert({ player_id: playerId, title: conversationTitle(input.message) })
          .select("id")
          .single();
        if (error || !created)
          throw new Error(`COACH_CONVERSATION_CREATE_FAILED:${error?.code ?? "unknown"}`);
        conversationId = created.id;
        createdConversation = true;
      }
      let playerRow: { id: string; role: string; content: string; created_at: string };
      if (repairOf && input.requestId) {
        const prior = await priorRequest(db, input.requestId);
        if (!prior) throw new Error("COACH_PLAYER_MESSAGE_FAILED:repair");
        playerRow = prior.player;
      } else {
        const { data: inserted, error: playerError } = await db
          .from("coach_messages")
          .insert({
            ...(input.requestId ? { id: input.requestId } : {}),
            conversation_id: conversationId,
            role: "player",
            content: input.message,
          })
          .select("id, role, content, created_at")
          .single();
        if (playerError?.code === "23505" && input.requestId) {
          // A concurrent send with the same request id won the race: never a second pair.
          if (createdConversation)
            await db.from("coach_conversations").delete().eq("id", conversationId);
          const prior = await priorRequest(db, input.requestId);
          if (prior?.reply)
            return {
              ok: true,
              conversationId: prior.conversationId,
              player: view(prior.player),
              coach: view(prior.reply),
              replayed: true,
            };
          return { ok: false, error: "COACH_REQUEST_IN_PROGRESS" };
        }
        if (playerError || !inserted)
          throw new Error(`COACH_PLAYER_MESSAGE_FAILED:${playerError?.code ?? "unknown"}`);
        playerRow = inserted;
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: coachRow, error: coachError } = await supabaseAdmin
        .from("coach_messages")
        .insert({
          conversation_id: conversationId,
          role: "coach",
          content,
          // Links the reply to the request it answers (idempotency); null for old clients.
          context_id: input.requestId,
          // Provenance of the reply (no content, no key): who answered, why a fallback
          // answered, the data state it was grounded on, tokens and provider-reported cost.
          context_type:
            `${coachProvenance(completion, facts)}|catalog=${facts.catalogSuggestions.length}|links_removed=${sanitized.removed}|${guardTag(guarded.removed)}`.slice(
              0,
              255,
            ),
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
      return { ok: false, error: stage === "persist" ? "COACH_PERSIST_FAILED" : "COACH_INTERNAL" };
    }
  });

function coachProvenance(
  completion: {
    provider: string;
    model: string;
    upstream: string | null;
    latencyMs: number;
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
    `upstream=${completion.upstream ?? "?"}`,
    `ms=${completion.latencyMs}`,
    `data=${facts.dataState}`,
    `matches=${facts.matches.length}`,
    `in=${u.promptTokens ?? "?"}`,
    `out=${u.completionTokens ?? "?"}`,
    `reasoning=${u.reasoningTokens ?? "?"}`,
    `cost_usd=${u.costUsd ?? "?"}`,
  ].join("|");
}
