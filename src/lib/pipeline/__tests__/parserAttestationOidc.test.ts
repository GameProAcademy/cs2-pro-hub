import { describe, expect, it } from "vitest";

import {
  PARSER_ATTESTATION_EXPECTED,
  PARSER_ATTESTATION_OIDC,
  PARSER_ATTESTATION_SCHEMA_VERSION,
  extractBoundReleaseGateEvidence,
  validateParserAttestationOidcClaims,
  validateParserAttestationPayload,
} from "@/lib/parserAttestation";

const NOW = 1_790_064_000;
const workflowIdentity = {
  workflow_sha: "b".repeat(40),
  trigger_commit_sha: "a".repeat(40),
  workflow_file_commit_sha: "b".repeat(40),
  workflow_path: PARSER_ATTESTATION_EXPECTED.workflowPath,
  workflow_source_sha: PARSER_ATTESTATION_EXPECTED.workflowSourceSha,
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
    sha: workflowIdentity.trigger_commit_sha,
    workflow_sha: workflowIdentity.workflow_file_commit_sha,
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
    "iss",
    "aud",
    "repository",
    "repository_id",
    "repository_owner",
    "repository_owner_id",
    "ref",
    "workflow_ref",
    "sub",
    "event_name",
  ])("rejects a mismatched %s claim", (claim) => {
    const claims = validClaims();
    claims[claim] = "unexpected";
    expect(validateParserAttestationOidcClaims(claims, workflowIdentity, NOW)).toContain(
      "OIDC_CLAIMS_MISMATCH",
    );
  });

  it("accepts a normal workflow token without job_workflow_ref", () => {
    const claims = validClaims();
    delete claims["job_workflow_ref"];
    expect(validateParserAttestationOidcClaims(claims, workflowIdentity, NOW)).toEqual([]);
  });

  it("rejects job_workflow_ref when it is present but mismatched", () => {
    const claims = validClaims();
    claims["job_workflow_ref"] = "unexpected";
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

  it.each(["sha", "workflow_sha", "run_id", "run_attempt"])(
    "rejects a mismatched %s binding",
    (claim) => {
      const claims = validClaims();
      claims[claim] = "unexpected";
      expect(validateParserAttestationOidcClaims(claims, workflowIdentity, NOW)).toContain(
        "OIDC_CLAIMS_MISMATCH",
      );
    },
  );

  it.each(["run_id", "run_attempt"])("rejects an absent %s binding", (claim) => {
    const claims = validClaims();
    delete claims[claim];
    expect(validateParserAttestationOidcClaims(claims, workflowIdentity, NOW)).toContain(
      "OIDC_CLAIMS_MISMATCH",
    );
  });

  it("rejects a malformed workflow commit", () => {
    const claims = validClaims();
    claims["sha"] = "not-a-sha";
    const identity = { ...workflowIdentity, workflow_sha: "not-a-sha" };
    expect(validateParserAttestationOidcClaims(claims, identity, NOW)).toContain(
      "OIDC_CLAIMS_MISMATCH",
    );
  });

  it("rejects a workflow SHA that does not represent the trigger commit", () => {
    const identity = { ...workflowIdentity, trigger_commit_sha: "c".repeat(40) };
    expect(validateParserAttestationOidcClaims(validClaims(), identity, NOW)).toContain(
      "OIDC_CLAIMS_MISMATCH",
    );
  });

  it("rejects workflow source outside the reviewed registry", () => {
    const identity = { ...workflowIdentity, workflow_source_sha: "b".repeat(40) };
    expect(validateParserAttestationOidcClaims(validClaims(), identity, NOW)).toContain(
      "ATTESTATION_WORKFLOW_VERSION_NOT_APPROVED",
    );
  });
});

describe("parser attestation freshness contract", () => {
  it("pins the independently verified Railway deployment identity", () => {
    expect(PARSER_ATTESTATION_EXPECTED.deploymentId).toBe(PARSER_ATTESTATION_EXPECTED.deploymentId);
  });

  it("accepts the pinned deployment evidence and rejects a mismatched deployment", () => {
    const basePayload = {
      schema_version: PARSER_ATTESTATION_SCHEMA_VERSION,
      repository: PARSER_ATTESTATION_EXPECTED.repository,
      railway_branch: PARSER_ATTESTATION_EXPECTED.branch,
      git_commit: PARSER_ATTESTATION_EXPECTED.commit,
      deployment_id: PARSER_ATTESTATION_EXPECTED.deploymentId,
      railway_project_id: PARSER_ATTESTATION_EXPECTED.projectId,
      railway_service_id: PARSER_ATTESTATION_EXPECTED.serviceId,
      railway_environment_id: PARSER_ATTESTATION_EXPECTED.environmentId,
      deployment_evidence: {
        verification_source: "RAILWAY_API",
        independently_verified: true,
        deployment_id: PARSER_ATTESTATION_EXPECTED.deploymentId,
        project_id: PARSER_ATTESTATION_EXPECTED.projectId,
        service_id: PARSER_ATTESTATION_EXPECTED.serviceId,
        environment_id: PARSER_ATTESTATION_EXPECTED.environmentId,
        source_branch: PARSER_ATTESTATION_EXPECTED.branch,
        source_commit: PARSER_ATTESTATION_EXPECTED.deploymentSourceCommit,
        deployment_status: "SUCCESS",
        query_digest: "a".repeat(64),
      },
    };
    expect(validateParserAttestationPayload(basePayload)).not.toContain(
      "RAILWAY_API_PROOF_INVALID",
    );

    const mismatched: Record<string, unknown> = structuredClone(basePayload);
    const mismatchedEvidence = mismatched["deployment_evidence"] as Record<string, unknown>;
    mismatchedEvidence["deployment_id"] = "00000000-0000-0000-0000-000000000000";
    expect(validateParserAttestationPayload(mismatched)).toContain("RAILWAY_API_PROOF_INVALID");
  });

  it("derives release gate evidence only from the signed payload", () => {
    const evidence = { mapping_inventory: { status: "BLOCKED" } };
    expect(extractBoundReleaseGateEvidence({ release_gate_evidence: evidence })).toEqual(evidence);
    expect(extractBoundReleaseGateEvidence({})).toBeNull();
  });
  it("rejects a payload without a timestamp and nonce before persistence", () => {
    const blockers = validateParserAttestationPayload({
      schema_version: PARSER_ATTESTATION_SCHEMA_VERSION,
    });
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

  it.each(["trigger_commit_sha", "workflow_file_commit_sha"])(
    "rejects a missing or malformed %s",
    (field) => {
      const blockers = validateParserAttestationPayload({
        workflow_identity: { ...workflowIdentity, [field]: "not-a-sha" },
        attestor_source_identity: {
          repository: PARSER_ATTESTATION_EXPECTED.repository,
          branch: PARSER_ATTESTATION_EXPECTED.attestorBranch,
          workflow_sha: workflowIdentity.workflow_sha,
          trigger_commit_sha: workflowIdentity.trigger_commit_sha,
          workflow_file_commit_sha: workflowIdentity.workflow_file_commit_sha,
          workflow_path: PARSER_ATTESTATION_EXPECTED.workflowPath,
          workflow_source_sha: PARSER_ATTESTATION_EXPECTED.workflowSourceSha,
        },
      });
      expect(blockers).toContain("ATTESTATION_WORKFLOW_VERSION_NOT_APPROVED");
    },
  );
});
