/**
 * PM5 4.2.10 — moments library tables and RLS against a disposable PostgreSQL
 * (scripts/pm5/moments_rls_harness.py): users A and B, a shared canonical match and private
 * matches. Own rows only, bookmark only on an owned match, no cross-user read/update/delete
 * (IDOR), collection items only between the caller's own collection and bookmark, deleting a
 * collection or a match never deletes canonical data. A mutation that drops the match-ownership
 * check must be caught.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Result = { database: string; checks: Record<string, boolean>; failures: string[] };
const MIGRATION = "supabase/migrations/20261118120000_pm5_moments_library.sql";

function run(migration?: string): Result {
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "", HOME: "/tmp" };
  if (migration) env["MOMENTS_MIGRATION"] = migration;
  const output = execFileSync("python3", ["scripts/pm5/moments_rls_harness.py"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 240_000,
    env,
  });
  return JSON.parse(output.trim()) as Result;
}

describe("PM5 moments library RLS", () => {
  it("keeps every bookmark and collection private to its owner", () => {
    const result = run();
    expect(result.database).toBe("disposable-local-postgresql");
    expect(result.failures).toEqual([]);
    for (const name of [
      "migration_applies",
      "migration_reapplies",
      "a_bookmarks_own_private_match",
      "b_bookmarks_shared_match",
      "a_cannot_bookmark_b_private_match",
      "a_cannot_bookmark_as_b",
      "bookmark_needs_a_match",
      "a_reads_only_own",
      "b_reads_only_own",
      "anon_reads_nothing",
      "a_cannot_update_b",
      "a_cannot_delete_b",
      "a_cannot_transfer_to_b",
      "a_cannot_repoint_to_b_match",
      "range_too_long_rejected",
      "inverted_range_rejected",
      "a_adds_own_bookmark_to_own_collection",
      "a_cannot_add_b_bookmark",
      "a_cannot_add_to_b_collection",
      "a_cannot_move_item_to_b_collection",
      "b_cannot_read_a_collections",
      "b_cannot_delete_a_collection",
      "deleting_collection_keeps_bookmark",
      "deleted_match_unlinks_bookmark",
      "deleting_bookmark_keeps_match",
    ])
      expect(result.checks[name], name).toBe(true);
  }, 240_000);

  it("detects a policy that drops the match-ownership check", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm5-mom-mut-"));
    const mutated = join(dir, "mutated.sql");
    const sql = readFileSync(MIGRATION, "utf8").replace(
      "WITH CHECK (user_id = auth.uid() AND match_id IS NOT NULL AND public.owns_canonical_match(match_id));",
      "WITH CHECK (user_id = auth.uid());",
    );
    writeFileSync(mutated, sql);
    const result = run(mutated);
    expect(result.failures).toContain("a_cannot_bookmark_b_private_match");
  }, 240_000);
});
