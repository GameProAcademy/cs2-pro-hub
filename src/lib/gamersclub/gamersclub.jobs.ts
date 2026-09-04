/**
 * Gamers Club job semantics — pure state machine.
 *
 * The persistence/claiming pattern mirrors the existing FACEIT/demo workers
 * (`FOR UPDATE SKIP LOCKED` + heartbeat + stale recovery + attempt ceiling).
 * This module owns only the SEMANTICS, so both the worker and its tests share
 * one definition of "what did this run really achieve?".
 *
 * Rules encoded here:
 * - COMPLETED is not a synonym of SUCCESS.
 * - PARTIAL is never reported as SUCCESS.
 * - A blocked source is its own outcome, not an implementation failure.
 * - Deadline/budget/cancellation end the run in a controlled way and are never
 *   swallowed.
 */
import {
  GC_JOB_STALE_SECONDS,
  GC_MAX_JOB_ATTEMPTS,
  GC_MAX_RETRY_WAIT_MS,
} from "./gamersclub.constants";
import { isGamersClubError, type GamersClubErrorCode } from "./gamersclub.errors";

export const GC_JOB_TYPES = [
  "gamers_club_profile_sync",
  "gamers_club_match_history_sync",
  "gamers_club_match_details_sync",
  "gamers_club_stats_sync",
  "identity_correlation_job",
] as const;
export type GamersClubJobType = (typeof GC_JOB_TYPES)[number];

/** Lifecycle state persisted on the job row. */
export const GC_JOB_STATUSES = ["queued", "processing", "completed", "failed", "retrying"] as const;
export type GamersClubJobStatus = (typeof GC_JOB_STATUSES)[number];

/** Semantic outcome of one execution. Independent of the lifecycle state. */
export const GC_JOB_OUTCOMES = [
  "success",
  "partial",
  "failed",
  "blocked_external_access",
  "rate_limited",
  "timeout",
  "cancelled",
] as const;
export type GamersClubJobOutcome = (typeof GC_JOB_OUTCOMES)[number];

export interface GamersClubRunCounters {
  itemsExpected: number | null;
  itemsCollected: number;
  itemsDeferred: number;
  budgetExhausted: boolean;
  deadlineExceeded: boolean;
  blocked: boolean;
  rateLimited: boolean;
  cancelled: boolean;
  failed: boolean;
}

export function emptyRunCounters(): GamersClubRunCounters {
  return {
    itemsExpected: null,
    itemsCollected: 0,
    itemsDeferred: 0,
    budgetExhausted: false,
    deadlineExceeded: false,
    blocked: false,
    rateLimited: false,
    cancelled: false,
    failed: false,
  };
}

export function classifyRunOutcome(counters: GamersClubRunCounters): GamersClubJobOutcome {
  if (counters.cancelled) return "cancelled";
  if (counters.blocked) return "blocked_external_access";
  if (counters.rateLimited) return "rate_limited";
  if (counters.deadlineExceeded) {
    return counters.itemsCollected > 0 ? "partial" : "timeout";
  }
  if (counters.budgetExhausted || counters.itemsDeferred > 0) return "partial";
  if (counters.failed) return counters.itemsCollected > 0 ? "partial" : "failed";
  if (counters.itemsExpected !== null && counters.itemsCollected < counters.itemsExpected) {
    return "partial";
  }
  return "success";
}

/**
 * How the lifecycle should end. A run can finish technically while remaining
 * semantically partial — the outcome is persisted alongside the status.
 */
export function nextJobStatus(
  outcome: GamersClubJobOutcome,
  attempts: number,
  maxAttempts: number = GC_MAX_JOB_ATTEMPTS,
): GamersClubJobStatus {
  if (outcome === "success" || outcome === "partial") return "completed";
  // A permanent external block is not retried: retrying cannot change it.
  if (outcome === "blocked_external_access" || outcome === "cancelled") return "failed";
  return attempts >= maxAttempts ? "failed" : "retrying";
}

export function isJobStale(
  heartbeatAt: string | null,
  now: number = Date.now(),
  staleSeconds: number = GC_JOB_STALE_SECONDS,
): boolean {
  if (!heartbeatAt) return true;
  const time = Date.parse(heartbeatAt);
  if (Number.isNaN(time)) return true;
  return now - time > staleSeconds * 1000;
}

/** Exponential backoff with jitter, capped, and never past the deadline. */
export function retryDelayMs(
  attempt: number,
  options: { retryAfterMs?: number | null; random?: () => number; deadlineAt?: number; now?: number } = {},
): number {
  const now = options.now ?? Date.now();
  const base = Math.min(GC_MAX_RETRY_WAIT_MS, 500 * 2 ** Math.max(0, attempt - 1));
  const jitter = (options.random ?? Math.random)() * base * 0.25;
  let delay = Math.min(GC_MAX_RETRY_WAIT_MS, Math.round(base + jitter));
  if (options.retryAfterMs !== undefined && options.retryAfterMs !== null) {
    delay = Math.min(GC_MAX_RETRY_WAIT_MS, Math.max(delay, options.retryAfterMs));
  }
  if (options.deadlineAt !== undefined) {
    // Waiting past the deadline is pointless: no request may start afterwards.
    delay = Math.min(delay, Math.max(0, options.deadlineAt - now));
  }
  return delay;
}

/** Control errors must escape the run and reach the job layer untouched. */
export function shouldRethrow(error: unknown): boolean {
  return isGamersClubError(error) && error.control;
}

export function controlCodeToCounters(
  code: GamersClubErrorCode,
  counters: GamersClubRunCounters,
): GamersClubRunCounters {
  if (code === "GC_WORKER_DEADLINE_EXCEEDED") return { ...counters, deadlineExceeded: true };
  if (code === "GC_API_BUDGET_EXHAUSTED") return { ...counters, budgetExhausted: true };
  if (code === "GC_CANCELLED") return { ...counters, cancelled: true };
  if (code === "GC_BLOCKED_EXTERNAL_ACCESS") return { ...counters, blocked: true };
  if (code === "GC_RATE_LIMITED") return { ...counters, rateLimited: true };
  return { ...counters, failed: true };
}

/**
 * Ownership gate: before persisting anything, the worker re-reads the connection
 * and refuses to write when it disappeared, changed owner or was disconnected
 * mid-run. This prevents takeover and late attribution of stale data.
 */
export interface ConnectionOwnershipSnapshot {
  connectionId: string;
  playerId: string;
  status: string;
}

export function canPersistForConnection(
  claimed: ConnectionOwnershipSnapshot,
  current: ConnectionOwnershipSnapshot | null,
): boolean {
  if (current === null) return false;
  if (current.connectionId !== claimed.connectionId) return false;
  if (current.playerId !== claimed.playerId) return false;
  return current.status === "connected" || current.status === "pending";
}
