import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20261006120000_r5_8_6_attestation_idempotency_scope.sql"),
  "utf8",
);

describe("R5.8.6 attestation idempotency scope", () => {
  it("moves provenance uniqueness from deployment identity to attestation digest", () => {
    expect(migration).toContain("parser_runtime_provenance_attestation_digest_key");
    expect(migration).toContain("UNIQUE (attestation_digest)");
    expect(migration).toContain(
      "ON CONFLICT(attestation_digest) DO NOTHING RETURNING id INTO _id;",
    );
    expect(migration).toContain("WHERE attestation_digest=_attestation_digest");
    expect(migration).toContain("R5_8_6_OLD_PROVENANCE_IDEMPOTENCY_CONSTRAINT_NOT_FOUND");
  });

  it("does not delete or rewrite historical provenance or nonce rows", () => {
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.parser_runtime_provenance/i);
    expect(migration).not.toMatch(/TRUNCATE\s+public\.parser_runtime_provenance/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.parser_runtime_provenance/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.parser_attestation_nonces/i);
    expect(migration).not.toMatch(/TRUNCATE\s+public\.parser_attestation_nonces/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.parser_attestation_nonces/i);
  });

  it("preserves the old deployment tuple only as the migration target", () => {
    expect(migration).toContain("deployment_id");
    expect(migration).toContain("deployment_commit");
    expect(migration).toContain("semantic_revision");
    expect(migration).toContain("build_revision");
    expect(migration).toContain(
      "ON CONFLICT(railway_project_id,railway_service_id,railway_environment_id,deployment_id,deployment_commit,semantic_revision,build_revision)",
    );
  });
});
