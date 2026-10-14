import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEMO_CLEANUP_EXECUTION_ENABLED } from "@/config/pipeline";

const MIGRATION = "supabase/migrations/20261014200000_g6_r4_identity_retention_hold.sql";
const sql = readFileSync(MIGRATION, "utf8");
const code = sql.replace(/--[^\n]*/g, "");

const hasPostgres =
  existsSync("/usr/lib/postgresql") &&
  readdirSync("/usr/lib/postgresql").some((v) => existsSync(`/usr/lib/postgresql/${v}/bin/initdb`));

describe("G.6-R4 identity retention hold", () => {
  it("starts only from the reviewed gate definition or its target, and asserts the target", () => {
    expect(code).toContain("e90fa6c7f5987a3c16c02fdb75160bcc");
    expect(code).toContain("6eeda5bf93f9f7268c884b0f8c931efe");
    expect(code).toContain("G6_R4_UNEXPECTED_DEFINITION");
    expect(code).toContain("G6_R4_POSTCONDITION_INVALID");
    expect(code).toContain("G6_R4_FRAGMENT_COUNT_INVALID");
  });

  it("holds every non-cancelled job without confirmed identity and never defines a deletion deadline", () => {
    expect(code).toContain("IDENTITY_UNCONFIRMED_HOLD");
    expect(code).toContain("attachment_state = ''attached''");
    expect(code).toContain("IN (''user_confirmed'',''manual_selected'')");
    expect(code).toContain("_job.status <> ''cancelled''");
    expect(code).not.toMatch(/interval/i);
  });

  it("keeps the gate service-only, definer, stable, with an empty search_path", () => {
    expect(code).toContain("has_function_privilege('service_role', _fn, 'EXECUTE')");
    expect(code).toContain("has_function_privilege('anon', _fn, 'EXECUTE')");
    expect(code).toContain("has_function_privilege('authenticated', _fn, 'EXECUTE')");
    expect(code).toContain("p.provolatile = 's'");
    expect(code).toContain(`ARRAY['search_path=""']`);
  });

  it("touches no row, grant or cleanup switch", () => {
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/i);
    expect(DEMO_CLEANUP_EXECUTION_ENABLED).toBe(false);
  });

  it.runIf(hasPostgres)(
    "behaves as specified on a disposable PostgreSQL and never loosens a verdict",
    () => {
      const run = spawnSync("python3", ["scripts/retention/identity_hold_harness.py"], {
        encoding: "utf8",
        timeout: 240_000,
      });
      const line = run.stdout.split("\n").find((l) => l.startsWith("RESULT:"));
      expect(line, run.stdout + run.stderr).toBeDefined();
      const result = JSON.parse(line!.slice(7));
      expect(result.status, JSON.stringify(result)).toBe("PASS");
      expect(result.scenarios.failed_unattached.after).toBe("IDENTITY_UNCONFIRMED_HOLD");
      expect(result.scenarios.cancelled_unattached.after).toBe("ELIGIBLE");
      expect(result.rerun).toBe("NO_OP");
      expect(result.drifted_definition).toBe("REFUSED");
    },
    300_000,
  );
});
