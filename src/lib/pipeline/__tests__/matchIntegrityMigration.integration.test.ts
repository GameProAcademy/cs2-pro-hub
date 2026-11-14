/** PM6 C — the match-integrity decision column against a disposable PostgreSQL. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function run(migration?: string): { checks: Record<string, boolean>; failures: string[] } {
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "", HOME: "/tmp" };
  if (migration) env["MI_MIGRATION"] = migration;
  return JSON.parse(
    execFileSync("python3", ["scripts/pm6/match_integrity_migration_harness.py"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 120_000,
      env,
    }).trim(),
  ) as { checks: Record<string, boolean>; failures: string[] };
}

describe("PM6 C — demo_jobs.match_integrity", () => {
  it("nullable, contract-shaped and write-once", () => {
    const result = run();
    expect(result.failures).toEqual([]);
    expect(Object.keys(result.checks).length).toBeGreaterThanOrEqual(10);
  }, 180_000);

  it("a migration without the guard is caught (mutation)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mi-mut-"));
    const file = join(dir, "m.sql");
    writeFileSync(
      file,
      "ALTER TABLE public.demo_jobs ADD COLUMN IF NOT EXISTS match_integrity jsonb;\n",
    );
    expect(run(file).failures).toEqual(
      expect.arrayContaining(["decision_is_write_once", "refuses_unknown_status"]),
    );
  }, 180_000);
});
