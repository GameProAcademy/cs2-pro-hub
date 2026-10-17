import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import {
  PARSER_ATTESTATION_EXPECTED,
  validateParserAttestationPayload,
} from "@/lib/parserAttestation";


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
    // These SQL definitions are historical evidence and intentionally retain
    // their contemporaneous hashes. Only the current application expectation moves
    // with the independently verified served build.
    const currentWorkerHash = "23a5f8624955181ad9033221cfae00138c7228dc";
    expect(appAttestation).toContain(
      `"services/cs2-demo-parser/worker.py": "${currentWorkerHash}"`,
    );
    expect(appAttestation).not.toContain(
      `"services/cs2-demo-parser/worker.py": "ab5fba0c8c2d9e17db9c04df7c2050416d2216f9"`,
    );
    expect(reference).toContain(`'${MANAGED_BLOB}'`);
    expect(migration).toContain(`'${REPOSITORY_BLOB}'`);
    expect(migration).toContain(`'${MANAGED_BLOB}'`);
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

describe("current attestation worker hash contract", () => {
  it("accepts the verified current hash and rejects the stale hash using the production validator", () => {
    const expected = PARSER_ATTESTATION_EXPECTED;
    const runtimeVersion = {
      name: expected.parser,
      version: expected.parserVersion,
      contract_version: expected.contractVersion,
      semantic_revision: `git:${expected.commit}`,
      build_revision: `git:${expected.buildCommit}`,
    };
    const hashes = {
      "services/cs2-demo-parser/parser.py": { observed: "981f6261c7e38334dfab5c93088e9d5ad1f56f6e", match: true },
      "services/cs2-demo-parser/adapter.py": { observed: "34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71", match: true },
      "services/cs2-demo-parser/worker.py": { observed: "23a5f8624955181ad9033221cfae00138c7228dc", match: true },
      "services/cs2-demo-parser/raw_evidence.py": { observed: "001281eecb02ebc318ff997f734c4081c161d1d9", match: true },
      "services/cs2-demo-parser/settings.py": { observed: "dc76db86c9b0b8c0916d58501ae0c21af95dfe38", match: true },
    };
    const payload = {
      schema_version: 3,
      repository: expected.repository,
      railway_branch: expected.branch,
      git_commit: expected.commit,
      deployment_id: expected.deploymentId,
      railway_project_id: expected.projectId,
      railway_service_id: expected.serviceId,
      railway_environment_id: expected.environmentId,
      workflow_identity: {
        repository: expected.repository,
        ref_name: expected.attestorBranch,
        workflow_ref: expected.workflowRef,
        run_id: "123456789",
        run_attempt: "1",
        workflow_sha: "700e792cec0b97d9dd3b0e595ebe444aec599090",
        trigger_commit_sha: "62023bbd603af1fb697f01055b392fc2ed80260e",
        workflow_file_commit_sha: "700e792cec0b97d9dd3b0e595ebe444aec599090",
        event_name: "workflow_dispatch",
        workflow_path: expected.workflowPath,
        workflow_source_sha: expected.workflowSourceSha,
      },
      attestor_source_identity: {
        repository: expected.repository,
        branch: expected.attestorBranch,
        workflow_sha: "700e792cec0b97d9dd3b0e595ebe444aec599090",
        trigger_commit_sha: "62023bbd603af1fb697f01055b392fc2ed80260e",
        workflow_file_commit_sha: "700e792cec0b97d9dd3b0e595ebe444aec599090",
        workflow_path: expected.workflowPath,
        workflow_source_sha: expected.workflowSourceSha,
      },
      release_gate_evidence: { mapping_inventory: { status: "BLOCKED", evidence_ref: "payload.mapping_release" } },
      attested_at: new Date().toISOString(),
      nonce: "a".repeat(64),
      parser_name: expected.parser,
      parser_version: expected.parserVersion,
      contract_version: expected.contractVersion,
      semantic_revision: `git:${expected.commit}`,
      build_revision: `git:${expected.buildCommit}`,
      runtime_identity: {
        repository: expected.repository,
        branch: expected.branch,
        commit: expected.commit,
        branch_contains_commit: true,
        tree: "1111111111111111111111111111111111111111",
      },
      deployment_evidence: {
        verification_source: "RAILWAY_API",
        independently_verified: true,
        deployment_id: expected.deploymentId,
        project_id: expected.projectId,
        service_id: expected.serviceId,
        environment_id: expected.environmentId,
        source_branch: expected.branch,
        source_commit: expected.deploymentSourceCommit,
        deployment_status: "SUCCESS",
        query_digest: "2".repeat(64),
      },
      custom_domain_version: runtimeVersion,
      railway_domain_version: runtimeVersion,
      critical_file_hashes: hashes,
      mapping_release: {
        release_id: expected.mappingReleaseId,
        inventory_version: expected.inventoryVersion,
        inventory_digest: expected.inventoryDigest,
        matrix_digest: expected.matrixDigest,
        row_count: 105,
        generic_count: 0,
        authorized_count: 0,
        verified_count: 0,
        status: "BLOCKED",
      },
    };
    expect(validateParserAttestationPayload(payload)).not.toContain(
      "CRITICAL_HASH_MISMATCH:services/cs2-demo-parser/worker.py",
    );
    const stalePayload = {
      ...payload,
      critical_file_hashes: {
        ...hashes,
        "services/cs2-demo-parser/worker.py": {
          observed: "ab5fba0c8c2d9e17db9c04df7c2050416d2216f9",
          match: true,
        },
      },
    };
    expect(validateParserAttestationPayload(stalePayload)).toContain(
      "CRITICAL_HASH_MISMATCH:services/cs2-demo-parser/worker.py",
    );
  });
});
