/**
 * PM5 4.2.9 — adaptive training tables and RLS against a disposable PostgreSQL
 * (scripts/pm5/training_rls_harness.py). Players read only their own plans, versions and
 * sessions and cannot write any row (the server computes plan content and records explicit
 * session marks); one open plan per user; DONE needs a completion time. A mutation that opens
 * the read policy must be caught.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Result = { database: string; checks: Record<string, boolean>; failures: string[] };
const MIGRATION = "supabase/migrations/20261118140000_pm5_adaptive_training.sql";

function run(migration?: string): Result {
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "", HOME: "/tmp" };
  if (migration) env["TRAINING_MIGRATION"] = migration;
  const output = execFileSync("python3", ["scripts/pm5/training_rls_harness.py"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 240_000,
    env,
  });
  return JSON.parse(output.trim()) as Result;
}

describe("PM5 adaptive training RLS", () => {
  it("keeps plans private and server-written", () => {
    const result = run();
    expect(result.database).toBe("disposable-local-postgresql");
    expect(result.failures).toEqual([]);
    for (const name of [
      "migration_applies",
      "migration_reapplies",
      "service_writes_plans",
      "a_reads_only_own_plans",
      "a_reads_only_own_versions",
      "a_reads_only_own_sessions",
      "b_cannot_read_a_plans",
      "b_cannot_read_a_versions",
      "b_cannot_read_a_sessions",
      "anon_reads_no_plans",
      "a_cannot_insert_plan",
      "a_cannot_insert_version",
      "a_cannot_mark_own_session_done_directly",
      "a_cannot_edit_own_version",
      "a_cannot_delete_own_plan",
      "a_cannot_touch_b_session",
      "one_open_plan_per_user",
      "closed_plan_allows_new_one",
      "horizon_limited",
      "done_needs_completion_time",
      "version_unique_per_plan",
    ])
      expect(result.checks[name], name).toBe(true);
  }, 240_000);

  it("detects a read policy opened to every user", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm5-trn-mut-"));
    const mutated = join(dir, "mutated.sql");
    const sql = readFileSync(MIGRATION, "utf8").replace(
      "CREATE POLICY adaptive_training_plans_select_own ON public.adaptive_training_plans FOR SELECT TO authenticated\n  USING (user_id = auth.uid());",
      "CREATE POLICY adaptive_training_plans_select_own ON public.adaptive_training_plans FOR SELECT TO authenticated\n  USING (true);",
    );
    expect(sql).toContain("USING (true)");
    writeFileSync(mutated, sql);
    const result = run(mutated);
    expect(result.failures).toContain("b_cannot_read_a_plans");
  }, 240_000);
});
