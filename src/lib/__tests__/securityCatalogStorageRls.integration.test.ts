/**
 * PM6 B — catalog and storage RLS correction against a disposable PostgreSQL
 * (scripts/security/catalog_storage_rls_harness.py). The harness reproduces the production
 * policies, proves the two findings are real in that baseline, applies the migration verbatim
 * twice and checks anonymous, user A, user B, staff and two admin_master accounts.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Result = { database: string; checks: Record<string, boolean>; failures: string[] };

function run(migration?: string): Result {
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "", HOME: "/tmp" };
  if (migration) env["SECURITY_MIGRATION"] = migration;
  const output = execFileSync("python3", ["scripts/security/catalog_storage_rls_harness.py"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 240_000,
    env,
  });
  return JSON.parse(output.trim()) as Result;
}

describe("PM6 security: public catalog and forensic storage policies", () => {
  it("closes both findings without breaking legitimate access", () => {
    const result = run();
    expect(result.database).toBe("disposable-local-postgresql");
    expect(result.failures).toEqual([]);
    for (const name of [
      "baseline_anon_reads_inactive_lesson",
      "baseline_other_master_reads_forensic",
      "migration_applies",
      "migration_reapplies",
      "anon_sees_only_active_lessons",
      "anon_sees_only_active_lesson_translations",
      "anon_sees_only_active_skills",
      "anon_sees_only_active_skill_translations",
      "anon_sees_only_links_between_active_rows",
      "staff_still_sees_all_lessons",
      "master_still_sees_all_skills",
      "a_cannot_read_b_demo",
      "b_cannot_read_a_demo",
      "anon_reads_no_object",
      "a_cannot_write_into_b_folder",
      "user_cannot_read_forensic",
      "owner_master_keeps_forensic_read",
      "owner_master_keeps_forensic_update",
      "other_master_loses_forensic_read",
      "other_master_loses_forensic_update",
      "service_role_keeps_forensic_read",
    ]) {
      expect(result.checks[name], name).toBe(true);
    }
  }, 300_000);

  it("a no-op migration is caught (mutation)", () => {
    const dir = mkdtempSync(join(tmpdir(), "sec-mut-"));
    const noop = join(dir, "noop.sql");
    writeFileSync(noop, "SELECT 1;\n");
    const result = run(noop);
    expect(result.failures).toEqual(
      expect.arrayContaining(["anon_sees_only_active_lessons", "other_master_loses_forensic_read"]),
    );
  }, 300_000);
});
