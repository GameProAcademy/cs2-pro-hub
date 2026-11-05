/**
 * Fase 4.0.1 — scheduled retention and flash-assist provenance SQL against a disposable
 * PostgreSQL with independent sessions (scripts/phase401-harness.py), plus mutation tests:
 * each mutant weakens one guarantee of the migration and the harness must catch it.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20261106100000_phase401_retention_flash.sql";

type HarnessResult = { checks: Record<string, boolean>; failures: string[]; teardown: boolean };

function runHarness(migrationOverride?: string): HarnessResult {
  const env: Record<string, string | undefined> = { PATH: process.env["PATH"], HOME: "/tmp" };
  if (migrationOverride) env["PHASE401_MIGRATION"] = migrationOverride;
  const output = execFileSync("python3", ["scripts/phase401-harness.py"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 180_000,
    env,
  });
  return JSON.parse(output.trim()) as HarnessResult;
}

function mutant(from: string | RegExp, to: string): HarnessResult {
  const source = readFileSync(MIGRATION, "utf8");
  const mutated = source.replace(from, to);
  expect(mutated).not.toBe(source);
  const dir = mkdtempSync(join(tmpdir(), "phase401-mutant-"));
  const file = join(dir, "mutant.sql");
  writeFileSync(file, mutated, { mode: 0o644 });
  execFileSync("chmod", ["755", dir]);
  try {
    return runHarness(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Fase 4.0.1 against disposable PostgreSQL", () => {
  it("retention is bounded, exclusive, recorded and recoverable; provenance is consistent and private", () => {
    const result = runHarness();
    expect(result.failures).toEqual([]);
    expect(Object.keys(result.checks).length).toBeGreaterThanOrEqual(24);
    expect(result.teardown).toBe(true);
  }, 200_000);

  it.each([
    [
      "no advisory lock",
      /IF NOT pg_try_advisory_xact_lock\(hashtextextended\('notification_retention_run', 0\)\) THEN/,
      "IF false THEN",
      "concurrent_run_skipped",
    ],
    ["unbounded batches", "OR v_b >= v_max", "", "bounded_batches"],
    [
      "sum not enforced",
      "AND credited = credited_by_flag + credited_by_timing",
      "",
      "provenance_sum_enforced",
    ],
    [
      "provenance readable by everyone",
      "USING (public.owns_player(player_id))",
      "USING (true)",
      "provenance_own_only",
    ],
    [
      "players may run retention",
      "GRANT EXECUTE ON FUNCTION public.notification_retention_run(integer, integer) TO service_role;",
      "GRANT EXECUTE ON FUNCTION public.notification_retention_run(integer, integer) TO service_role, authenticated;",
      "retention_service_role_only",
    ],
  ])(
    "mutant '%s' is caught",
    (_name, from, to, expectedFailure) => {
      const result = mutant(from, to);
      expect(result.failures).toContain(expectedFailure);
    },
    200_000,
  );
});
