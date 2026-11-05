/**
 * Fase 3.5 — orchestration of one AI Coach send around the durable reservation.
 *
 *   claim (atomic, global) → [REPLAY | IN_PROGRESS | CONFLICT | OUTCOME_UNKNOWN | …] → rate
 *   limit → generate (context + provider + link sanitizer + reply guard) → complete (question
 *   + reply + COMPLETED in one transaction, fenced) → on write failure keep the reply as
 *   PERSIST_PENDING (a retry persists it without generating again).
 *
 * Only the ACQUIRED outcome may reach `generate`, i.e. the provider. Every exit path leaves
 * the reservation in a recoverable state: FAILED when the provider certainly produced no
 * usable billed reply, OUTCOME_UNKNOWN when it may have (never retried automatically).
 * Pure orchestration: every side effect is injected, so the unit tests count provider calls.
 */
import {
  claimRequest,
  completeRequest,
  failRequest,
  persistPending,
  type RpcClient,
} from "./coachReservation.server";

export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export type Generated =
  | { ok: true; content: string; contextType: string; provider: string; model: string }
  | {
      ok: false;
      error: string;
      /** The provider may have generated (timeout / connection lost after sending). */
      uncertain: boolean;
      attempts?: Array<{
        provider: string;
        code: string | null;
        status: number | null;
        transport: string | null;
      }>;
    };

export type FlowResult =
  | {
      ok: true;
      conversationId: string;
      player: StoredMessage;
      coach: StoredMessage;
      replayed?: boolean;
    }
  | {
      ok: false;
      error: string;
      attempts?: Array<{
        provider: string;
        code: string | null;
        status: number | null;
        transport: string | null;
      }>;
    };

export interface FlowDeps {
  rpc: RpcClient;
  requestId: string;
  userId: string;
  playerId: string;
  conversationId: string | null;
  message: string;
  title: string;
  /** Reads the two persisted messages through the CALLER's client (RLS). */
  loadPair(
    playerMessageId: string,
    coachMessageId: string,
  ): Promise<{
    player: StoredMessage;
    coach: StoredMessage;
  } | null>;
  /** True when the player may send (hourly limit). */
  withinRateLimit(): Promise<boolean>;
  /** Context + provider + sanitizer + guard. Calls `markProviderCalled` right before the provider. */
  generate(markProviderCalled: () => void): Promise<Generated>;
  log(event: string, detail: Record<string, unknown>): void;
}

export async function coachSendFlow(d: FlowDeps): Promise<FlowResult> {
  const claim = await claimRequest(d.rpc, {
    requestId: d.requestId,
    userId: d.userId,
    playerId: d.playerId,
    conversationId: d.conversationId,
    message: d.message,
  });
  d.log("claim", { correlationId: d.requestId, outcome: claim.outcome });

  switch (claim.outcome) {
    case "NOT_OWNER":
      return { ok: false, error: "COACH_CONVERSATION_NOT_FOUND" };
    case "CONFLICT":
      return { ok: false, error: "COACH_REQUEST_ID_CONFLICT" };
    case "IN_PROGRESS":
      return { ok: false, error: "COACH_REQUEST_IN_PROGRESS" };
    case "OUTCOME_UNKNOWN":
      return { ok: false, error: "COACH_OUTCOME_UNKNOWN" };
    case "FAILED_FINAL":
      return { ok: false, error: "COACH_REQUEST_FAILED" };
    case "REPLAY": {
      if (!claim.conversationId || !claim.playerMessageId || !claim.coachMessageId)
        return { ok: false, error: "COACH_OUTCOME_UNKNOWN" };
      const pair = await d.loadPair(claim.playerMessageId, claim.coachMessageId);
      if (!pair) return { ok: false, error: "COACH_REQUEST_ID_CONFLICT" };
      return { ok: true, conversationId: claim.conversationId, ...pair, replayed: true };
    }
    case "PERSIST_TAKEOVER": {
      // The provider already answered; persist the kept reply. NO generation here.
      if (!claim.leaseToken || !claim.pendingReply)
        return { ok: false, error: "COACH_PERSIST_FAILED" };
      return persist(d, claim.leaseToken, {
        content: claim.pendingReply,
        contextType: claim.pendingContextType ?? "",
        provider: "",
        model: "",
      });
    }
    case "ACQUIRED":
      break;
  }
  const token = claim.leaseToken!;

  if (!(await d.withinRateLimit())) {
    await failRequest(d.rpc, {
      requestId: d.requestId,
      leaseToken: token,
      status: "FAILED",
      code: "COACH_RATE_LIMITED",
    });
    return { ok: false, error: "COACH_RATE_LIMITED" };
  }

  let providerCalled = false;
  let generated: Generated;
  try {
    generated = await d.generate(() => {
      providerCalled = true;
    });
  } catch (error) {
    // An unexpected error: before the provider nothing was billed (FAILED, retryable);
    // after it, we cannot know (OUTCOME_UNKNOWN, never retried automatically).
    const status = providerCalled ? "OUTCOME_UNKNOWN" : "FAILED";
    await failRequest(d.rpc, {
      requestId: d.requestId,
      leaseToken: token,
      status,
      code: "COACH_INTERNAL",
    });
    d.log("generate_failed", { correlationId: d.requestId, status });
    throw error;
  }

  if (!generated.ok) {
    const status = generated.uncertain ? "OUTCOME_UNKNOWN" : "FAILED";
    await failRequest(d.rpc, {
      requestId: d.requestId,
      leaseToken: token,
      status,
      code: generated.error,
    });
    return {
      ok: false,
      error: generated.uncertain ? "COACH_OUTCOME_UNKNOWN" : generated.error,
      ...(generated.attempts ? { attempts: generated.attempts } : {}),
    };
  }
  return persist(d, token, generated);
}

async function persist(
  d: FlowDeps,
  token: string,
  g: { content: string; contextType: string; provider: string; model: string },
): Promise<FlowResult> {
  try {
    const done = await completeRequest(d.rpc, {
      requestId: d.requestId,
      leaseToken: token,
      title: d.title,
      question: d.message,
      reply: g.content,
      contextType: g.contextType,
      provider: g.provider,
      model: g.model,
    });
    return {
      ok: true,
      conversationId: done.conversationId,
      player: {
        id: done.playerMessageId,
        role: "player",
        content: d.message,
        createdAt: done.playerCreatedAt,
      },
      coach: {
        id: done.coachMessageId,
        role: "coach",
        content: g.content,
        createdAt: done.coachCreatedAt,
      },
    };
  } catch (error) {
    const lost = error instanceof Error && error.message === "COACH_LEASE_LOST";
    // Lost lease: another executor owns the request (or the conversation was deleted).
    // Otherwise keep the reply so the next retry persists it without a new generation.
    const kept = lost
      ? false
      : await persistPending(d.rpc, {
          requestId: d.requestId,
          leaseToken: token,
          reply: g.content,
          contextType: g.contextType,
          provider: g.provider,
          model: g.model,
        });
    d.log("persist_failed", { correlationId: d.requestId, lost, kept });
    return { ok: false, error: lost ? "COACH_REQUEST_IN_PROGRESS" : "COACH_PERSIST_FAILED" };
  }
}
