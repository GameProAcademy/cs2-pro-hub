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
const attestor = readFileSync(resolve("scripts/parser_runtime_attestation.py"), "utf8");
const workflow = readFileSync(resolve(".github/workflows/parser-runtime-attestation.yml"), "utf8");

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
    expect(aclMigration).toContain(
      "REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb) FROM PUBLIC, anon, authenticated",
    );
  });

  it("requires an external secret, canonical digest, HMAC, exact source, deployment, and runtime binding", () => {
    expect(aclMigration).toContain("PARSER_ATTESTATION_SECRET_NOT_CONFIGURED");
    expect(aclMigration).toContain("extensions.digest(convert_to(_canonical_payload");
    expect(aclMigration).toContain("extensions.hmac(convert_to(_canonical_payload");
    expect(aclMigration).toContain("GameProAcademy/cs2-pro-hub");
    expect(aclMigration).toContain("infra/cs2-parser-worker-v8");
    expect(aclMigration).toContain("6330c8c4-a410-45db-a364-4eb47702c2fc");
    expect(aclMigration).toContain(
      "custom_domain_version' IS DISTINCT FROM _payload->'railway_domain_version",
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
    expect(workflow).toContain("actions/attest-build-provenance@v2");
    expect(workflow).toContain("infra/cs2-parser-worker-v8");
    expect(attestor).toContain('statuses.append("BLOCKED_EXTERNAL_PROOF")');
    expect(attestor).not.toContain("record_parser_runtime_attestation");
  });
});
