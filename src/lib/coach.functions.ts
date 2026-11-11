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
import { buildProScore } from "@/lib/proScore";
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
import {
  enforceNameUse,
  resolveCoachName,
  shouldUseName,
  stripChatbotPhrases,
  type CoachAddress,
} from "@/lib/coach/coachPersona";
import { guardCoachReply, guardTag } from "@/lib/coach/coachReplyGuard";
import { coachSendFlow } from "@/lib/coach/coachSendFlow";
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
  | "COACH_OUTCOME_UNKNOWN"
  | "COACH_REQUEST_FAILED"
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
  /** How the Coach greets the player (resolved server-side; never an e-mail or id). */
  playerName?: string | null;
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

/**
 * How the Coach addresses the caller (RLS: own rows only). The e-mail is read only to make
 * sure a display name that IS the e-mail (or its local part) is never used; it never reaches
 * the model. Any failed read means "no name" and the Coach says "you".
 */
async function loadCoachAddress(
  db: Db,
  userId: string,
  playerId: string,
  conversationId: string | null,
  preferred: string | null,
): Promise<CoachAddress> {
  try {
    const [player, account, replies] = await Promise.all([
      db.from("player_profiles").select("nickname").eq("id", playerId).maybeSingle(),
      db.from("profiles").select("nickname, display_name, email").eq("id", userId).maybeSingle(),
      conversationId
        ? db
            .from("coach_messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .eq("role", "coach")
        : Promise.resolve({ count: 0, error: null }),
    ]);
    const { name, source } = resolveCoachName({
      preferred,
      playerNickname: player.error ? null : (player.data?.nickname ?? null),
      accountNickname: account.error ? null : (account.data?.nickname ?? null),
      displayName: account.error ? null : (account.data?.display_name ?? null),
      email: account.error ? null : (account.data?.email ?? null),
    });
    // Unknown reply count → do not use the name (never "every message").
    const useName = replies.error ? false : shouldUseName(replies.count ?? 0);
    return { name, source, useName };
  } catch (error) {
    logFailure("address", error);
    return { name: null, source: null, useName: false };
  }
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
    const [{ dna }, conversationId, used, address] = await Promise.all([
      loadPlayerDna(db, context.userId),
      latestConversation(db, playerId),
      playerMessagesLastHour(db, playerId),
      loadCoachPreferences(db, playerId)
        .then((p) => p.preferredName ?? null)
        .catch(() => null)
        .then((preferred) => loadCoachAddress(db, context.userId, playerId, null, preferred)),
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
      playerName: address.name,
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

      // The conversation must belong to the caller BEFORE anything is reserved.
      stage = "conversation";
      const conversationId = input.conversationId;
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

      // Fase 3.5: a durable, global and atomic reservation decides who may call the
      // provider (coachSendFlow). Old clients without a request id get a fresh one.
      stage = "reserve";
      const requestId = input.requestId ?? crypto.randomUUID();
      const correlationId = requestId;
      const { serviceRpc } = await import("@/lib/coach/coachReservation.server");
      const result = await coachSendFlow({
        rpc: await serviceRpc(),
        requestId,
        userId: context.userId,
        playerId,
        conversationId,
        message: input.message,
        title: conversationTitle(input.message),
        loadPair: async (playerMessageId, coachMessageId) => {
          // Through the caller's client: RLS proves the pair is theirs.
          const { data, error } = await db
            .from("coach_messages")
            .select("id, role, content, created_at")
            .in("id", [playerMessageId, coachMessageId]);
          if (error) throw new Error(`COACH_MESSAGES_READ_FAILED:${error.code ?? "unknown"}`);
          const player = data?.find((m) => m.id === playerMessageId);
          const coach = data?.find((m) => m.id === coachMessageId);
          return player && coach ? { player: view(player), coach: view(coach) } : null;
        },
        withinRateLimit: async () =>
          (await playerMessagesLastHour(db, playerId)) < COACH_MAX_PLAYER_MESSAGES_PER_HOUR,
        log: (event, detail) => console.info(`[ai-coach] ${event}`, detail),
        generate: async (markProviderCalled) => {
          stage = "context";
          const [overview, { dna, rows: dnaRows }, declared, preferredName] = await Promise.all([
            loadPlayerOverview(db, context.userId),
            loadPlayerDna(db, context.userId),
            loadDeclaredProfile(db, playerId),
            loadCoachPreferences(db, playerId)
              .then((p) => p.preferredName ?? null)
              .catch(() => null),
          ]);
          const address = await loadCoachAddress(
            db,
            context.userId,
            playerId,
            conversationId,
            preferredName,
          );
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
            // Same rows, same pure function as the Dashboard / Performance Score.
            proScore: buildProScore(dnaRows),
          });
          // Catalog: a few items relevant to THIS message (never the catalog itself). A
          // catalog read failure only means no suggestions; the Coach still answers.
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
          if (facts.dataState === "NO_MATCHES")
            return { ok: false, error: "COACH_NO_DATA", uncertain: false };
          const fullHistory = conversationId
            ? (await conversationMessages(db, conversationId, COACH_MAX_HISTORY)).map((m) => ({
                role: m.role === "coach" ? ("coach" as const) : ("player" as const),
                content: m.content,
              }))
            : [];
          // Context size guard: the oldest turns go first; facts, rules and question stay.
          const fixedChars = contextChars(
            buildCoachMessages(facts, [], input.message, input.locale, address),
          );
          const { history, dropped } = fitHistory(fullHistory, fixedChars);
          if (dropped)
            console.info("[ai-coach] history trimmed", { correlationId, dropped, fixedChars });

          stage = "provider";
          const { completeCoach, CoachProviderFailure, outcomeUncertain } =
            await import("@/lib/coach/coachProvider.server");
          let completion;
          try {
            markProviderCalled();
            completion = await completeCoach(
              buildCoachMessages(facts, history, input.message, input.locale, address),
              { maxTokens: COACH_MAX_REPLY_TOKENS, correlationId },
            );
          } catch (error) {
            if (!(error instanceof CoachProviderFailure)) throw error;
            console.error("[ai-coach] provider failure", {
              correlationId,
              code: error.code,
              status: error.status,
              attempts: error.attempts.map((a) => `${a.provider}:${a.code ?? "ok"}`),
            });
            return {
              ok: false,
              error: error.code,
              uncertain: outcomeUncertain(error),
              attempts: error.attempts.map((a) => ({
                provider: a.provider,
                code: a.code,
                status: a.status,
                transport: a.transport,
              })),
            };
          }

          // Only links the server selected may reach the player or the history.
          const sanitized = sanitizeReplyLinks(
            completion.content,
            new Set(facts.catalogSuggestions.map((s) => s.url)),
          );
          // Every number, comparison and source is checked against PLAYER_FACTS before the
          // player sees it; unbacked lines are removed (coachReplyGuard).
          const guarded = guardCoachReply(sanitized.text.trim(), facts, input.locale, {
            playerName: address.name,
          });
          // Trainer voice: chatbot filler out; the name only where the server allowed it.
          const persona = stripChatbotPhrases(guarded.text.trim(), input.locale);
          const named = enforceNameUse(persona.text, address);
          const content = named.text.trim();
          if (Object.values(guarded.removed).some((n) => n > 0))
            console.info("[ai-coach] reply guarded", { correlationId, ...guarded.removed });
          if (persona.removed || named.removed)
            console.info("[ai-coach] persona", {
              correlationId,
              filler: persona.removed,
              name: named.removed,
            });
          // Never fall back to the unsanitized text: an empty result is an empty reply.
          if (!content) return { ok: false, error: "COACH_PROVIDER_EMPTY", uncertain: false };
          stage = "persist";
          return {
            ok: true,
            content,
            // Provenance of the reply (no content, no key): who answered, why a fallback
            // answered, the data state it was grounded on, tokens and provider-reported cost.
            contextType:
              `${coachProvenance(completion, facts)}|catalog=${facts.catalogSuggestions.length}|links_removed=${sanitized.removed}|${guardTag(guarded.removed)}|name=${address.source ?? "none"}:${address.useName ? 1 : 0}|filler=${persona.removed}`.slice(
                0,
                255,
              ),
            provider: completion.provider,
            model: completion.model,
          };
        },
      });
      if (!result.ok) return result as CoachSendResult;
      return {
        ok: true,
        conversationId: result.conversationId,
        player: result.player as CoachMessageView,
        coach: result.coach as CoachMessageView,
        ...(result.replayed ? { replayed: true } : {}),
      };
    } catch (error) {
      logFailure(stage, error);
      return { ok: false, error: "COACH_INTERNAL" };
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
