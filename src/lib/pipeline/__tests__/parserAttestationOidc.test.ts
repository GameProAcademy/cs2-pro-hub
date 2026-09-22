import { describe, expect, it } from "vitest";

import {
  PARSER_ATTESTATION_EXPECTED,
  PARSER_ATTESTATION_OIDC,
  validateParserAttestationOidcClaims,
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
    repository_owner: PARSER_ATTESTATION_OIDC.repositoryOwner,
    ref: PARSER_ATTESTATION_OIDC.branchRef,
    workflow_ref: PARSER_ATTESTATION_EXPECTED.workflowRef,
    job_workflow_ref: PARSER_ATTESTATION_EXPECTED.workflowRef,
    sub: PARSER_ATTESTATION_OIDC.subject,
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
    "repository_owner",
    "ref",
    "workflow_ref",
    "job_workflow_ref",
    "sub",
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
});
