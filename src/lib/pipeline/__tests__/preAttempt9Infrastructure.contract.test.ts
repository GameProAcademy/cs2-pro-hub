import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260922081136_4be12bdc-b7f7-425f-b7a2-862834bf49ce.sql"),
  "utf8",
);
const hardeningMigration = readFileSync(
  resolve("supabase/migrations/20260922091723_ba54139e-9e9d-4d40-ae57-232fd1461829.sql"),
  "utf8",
);
const parityMigration = readFileSync(
  resolve("supabase/migrations/20260922093643_6fa8a841-6d45-4220-90ac-d53b8b7d04da.sql"),
  "utf8",
);
const workflowBindingMigration = readFileSync(
  resolve("supabase/migrations/20260922093815_8745c511-6a49-4950-bff2-6bed730d5587.sql"),
  "utf8",
);
const r57Migration = readFileSync(
  resolve("supabase/migrations/20260923084535_357aad48-bac1-451b-a991-c76cfd20b66f.sql"),
  "utf8",
);
const r573Migration = readFileSync(
  resolve("supabase/migrations/20260923091130_de2051f7-577e-4c53-a40e-424d1ef1e3ae.sql"),
  "utf8",
);
const r573ConstraintMigration = readFileSync(
  resolve("supabase/migrations/20260923091427_9b483c0c-340d-4d66-9354-3e44c2ffda5e.sql"),
  "utf8",
);
const r575Migration = readFileSync(
  resolve("supabase/migrations/20260923093242_b5dfb9fd-34cf-4ac9-b098-55dfd1ea5698.sql"),
  "utf8",
);
const r575MethodConstraintMigration = readFileSync(
  resolve("supabase/migrations/20260923093925_0b84af34-7960-452b-ac75-30dca940bb8f.sql"),
  "utf8",
);

describe("C.7-C.10 pre-Attempt-9 infrastructure", () => {
  it("keeps attestation nonces private, immutable and replay-rejecting", () => {
    expect(migration).toContain("nonce text PRIMARY KEY");
    expect(migration).toContain("attestation_digest text NOT NULL UNIQUE");
    expect(migration).toContain("parser_attestation_nonces_immutable");
    expect(migration).toContain("REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES");
    expect(hardeningMigration).toContain(
      "REVOKE ALL ON TABLE public.parser_attestation_nonces FROM PUBLIC, anon, authenticated",
    );
    expect(hardeningMigration).toContain(
      "GRANT SELECT, INSERT ON TABLE public.parser_attestation_nonces TO service_role",
    );
  });

  it("limits provenance to append-only service access and removes TRUNCATE from every client role", () => {
    expect(hardeningMigration).toContain(
      "REVOKE ALL ON TABLE public.parser_runtime_provenance FROM PUBLIC, anon, authenticated",
    );
    expect(hardeningMigration).toContain(
      "GRANT SELECT, INSERT ON TABLE public.parser_runtime_provenance TO service_role",
    );
    expect(hardeningMigration.match(/REVOKE ALL ON TABLE/g)).toHaveLength(4);
  });

  it("records the approved internal sandbox exception without widening privileges", () => {
    expect(parityMigration).toContain(
      "GRANT SELECT, INSERT ON TABLE public.parser_attestation_nonces TO service_role, sandbox_exec",
    );
    expect(parityMigration).toContain(
      "GRANT SELECT, INSERT ON TABLE public.parser_runtime_provenance TO service_role, sandbox_exec",
    );
    expect(parityMigration).toContain("client_roles_zero_privileges");
    expect(parityMigration).toContain("UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES");
  });

  it("keeps the final pre-real-demo diagnostic read-only and blocked", () => {
    expect(parityMigration).toContain("public.pre_real_demo_gate_status()");
    expect(parityMigration).toContain("'status', 'BLOCKED_BEFORE_REAL_DEMO'");
    expect(parityMigration).not.toMatch(
      /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE) public\.uploads\b/,
    );
  });

  it("enforces the reviewed workflow source at the persistence boundary", () => {
    expect(workflowBindingMigration).toContain("ATTESTATION_WORKFLOW_VERSION_NOT_APPROVED");
    expect(r57Migration).toContain("13ce10e95a508e62d832bb9dc432e1496499676c");
    expect(r57Migration).toContain("refs/heads/main");
    expect(r57Migration).toContain(
      "NEW.release_gate_evidence IS DISTINCT FROM NEW.attestation_payload->'release_gate_evidence'",
    );
    expect(workflowBindingMigration).toContain("parser_runtime_provenance_approved_workflow");
  });

  it("reconciles provenance assertion with attestation schema v3 without authorizing Attempt 9", () => {
    expect(r573Migration).toContain("attestation_version <> 3");
    expect(r573Migration).not.toContain("attestation_version <> 2");
    expect(r573Migration).toContain("PARSER_PROVENANCE_UNVERIFIED");
    expect(r573Migration).toContain("refs/heads/main");
    expect(r573Migration).toContain("13ce10e95a508e62d832bb9dc432e1496499676c");
    expect(r573Migration).toContain(
      "_p.release_gate_evidence IS DISTINCT FROM _p.attestation_payload->'release_gate_evidence'",
    );
    expect(r573ConstraintMigration).toContain("CHECK (attestation_version = 3)");
    expect(r573ConstraintMigration).not.toContain("CHECK (attestation_version = 1)");
    expect(r573Migration).toContain("attestation schema v3");
    expect(r573Migration).toContain("attestation_version <> 3");
    expect(r573Migration).toContain("does not recompute a non-canonical JSON digest");
  });

  it("persists only the v3 method and keeps all three workflow SHA concepts distinct", () => {
    expect(r575Migration).toContain("GITHUB_ACTIONS_SIGNED_ATTESTATION_V3");
    expect(r575Migration).not.toContain("GITHUB_ACTIONS_SIGNED_ATTESTATION_V2");
    expect(r575Migration).toContain(
      "workflow_sha' IS DISTINCT FROM NEW.workflow_identity->>'trigger_commit_sha",
    );
    expect(r575Migration).toContain("workflow_file_commit_sha' !~ '^[0-9a-f]{40}$'");
    expect(r575Migration).toContain("13ce10e95a508e62d832bb9dc432e1496499676c");
    expect(r575Migration).toContain("refs/heads/main");
    expect(r575Migration).toContain("infra/cs2-parser-worker-v8");
    expect(r575Migration).toContain(
      "_release_gate_evidence IS DISTINCT FROM _payload->'release_gate_evidence'",
    );
    expect(r575Migration).not.toContain("20260923100000_r573_attestation_version_v3.sql");
    expect(r575MethodConstraintMigration).toContain(
      "CHECK (verification_method = 'GITHUB_ACTIONS_SIGNED_ATTESTATION_V3')",
    );
    expect(r575MethodConstraintMigration).not.toContain("ATTESTATION_V1");
    expect(r575MethodConstraintMigration).not.toContain("ATTESTATION_V2");
  });

  it("makes the readiness contract explicitly Cache-specific without weakening any gate", () => {
    expect(hardeningMigration).toContain("public.assert_cache_attempt_9_ready");
    expect(hardeningMigration).toContain("d89b697f-c40d-42f4-ae51-040e4e8cabba");
    expect(hardeningMigration).toContain("file_size = 473748061");
    expect(hardeningMigration).toContain("attempt_number = 8");
    expect(hardeningMigration).toContain("attempt_number >= 9");
    expect(hardeningMigration).toContain("public.assert_canonical_mapping_gate()");
    expect(hardeningMigration).toContain("RETURN 'BLOCKED'");
    expect(hardeningMigration).not.toContain("WARNING");
  });

  it("keeps mapping authorization fail-closed for generic and unverified sources", () => {
    expect(migration).toContain("'derived_or_constant','generic','unknown','*','all'");
    expect(migration).toContain("NOT canonical_authorization");
    expect(migration).toContain("CANONICAL_MAPPING_GATE_BLOCKED");
  });

  it("produces NOT_RUN parity and determinism reports without a DEM", () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepro-pre-attempt-9-"));
    const parity = join(directory, "parity.json");
    const determinism = join(directory, "determinism.json");
    try {
      execFileSync("node", ["scripts/run_python_wasm_parity.mjs", "--output", parity]);
    } catch {
      // NOT_RUN intentionally exits non-zero so CI cannot mistake it for proof.
    }
    try {
      execFileSync("node", ["scripts/run_parser_determinism.mjs", "--output", determinism]);
    } catch {
      // NOT_RUN intentionally exits non-zero so CI cannot mistake it for proof.
    }
    expect(JSON.parse(readFileSync(parity, "utf8"))).toMatchObject({
      status: "NOT_RUN",
      canonical_authorization: false,
    });
    expect(JSON.parse(readFileSync(determinism, "utf8"))).toMatchObject({
      status: "NOT_RUN",
      canonical_authorization: false,
    });
  });
});
