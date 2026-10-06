import { describe, expect, it } from "vitest";
import {
  PARSER_ATTESTATION_EXPECTED,
  PARSER_ATTESTATION_OIDC,
  validateParserAttestationOidcClaims,
  validateParserAttestationPayload,
} from "@/lib/parserAttestation";

const triggerCommit = "62023bbd603af1fb697f01055b392fc2ed80260e";
const workflowFileCommit = "700e792cec0b97d9dd3b0e595ebe444aec599090";
const tree = "1111111111111111111111111111111111111111";
const queryDigest = "2222222222222222222222222222222222222222222222222222222222222222";

function workflowIdentity() {
  return {
    repository: PARSER_ATTESTATION_EXPECTED.repository,
    ref_name: PARSER_ATTESTATION_EXPECTED.attestorBranch,
    workflow_ref: PARSER_ATTESTATION_EXPECTED.workflowRef,
    run_id: "123456789",
    run_attempt: "1",
    workflow_sha: workflowFileCommit,
    trigger_commit_sha: triggerCommit,
    workflow_file_commit_sha: workflowFileCommit,
    event_name: PARSER_ATTESTATION_OIDC.eventName,
    workflow_path: PARSER_ATTESTATION_EXPECTED.workflowPath,
    workflow_source_sha: PARSER_ATTESTATION_EXPECTED.workflowSourceSha,
  };
}

describe("parser runtime attestation SHA binding", () => {
  it("accepts distinct trigger and workflow-file commits when both are bound correctly", () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: PARSER_ATTESTATION_OIDC.issuer,
      aud: PARSER_ATTESTATION_OIDC.audience,
      repository: PARSER_ATTESTATION_EXPECTED.repository,
      repository_id: PARSER_ATTESTATION_OIDC.repositoryId,
      repository_owner: PARSER_ATTESTATION_OIDC.repositoryOwner,
      repository_owner_id: PARSER_ATTESTATION_OIDC.repositoryOwnerId,
      ref: PARSER_ATTESTATION_OIDC.branchRef,
      workflow_ref: PARSER_ATTESTATION_EXPECTED.workflowRef,
      sub: PARSER_ATTESTATION_OIDC.subject,
      event_name: PARSER_ATTESTATION_OIDC.eventName,
      sha: triggerCommit,
      workflow_sha: workflowFileCommit,
      run_id: "123456789",
      run_attempt: "1",
      exp: now + 120,
      iat: now,
    };

    expect(validateParserAttestationOidcClaims(claims, workflowIdentity(), now)).toEqual([]);
  });

  it("rejects a workflow-file SHA that is not the approved workflow-file commit", () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: PARSER_ATTESTATION_OIDC.issuer,
      aud: PARSER_ATTESTATION_OIDC.audience,
      repository: PARSER_ATTESTATION_EXPECTED.repository,
      repository_id: PARSER_ATTESTATION_OIDC.repositoryId,
      repository_owner: PARSER_ATTESTATION_OIDC.repositoryOwner,
      repository_owner_id: PARSER_ATTESTATION_OIDC.repositoryOwnerId,
      ref: PARSER_ATTESTATION_OIDC.branchRef,
      workflow_ref: PARSER_ATTESTATION_EXPECTED.workflowRef,
      sub: PARSER_ATTESTATION_OIDC.subject,
      event_name: PARSER_ATTESTATION_OIDC.eventName,
      sha: triggerCommit,
      workflow_sha: workflowFileCommit,
      run_id: "123456789",
      run_attempt: "1",
      exp: now + 120,
      iat: now,
    };
    const identity = {
      ...workflowIdentity(),
      workflow_file_commit_sha: "3333333333333333333333333333333333333333",
    };

    expect(validateParserAttestationOidcClaims(claims, identity, now)).toContain(
      "OIDC_CLAIMS_MISMATCH",
    );
  });

  it("accepts payloads with distinct trigger and workflow-file commits", () => {
    const expected = PARSER_ATTESTATION_EXPECTED;
    const hashes = {
      "services/cs2-demo-parser/parser.py": {
        observed: "9d21670e47ddf330881e95a9d78c19074ccc0aea",
        match: true,
      },
      "services/cs2-demo-parser/adapter.py": {
        observed: "34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71",
        match: true,
      },
      "services/cs2-demo-parser/worker.py": {
        observed: "dfc2e67fcb3644be91108079f9096947c16119b3",
        match: true,
      },
      "services/cs2-demo-parser/raw_evidence.py": {
        observed: "750195c1218abd53cfc77b6e8d2fb4a88e31579e",
        match: true,
      },
      "services/cs2-demo-parser/settings.py": {
        observed: "35eecfb06223812137a4a2f17114aae57cb7fe54",
        match: true,
      },
    };
    const runtimeVersion = {
      name: expected.parser,
      version: expected.parserVersion,
      contract_version: expected.contractVersion,
      semantic_revision: `git:${expected.commit}`,
      build_revision: `git:${expected.commit}`,
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
      workflow_identity: workflowIdentity(),
      attestor_source_identity: {
        repository: PARSER_ATTESTATION_EXPECTED.repository,
        branch: PARSER_ATTESTATION_EXPECTED.attestorBranch,
        workflow_ref: PARSER_ATTESTATION_EXPECTED.workflowRef,
        workflow_sha: workflowFileCommit,
        trigger_commit_sha: triggerCommit,
        workflow_file_commit_sha: workflowFileCommit,
        event_name: PARSER_ATTESTATION_OIDC.eventName,
        workflow_path: PARSER_ATTESTATION_EXPECTED.workflowPath,
        workflow_source_sha: PARSER_ATTESTATION_EXPECTED.workflowSourceSha,
      },
      release_gate_evidence: {
        mapping_inventory: { status: "BLOCKED", evidence_ref: "payload.mapping_release" },
      },
      attested_at: new Date().toISOString(),
      nonce: "a".repeat(64),
      parser_name: expected.parser,
      parser_version: expected.parserVersion,
      contract_version: expected.contractVersion,
      semantic_revision: `git:${expected.commit}`,
      build_revision: `git:${expected.commit}`,
      runtime_identity: {
        repository: expected.repository,
        branch: expected.branch,
        commit: expected.commit,
        branch_contains_commit: true,
        tree,
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
        query_digest: queryDigest,
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

    expect(validateParserAttestationPayload(payload)).toEqual([]);
  });
});
