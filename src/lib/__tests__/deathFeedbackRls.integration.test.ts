/**
 * PM2 4.2.3 — death_feedback table and RLS against a disposable PostgreSQL
 * (scripts/pm2/death_feedback_rls_harness.py): users A and B, a shared canonical match and private
 * matches; own death only, no cross-user read/write/delete (IDOR), anon nothing, immutable keys.
 * A mutation that drops the death-ownership check must be caught.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Result = { database: string; checks: Record<string, boolean>; failures: string[] };
const MIGRATION = "supabase/migrations/20261114130000_pm2_death_feedback.sql";

function run(migration?: string): Result {
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "", HOME: "/tmp" };
  if (migration) env["DEATH_FEEDBACK_MIGRATION"] = migration;
  const output = execFileSync("python3", ["scripts/pm2/death_feedback_rls_harness.py"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 240_000,
    env,
  });
  return JSON.parse(output.trim()) as Result;
}

describe("PM2 death feedback RLS", () => {
  it("lets each player give feedback only on their own deaths", () => {
    const result = run();
    expect(result.database).toBe("disposable-local-postgresql");
    expect(result.failures).toEqual([]);
    for (const name of [
      "migration_applies",
      "migration_reapplies",
      "a_inserts_feedback_on_own_death",
      "a_reads_only_own_rows",
      "b_reads_only_own_rows",
      "anon_reads_nothing",
      "a_cannot_feedback_b_death_shared_match",
      "a_cannot_feedback_b_private_death",
      "a_cannot_feedback_own_kill",
      "a_cannot_mismatch_event_and_match",
      "a_cannot_write_as_b",
      "a_cannot_update_b_row",
      "a_cannot_delete_b_row",
      "key_is_immutable",
      "cannot_transfer_row_to_b",
      "anon_cannot_execute_helper",
    ])
      expect(result.checks[name], name).toBe(true);
  }, 240_000);

  it("detects a policy that drops the death-ownership check", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm2-fb-mut-"));
    const mutated = join(dir, "mutated.sql");
    const sql = readFileSync(MIGRATION, "utf8").replace(
      " AND public.owns_death_event(round_event_id, match_id));",
      ");",
    );
    writeFileSync(mutated, sql);
    const result = run(mutated);
    expect(result.failures).toContain("a_cannot_feedback_b_death_shared_match");
  }, 240_000);
});
