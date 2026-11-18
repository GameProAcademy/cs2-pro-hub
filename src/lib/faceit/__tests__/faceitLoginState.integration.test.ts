/**
 * PM5 — FACEIT login-state migration against a disposable PostgreSQL
 * (scripts/pm5/faceit_login_state_harness.py): LINK attempts keep their user, LOGIN attempts
 * need a 64-hex browser binding and no user, clients still have no access. Dropping the NULL
 * guard on the binding must be caught (a NULL regex match would pass a CHECK).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Result = { database: string; checks: Record<string, boolean>; failures: string[] };
const MIGRATION = "supabase/migrations/20261118160000_pm5_faceit_login_state.sql";

function run(migration?: string): Result {
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "", HOME: "/tmp" };
  if (migration) env["FACEIT_LOGIN_MIGRATION"] = migration;
  const output = execFileSync("python3", ["scripts/pm5/faceit_login_state_harness.py"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 240_000,
    env,
  });
  return JSON.parse(output.trim()) as Result;
}

describe("PM5 FACEIT login state", () => {
  it("binds LINK attempts to a user and LOGIN attempts to a browser", () => {
    const result = run();
    expect(result.database).toBe("disposable-local-postgresql");
    expect(result.failures).toEqual([]);
    for (const name of [
      "migration_applies",
      "migration_reapplies",
      "legacy_row_is_link",
      "link_without_user_refused",
      "default_purpose_needs_user",
      "login_with_binding_ok",
      "login_without_binding_refused",
      "login_bad_binding_refused",
      "login_with_user_refused",
      "unknown_purpose_refused",
      "authenticated_cannot_read",
      "anon_cannot_insert",
    ])
      expect(result.checks[name], name).toBe(true);
  }, 240_000);

  it("detects a constraint that lets a LOGIN attempt through without a binding", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm5-fl-mut-"));
    const mutated = join(dir, "mutated.sql");
    const sql = readFileSync(MIGRATION, "utf8").replace(
      "AND browser_binding_hash IS NOT NULL\n",
      "\n",
    );
    expect(sql).not.toContain("browser_binding_hash IS NOT NULL");
    writeFileSync(mutated, sql);
    expect(run(mutated).failures).toContain("login_without_binding_refused");
  }, 240_000);
});
