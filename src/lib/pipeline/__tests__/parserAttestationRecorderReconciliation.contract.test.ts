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
    // R5.8.7 is historical: since R5.8.9 the app pins the worker blob of the served build.
    expect(appAttestation).toContain(
      `"services/cs2-demo-parser/worker.py": "ab5fba0c8c2d9e17db9c04df7c2050416d2216f9"`,
    );
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

  it("changes no data, grant or index; deployment uniqueness is left to R5.8.8", () => {
    const code = migration.replace(/^\s*--.*$/gm, "");
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\s+(INTO\s+)?public\./i);
    expect(code).not.toMatch(/\b(GRANT|REVOKE)\b/i);
    expect(code).not.toMatch(/\b(DROP|CREATE)\s+(UNIQUE\s+)?INDEX\b/i);
    expect(code).not.toContain("parser_runtime_provenance_deployment_identity_idx");
    expect(code).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
  });
});

const r588 = readFileSync(
  resolve("supabase/migrations/20261012210000_r5_8_8_drop_deployment_identity_uniqueness.sql"),
  "utf8",
);
const r588Rollback = readFileSync(
  resolve(
    "docs/rollback/20261012210000_r5_8_8_deployment_uniqueness_rollback_repository_builds_only.sql",
  ),
  "utf8",
);

describe("R5.8.8 deployment-scoped provenance uniqueness (D3 option a)", () => {
  const code = r588.replace(/^\s*--.*$/gm, "");

  it("drops only the index R5.8.6 meant to remove, and only with its original definition", () => {
    expect(code).toContain(
      "_index_name constant text := 'parser_runtime_provenance_deployment_identity_idx'",
    );
    expect(code).toContain(
      "USING btree (railway_project_id, railway_service_id, railway_environment_id, deployment_id, '",
    );
    expect(code).toContain("pg_catalog.format('DROP INDEX public.%I', _index_name)");
    expect(code.match(/DROP\s/g)).toHaveLength(1);
    expect(code).toContain("R5_8_8_UNEXPECTED_INDEX_DEFINITION");
    expect(code).toContain("R5_8_8_UNEXPECTED_DEPLOYMENT_UNIQUENESS");
    expect(code).toContain("R5_8_8_DEPLOYMENT_INDEX_ALREADY_ABSENT");
  });

  it("requires the replay controls and the reconciled recorder before and after", () => {
    expect(code).toContain("'UNIQUE (attestation_digest)'");
    expect(code).toContain("'PRIMARY KEY (nonce)'");
    expect(code).toContain("'fe3250af2b461f03f459adf36b43ec21'");
    expect(code).toContain("ARRAY['before', 'after']");
  });

  it("changes no data or grant and adds nothing", () => {
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\s+(INTO\s+)?public\./i);
    expect(code).not.toMatch(/\b(GRANT|REVOKE)\b/i);
    // The only CREATE is inside the string literal describing the expected index.
    expect(code.replace(/'[^']*'/g, "''")).not.toMatch(/\bCREATE\b/i);
    expect(code).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
  });

  it("has rollbacks restricted to repository builds", () => {
    const r587Rollback = readFileSync(
      resolve("docs/rollback/20261012200000_r5_8_7_recorder_rollback_repository_builds_only.sql"),
      "utf8",
    );
    for (const rollback of [r587Rollback, r588Rollback]) {
      expect(rollback).toContain("_REFUSED_ON_MANAGED_DATABASE");
      expect(rollback).toContain("created_by = ''apikey@lovable.dev''");
      expect(rollback).not.toMatch(/\b(DELETE|TRUNCATE)\b/i);
    }
  });

  it("has a rollback that refuses instead of deleting attestations", () => {
    expect(r588Rollback).toContain("R5_8_8_ROLLBACK_WOULD_REQUIRE_DELETING_ATTESTATIONS");
    expect(r588Rollback).toContain("HAVING count(*) > 1");
    expect(r588Rollback).not.toMatch(/\b(DELETE|TRUNCATE|UPDATE)\b/i);
  });
});
