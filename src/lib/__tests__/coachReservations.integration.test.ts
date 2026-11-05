/**
 * Fase 3.5 — the reservation SQL against a disposable PostgreSQL with independent sessions
 * (scripts/coach-reservation-harness.py). Applies the migration verbatim and also proves
 * that two mutations (non-atomic claim, no fencing) break the guarantees.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("coach request reservations against disposable PostgreSQL", () => {
  it("one owner per request id under real concurrency; fencing; RLS and grants", () => {
    const output = execFileSync("python3", ["scripts/coach-reservation-harness.py"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 180_000,
      env: { PATH: process.env["PATH"], HOME: "/tmp", COACH_RESERVATION_ITERATIONS: "20" },
    });
    const result = JSON.parse(output.trim()) as {
      database: string;
      independentConnections: boolean;
      checks: Record<string, boolean>;
      failures: string[];
      teardown: boolean;
      details: Record<string, unknown>;
    };
    expect(result.database).toBe("disposable-local-postgresql");
    expect(result.independentConnections).toBe(true);
    expect(result.failures).toEqual([]);
    expect(Object.keys(result.checks).length).toBeGreaterThanOrEqual(28);
    for (const name of [
      "same_user_concurrent_single_provider_call",
      "two_accounts_same_uuid_conflict_before_provider",
      "replay_returns_persisted_no_duplicates",
      "in_progress_no_second_call",
      "expired_processing_becomes_outcome_unknown",
      "outcome_unknown_never_retried",
      "failed_then_single_takeover",
      "stale_executor_cannot_write",
      "persist_pending_single_repairer_no_generation",
      "player_or_reply_write_failure_is_atomic",
      "foreign_id_reveals_nothing",
      "same_uuid_other_conversation_conflicts",
      "anon_and_authenticated_denied",
      "mutation_naive_claim_is_caught",
      "mutation_no_fencing_is_caught",
    ])
      expect(result.checks[name], name).toBe(true);
    expect(result.teardown).toBe(true);
  }, 200_000);
});
