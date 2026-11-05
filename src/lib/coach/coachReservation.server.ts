/**
 * Fase 3.5 — server access to the durable request reservations
 * (supabase/migrations/20261105100000_coach_request_reservations.sql).
 *
 * Every function runs with the SERVICE ROLE (the only role allowed to execute the RPCs);
 * user and player always come from the authenticated session, never from the request.
 * The client is injectable so the orchestration is unit-tested without a database; the
 * atomicity itself is proven against real PostgreSQL by scripts/coach-reservation-harness.py.
 */
import { createHash } from "node:crypto";

export type ClaimOutcome =
  | "ACQUIRED"
  | "PERSIST_TAKEOVER"
  | "REPLAY"
  | "IN_PROGRESS"
  | "CONFLICT"
  | "OUTCOME_UNKNOWN"
  | "FAILED_FINAL"
  | "NOT_OWNER";

export interface Claim {
  outcome: ClaimOutcome;
  leaseToken: string | null;
  conversationId: string | null;
  playerMessageId: string | null;
  coachMessageId: string | null;
  pendingReply: string | null;
  pendingContextType: string | null;
}

export interface Completed {
  conversationId: string;
  playerMessageId: string;
  playerCreatedAt: string;
  coachMessageId: string;
  coachCreatedAt: string;
}

/** The subset of the Supabase client the reservation needs (RPC only). */
export interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

/** Lease long enough for the provider timeout (45 s) plus one bounded retry. */
export const COACH_LEASE_SECONDS = 120;

const OUTCOMES = new Set<ClaimOutcome>([
  "ACQUIRED",
  "PERSIST_TAKEOVER",
  "REPLAY",
  "IN_PROGRESS",
  "CONFLICT",
  "OUTCOME_UNKNOWN",
  "FAILED_FINAL",
  "NOT_OWNER",
]);

/** A request id is bound to ONE question: replaying the id with another text conflicts. */
export function messageDigest(message: string): string {
  return createHash("sha256").update(message, "utf8").digest("hex");
}

export async function serviceRpc(): Promise<RpcClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as RpcClient;
}

function one<T>(data: unknown): T | null {
  return (Array.isArray(data) ? data[0] : data) as T | null;
}

export async function claimRequest(
  rpc: RpcClient,
  args: {
    requestId: string;
    userId: string;
    playerId: string;
    conversationId: string | null;
    message: string;
  },
): Promise<Claim> {
  const { data, error } = await rpc.rpc("coach_claim_request", {
    p_request_id: args.requestId,
    p_user_id: args.userId,
    p_player_id: args.playerId,
    p_conversation_id: args.conversationId,
    p_message_sha256: messageDigest(args.message),
    p_lease_seconds: COACH_LEASE_SECONDS,
  });
  if (error) throw new Error(`COACH_CLAIM_FAILED:${error.code ?? "unknown"}`);
  const row = one<{
    outcome: string;
    lease_token: string | null;
    conversation_id: string | null;
    player_message_id: string | null;
    coach_message_id: string | null;
    pending_reply: string | null;
    pending_context_type: string | null;
  }>(data);
  if (!row || !OUTCOMES.has(row.outcome as ClaimOutcome))
    throw new Error("COACH_CLAIM_FAILED:shape");
  return {
    outcome: row.outcome as ClaimOutcome,
    leaseToken: row.lease_token,
    conversationId: row.conversation_id,
    playerMessageId: row.player_message_id,
    coachMessageId: row.coach_message_id,
    pendingReply: row.pending_reply,
    pendingContextType: row.pending_context_type,
  };
}

/** Question + reply + COMPLETED in one transaction, fenced by the lease token. */
export async function completeRequest(
  rpc: RpcClient,
  args: {
    requestId: string;
    leaseToken: string;
    title: string;
    question: string;
    reply: string;
    contextType: string;
    provider: string;
    model: string;
  },
): Promise<Completed> {
  const { data, error } = await rpc.rpc("coach_complete_request", {
    p_request_id: args.requestId,
    p_lease_token: args.leaseToken,
    p_title: args.title,
    p_question: args.question,
    p_reply: args.reply,
    p_context_type: args.contextType,
    p_provider: args.provider,
    p_model: args.model,
  });
  if (error) {
    const lost = /COACH_LEASE_LOST/.test(error.message ?? "");
    throw new Error(lost ? "COACH_LEASE_LOST" : `COACH_COMPLETE_FAILED:${error.code ?? "unknown"}`);
  }
  const row = one<{
    conversation_id: string;
    player_message_id: string;
    player_created_at: string;
    coach_message_id: string;
    coach_created_at: string;
  }>(data);
  if (!row) throw new Error("COACH_COMPLETE_FAILED:shape");
  return {
    conversationId: row.conversation_id,
    playerMessageId: row.player_message_id,
    playerCreatedAt: row.player_created_at,
    coachMessageId: row.coach_message_id,
    coachCreatedAt: row.coach_created_at,
  };
}

/** FAILED (a retry may take over) or OUTCOME_UNKNOWN (never retried automatically). */
export async function failRequest(
  rpc: RpcClient,
  args: {
    requestId: string;
    leaseToken: string;
    status: "FAILED" | "OUTCOME_UNKNOWN";
    code: string;
  },
): Promise<boolean> {
  const { data, error } = await rpc.rpc("coach_fail_request", {
    p_request_id: args.requestId,
    p_lease_token: args.leaseToken,
    p_status: args.status,
    p_error_code: args.code.replace(/[^A-Z0-9_]/g, "_").slice(0, 64),
  });
  if (error) return false;
  return data === true;
}

/** Keeps a guarded reply whose final write failed, so a retry persists it at no cost. */
export async function persistPending(
  rpc: RpcClient,
  args: {
    requestId: string;
    leaseToken: string;
    reply: string;
    contextType: string;
    provider: string;
    model: string;
  },
): Promise<boolean> {
  const { data, error } = await rpc.rpc("coach_persist_pending", {
    p_request_id: args.requestId,
    p_lease_token: args.leaseToken,
    p_reply: args.reply,
    p_context_type: args.contextType,
    p_provider: args.provider,
    p_model: args.model,
  });
  if (error) return false;
  return data === true;
}
