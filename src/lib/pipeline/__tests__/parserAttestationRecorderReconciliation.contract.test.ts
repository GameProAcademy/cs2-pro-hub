import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20261012200000_r5_8_7_reconcile_attestation_recorder_live_definition.sql",
  ),
  "utf8",
);
const reference = readFileSync(
  resolve("docs/reference/record_parser_runtime_attestation.live-2026-10-12.sql"),
  "utf8",
);
const appAttestation = readFileSync(resolve("src/lib/parserAttestation.ts"), "utf8");

const MANAGED_MD5 = "fe3250af2b461f03f459adf36b43ec21";
const REPOSITORY_MD5 = "5ea1ffff4fc874ca50f0081b9c9a5e71";
const MANAGED_BLOB = "50a53b607d26f00b4de05c5e8998611959e27bd1";
const REPOSITORY_BLOB = "dfc2e67fcb3644be91108079f9096947c16119b3";

describe("R5.8.7 attestation recorder reconciliation", () => {
  it("accepts exactly the managed and the repository starting definitions", () => {
    const hashes = [...new Set(migration.match(/'[0-9a-f]{32}'/g) ?? [])];
    expect(hashes.sort()).toEqual([`'${REPOSITORY_MD5}'`, `'${MANAGED_MD5}'`].sort());
    expect(migration).toContain("R5_8_7_RECORDER_UNEXPECTED_DEFINITION");
    expect(migration).toContain("R5_8_7_RECORDER_POSTCONDITION_INVALID");
  });

  it("substitutes only the worker blob, towards the managed value the app already requires", () => {
    expect(migration).toContain(`_repository_worker_blob constant text := '${REPOSITORY_BLOB}'`);
    expect(migration).toContain(`_managed_worker_blob constant text := '${MANAGED_BLOB}'`);
    expect(appAttestation).toContain(`"services/cs2-demo-parser/worker.py": "${MANAGED_BLOB}"`);
    expect(reference).toContain(`'${MANAGED_BLOB}'`);
    expect(reference).not.toContain(REPOSITORY_BLOB);
  });

  it("asserts security properties, grants and comment before and after", () => {
    for (const marker of [
      "p.prosecdef",
      "p.proconfig = ARRAY['search_path=\"\"']::text[]",
      "pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'",
      "has_function_privilege('service_role', _fn, 'EXECUTE')",
      "has_function_privilege('anon', _fn, 'EXECUTE')",
      "has_function_privilege('authenticated', _fn, 'EXECUTE')",
      "R5_8_7_RECORDER_COMMENT_INVALID",
      "ARRAY['before', 'after']",
    ]) {
      expect(migration).toContain(marker);
    }
  });

  it("changes no data, grant or index, and keeps the deployment identity index (D3)", () => {
    const code = migration.replace(/^\s*--.*$/gm, "");
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\s+(INTO\s+)?public\./i);
    expect(code).not.toMatch(/\b(GRANT|REVOKE)\b/i);
    expect(code).not.toMatch(/\b(DROP|CREATE)\s+(UNIQUE\s+)?INDEX\b/i);
    expect(code).not.toContain("parser_runtime_provenance_deployment_identity_idx");
    expect(code).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
  });
});
