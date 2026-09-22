import { describe, expect, it } from "vitest";

import {
  PARSER_ATTESTATION_EXPECTED,
  PARSER_ATTESTATION_OIDC,
  PARSER_ATTESTATION_SCHEMA_VERSION,
  validateParserAttestationOidcClaims,
  validateParserAttestationPayload,
} from "@/lib/parserAttestation";

const NOW = 1_790_064_000;
const workflowIdentity = {
  workflow_sha: "a".repeat(40),
  run_id: "42",
  run_attempt: "1",
};

function validClaims(): Record<string, unknown> {
  return {
    iss: PARSER_ATTESTATION_OIDC.issuer,
    aud: PARSER_ATTESTATION_OIDC.audience,
    repository: PARSER_ATTESTATION_EXPECTED.repository,
    repository_id: PARSER_ATTESTATION_OIDC.repositoryId,
    repository_owner: PARSER_ATTESTATION_OIDC.repositoryOwner,
    repository_owner_id: PARSER_ATTESTATION_OIDC.repositoryOwnerId,
    ref: PARSER_ATTESTATION_OIDC.branchRef,
    workflow_ref: PARSER_ATTESTATION_EXPECTED.workflowRef,
    job_workflow_ref: PARSER_ATTESTATION_EXPECTED.workflowRef,
    sub: PARSER_ATTESTATION_OIDC.subject,
    event_name: PARSER_ATTESTATION_OIDC.eventName,
    sha: workflowIdentity.workflow_sha,
    run_id: workflowIdentity.run_id,
    run_attempt: workflowIdentity.run_attempt,
    iat: NOW - 30,
    exp: NOW + 300,
  };
}

describe("parser attestation OIDC claims", () => {
  it("accepts only the pinned repository, branch, workflow, subject, and run", () => {
    expect(validateParserAttestationOidcClaims(validClaims(), workflowIdentity, NOW)).toEqual([]);
  });

  it.each([
    "aud",
    "repository",
    "repository_id",
    "repository_owner",
    "repository_owner_id",
    "ref",
    "workflow_ref",
    "job_workflow_ref",
    "sub",
    "event_name",
  ])("rejects a mismatched %s claim", (claim) => {
    const claims = validClaims();
    claims[claim] = "unexpected";
    expect(validateParserAttestationOidcClaims(claims, workflowIdentity, NOW)).toContain(
      "OIDC_CLAIMS_MISMATCH",
    );
  });

  it("rejects expired and future-issued identities", () => {
    const expired = validClaims();
    expired["exp"] = NOW - 1;
    expect(validateParserAttestationOidcClaims(expired, workflowIdentity, NOW)).not.toEqual([]);
    const future = validClaims();
    future["iat"] = NOW + 61;
    expect(validateParserAttestationOidcClaims(future, workflowIdentity, NOW)).not.toEqual([]);
  });

  it("rejects the legacy mutable repository subject", () => {
    const claims = validClaims();
    claims["sub"] = "repo:GameProAcademy/cs2-pro-hub:ref:refs/heads/infra/cs2-parser-worker-v8";
    expect(validateParserAttestationOidcClaims(claims, workflowIdentity, NOW)).toContain(
      "OIDC_CLAIMS_MISMATCH",
    );
  });

  it.each(["sha", "run_id", "run_attempt"])("rejects a mismatched %s binding", (claim) => {
    const claims = validClaims();
    claims[claim] = "unexpected";
    expect(validateParserAttestationOidcClaims(claims, workflowIdentity, NOW)).toContain(
      "OIDC_CLAIMS_MISMATCH",
    );
  });
});

describe("parser attestation freshness contract", () => {
  it("rejects a payload without a timestamp and nonce before persistence", () => {
    const blockers = validateParserAttestationPayload({ schema_version: PARSER_ATTESTATION_SCHEMA_VERSION });
    expect(blockers).toContain("ATTESTATION_FRESHNESS_INVALID");
  });

  it("rejects the previous schema version", () => {
    const blockers = validateParserAttestationPayload({
      schema_version: 2,
      attested_at: new Date(NOW * 1000).toISOString(),
      nonce: "a".repeat(64),
    });
    expect(blockers).toContain("PINNED_IDENTITY_MISMATCH");
  });
});
