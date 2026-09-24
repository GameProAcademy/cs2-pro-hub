import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const gateMigration = readFileSync(
  resolve("supabase/migrations/20260922020331_e681ee1a-9c63-46de-a059-b3d566254e25.sql"),
  "utf8",
);
const aclMigration = readFileSync(
  resolve("supabase/migrations/20260922020440_55f0a265-0e1d-4890-8382-6d6d8f26cb4d.sql"),
  "utf8",
);
const closureMigration = readFileSync(
  resolve("supabase/migrations/20260922060006_86148852-19aa-4341-af5d-6e3fa4d08063.sql"),
  "utf8",
);
const attestor = readFileSync(resolve("scripts/parser_runtime_attestation.py"), "utf8");
const workflow = readFileSync(resolve(".github/workflows/parser-runtime-attestation.yml"), "utf8");
const releaseMigration = readFileSync(
  resolve("supabase/migrations/20260922073148_196da5bd-d5f4-4296-8131-0cac0b26c059.sql"),
  "utf8",
);
const readinessMigration = readFileSync(
  resolve("supabase/migrations/20260922081136_4be12bdc-b7f7-425f-b7a2-862834bf49ce.sql"),
  "utf8",
);
const transientSecretBridgeMigration = readFileSync(
  resolve("supabase/migrations/20260924075412_bd5954f3-8218-4a10-a059-24b01fa84cc6.sql"),
  "utf8",
);
const workflowAllowlistMigration = readFileSync(
  resolve("supabase/migrations/20260924075612_9f6bbc78-b031-4297-bbbc-5fe49e24c9c2.sql"),
  "utf8",
);

const REQUIRED_GATES = [
  "parser_runtime_identity",
  "provenance_verified",
  "provenance_fresh",
  "provenance_immutable",
  "attestation_valid",
  "github_source_identity",
  "railway_deployment_identity",
  "runtime_version",
  "custom_domain_binding",
  "critical_file_hashes",
  "canonical_scoped_field_gate",
  "mapping_inventory",
  "tick_domain",
  "real_demo_authorization",
  "attempt_sequencing",
  "cleanup_safety",
  "retry_safety",
  "storage_copy_safety",
  "no_attempt_10_plus",
  "no_canonical_contamination",
  "unresolved_required_mapping",
  "ci",
];

describe("G.6-R.4-C attestation and release-gate contract", () => {
  it("keeps both governance tables private and all new RPCs service-only", () => {
    expect(aclMigration).toContain(
      "REVOKE ALL ON TABLE public.canonical_mapping_inventory FROM PUBLIC, anon, authenticated",
    );
    expect(aclMigration).toContain(
      "REVOKE ALL ON TABLE public.parser_runtime_provenance FROM PUBLIC, anon, authenticated",
    );
    expect(gateMigration).toContain(
      "REVOKE ALL ON FUNCTION public.assert_canonical_mapping_gate() FROM PUBLIC, anon, authenticated",
    );
    expect(closureMigration).toContain(
      "REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb) FROM PUBLIC, anon, authenticated",
    );
    expect(closureMigration).toContain(
      "REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.canonical_mapping_inventory FROM service_role",
    );
  });

  it("requires an external secret, canonical digest, HMAC, exact source, deployment, and runtime binding", () => {
    expect(closureMigration).toContain("PARSER_ATTESTATION_SECRET_NOT_CONFIGURED");
    expect(closureMigration).toContain("extensions.digest(convert_to(_canonical_payload");
    expect(closureMigration).toContain("extensions.hmac(convert_to(_canonical_payload");
    expect(closureMigration).toContain("GameProAcademy/cs2-pro-hub");
    expect(closureMigration).toContain("infra/cs2-parser-worker-v8");
    expect(closureMigration).toContain("6330c8c4-a410-45db-a364-4eb47702c2fc");
    expect(closureMigration).toContain(
      "custom_domain_version' IS DISTINCT FROM _payload->'railway_domain_version",
    );
    expect(closureMigration).toContain("_payload->>'schema_version' <> '2'");
    expect(closureMigration).toContain(
      "_p.workflow_identity->>'workflow_sha' = _p.deployment_commit",
    );
  });

  it("anchors freshness to verification_timestamp with bounded future skew", () => {
    expect(gateMigration).toContain("_p.verification_timestamp > now() + interval '5 minutes'");
    expect(gateMigration).toContain("_p.verification_timestamp < now() - interval '24 hours'");
    expect(gateMigration).not.toContain("_p.created_at < now() - interval '24 hours'");
  });

  it("checks all 22 named release conditions and still blocks unresolved Canonical mappings", () => {
    for (const gate of REQUIRED_GATES) expect(gateMigration).toContain(`'${gate}'`);
    expect(gateMigration).toContain("public.assert_canonical_mapping_gate()");
    expect(gateMigration).toContain("REAL_DEMO_RELEASE_GATE_BLOCKED");
    expect(gateMigration).toContain("ATTEMPT_10_FORBIDDEN");
  });

  it("builds evidence in GitHub Actions and never self-asserts database provenance", () => {
    expect(workflow).toContain(
      "actions/attest-build-provenance@96b4a1ef7235a096b17240c259729fdd70c83d45",
    );
    expect(workflow).toContain("infra/cs2-parser-worker-v8");
    expect(attestor).toContain('statuses.append("BLOCKED_EXTERNAL_PROOF")');
    expect(attestor).toContain("RAILWAY_API_TOKEN");
    expect(attestor).not.toContain("RAILWAY_DEPLOYMENT_EVIDENCE_JSON");
    expect(attestor).toContain('"authorized_count": 0');
    expect(workflow).not.toContain("RELEASE_GATE_EVIDENCE_JSON");
    expect(attestor).not.toContain("record_parser_runtime_attestation");
  });

  it("uses an append-only 105-row release authority and a 32-condition final gate", () => {
    expect(releaseMigration).toContain("CREATE TABLE public.canonical_mapping_inventory_releases");
    expect(releaseMigration).toContain(
      "CREATE TABLE public.canonical_mapping_inventory_release_rows",
    );
    expect(releaseMigration).toContain("canonical_mapping_inventory_releases_immutable");
    expect(releaseMigration).toContain("canonical_mapping_inventory_release_rows_immutable");
    expect(releaseMigration).toContain("row_count=105 AND generic_count=0 AND authorized_count=0");
    expect(releaseMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.assert_pre_attempt_9_ready",
    );
    expect(releaseMigration).toContain("'runtime_frozen'");
    expect(releaseMigration).toContain("BLOCKED_BEFORE_ATTEMPT_9");
  });

  it("uses controlled workflow_dispatch/workflow_run triggers and immutable GitHub repository identity", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("workflow_call:");
    expect(attestor).toContain('event not in {"workflow_dispatch", "workflow_run"}');
    expect(attestor).toContain("GITHUB_WORKFLOW_RUN_UPSTREAM_NOT_APPROVED");
    expect(workflow.match(/uses: [^\n]+@[0-9a-f]{40}/g)).toHaveLength(5);
    expect(workflow).not.toMatch(/uses: [^\n]+@v\d/);
    expect(attestor).toContain("ATTESTATION_WORKFLOW_VERSION_NOT_APPROVED");
  });

  it("requires fresh replay-safe v3 attestation and exposes only a two-state readiness diagnostic", () => {
    expect(readinessMigration).toContain("CREATE TABLE public.parser_attestation_nonces");
    expect(readinessMigration).toContain("parser_attestation_nonces_immutable");
    expect(readinessMigration).toContain("PARSER_ATTESTATION_FRESHNESS_INVALID");
    expect(readinessMigration).toContain("_payload->>'schema_version'<>'3'");
    expect(readinessMigration).toContain(
      "record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)",
    );
    expect(readinessMigration).toContain("RETURN 'READY_TO_EXECUTE_ATTEMPT_9'");
    expect(readinessMigration).toContain("RETURN 'BLOCKED'");
    expect(readinessMigration).toContain("lower(btrim(source_field)) IN");
  });

  it("injects the HMAC secret transaction-locally through a service-only wrapper", () => {
    expect(transientSecretBridgeMigration).toContain(
      "record_parser_runtime_attestation_with_secret",
    );
    expect(transientSecretBridgeMigration).toContain("pg_catalog.set_config(");
    expect(transientSecretBridgeMigration).toContain("_hmac_secret,\n    true");
    expect(transientSecretBridgeMigration).toContain("public.record_parser_runtime_attestation(");
    expect(transientSecretBridgeMigration).toContain("FROM PUBLIC;\nREVOKE ALL ON FUNCTION");
    expect(transientSecretBridgeMigration).toContain("FROM anon;");
    expect(transientSecretBridgeMigration).toContain("FROM authenticated;");
    expect(transientSecretBridgeMigration).toContain("TO service_role;");
    expect(transientSecretBridgeMigration).not.toMatch(/INSERT[\s\S]*_hmac_secret/i);
  });

  it("pins the protected workflow adapter to its reviewed source identity", () => {
    expect(workflowAllowlistMigration).toContain("de6732f465cae08c96aece304558273242b7016d");
    expect(workflowAllowlistMigration).toContain("enforce_approved_attestation_workflow");
    expect(workflowAllowlistMigration).toContain("record_parser_runtime_attestation");
    expect(workflowAllowlistMigration).toContain("assert_verified_parser_provenance");
  });
});
