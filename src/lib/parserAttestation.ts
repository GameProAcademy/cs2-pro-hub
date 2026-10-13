import {
  APPROVED_ATTESTATION_WORKFLOW_PATH,
  APPROVED_ATTESTATION_WORKFLOW_SHA,
} from "@/lib/parserAttestationWorkflowRegistry";

export const PARSER_ATTESTATION_EXPECTED = {
  repository: "GameProAcademy/cs2-pro-hub",
  attestorBranch: "main",
  branch: "main",
  // Semantic revision: first main commit whose worker tree is the served one.
  commit: "10815fb44e165963adfaf07f71c474ca628f4b7f",
  // Build revision: the commit the served image was built from.
  buildCommit: "c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d",
  deploymentId: "09b50029-2508-4267-bb1d-28c5e99b95db",
  deploymentSourceCommit: "c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d",
  projectId: "aa2176ec-0e35-45f0-8cfa-9f8c0707dca4",
  serviceId: "706fa246-a263-484f-a986-c74516be862b",
  environmentId: "2385d707-795d-4e32-a00b-0afaba0a9b7e",
  workflowRef:
    "GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/main",
  workflowPath: APPROVED_ATTESTATION_WORKFLOW_PATH,
  workflowSourceSha: APPROVED_ATTESTATION_WORKFLOW_SHA,
  parser: "demoparser2",
  parserVersion: "0.42.0",
  contractVersion: 1,
  mappingReleaseId: "cf0549c2-dfbd-c4df-25b4-2ce8204edf87",
  inventoryVersion: "canonical-demo-v2",
  inventoryDigest: "cf0549c2dfbdc4df25b42ce8204edf8705071c586e99696e9ef596c1e742d7b1",
  matrixDigest: "a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702",
} as const;

export const PARSER_ATTESTATION_OIDC = {
  issuer: "https://token.actions.githubusercontent.com",
  audience: "gamepro-parser-attestation",
  repositoryOwner: "GameProAcademy",
  repositoryOwnerId: "323426481",
  repositoryId: "1358428146",
  branchRef: "refs/heads/main",
  subject: "repo:GameProAcademy@323426481/cs2-pro-hub@1358428146:ref:refs/heads/main",
  eventName: "workflow_dispatch",
} as const;

export const PARSER_ATTESTATION_SCHEMA_VERSION = 3 as const;
export const PARSER_ATTESTATION_MAX_AGE_SECONDS = 300;

const CRITICAL_HASHES: Record<string, string> = {
  "services/cs2-demo-parser/parser.py": "981f6261c7e38334dfab5c93088e9d5ad1f56f6e",
  "services/cs2-demo-parser/adapter.py": "34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71",
  "services/cs2-demo-parser/worker.py": "ecaac3968d68e1ed8fc03f8dfea42c223869f473",
  "services/cs2-demo-parser/raw_evidence.py": "46df350b5298531ffc01409172f690ba161328de",
  "services/cs2-demo-parser/settings.py": "dc76db86c9b0b8c0916d58501ae0c21af95dfe38",
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function validateParserAttestationOidcClaims(
  claims: Record<string, unknown>,
  workflowIdentity: Record<string, unknown>,
  nowSeconds: number,
): string[] {
  const expected = PARSER_ATTESTATION_EXPECTED;
  const oidc = PARSER_ATTESTATION_OIDC;
  const blockers: string[] = [];
  if (
    workflowIdentity["workflow_path"] !== expected.workflowPath ||
    workflowIdentity["workflow_source_sha"] !== expected.workflowSourceSha
  ) {
    blockers.push("ATTESTATION_WORKFLOW_VERSION_NOT_APPROVED");
  }
  if (
    claims["iss"] !== oidc.issuer ||
    claims["aud"] !== oidc.audience ||
    claims["repository"] !== expected.repository ||
    claims["repository_id"] !== oidc.repositoryId ||
    claims["repository_owner"] !== oidc.repositoryOwner ||
    claims["repository_owner_id"] !== oidc.repositoryOwnerId ||
    claims["ref"] !== oidc.branchRef ||
    claims["workflow_ref"] !== expected.workflowRef ||
    (claims["job_workflow_ref"] !== undefined &&
      claims["job_workflow_ref"] !== expected.workflowRef) ||
    claims["sub"] !== oidc.subject ||
    claims["event_name"] !== oidc.eventName ||
    claims["sha"] !== workflowIdentity["trigger_commit_sha"] ||
    claims["workflow_sha"] !== workflowIdentity["workflow_file_commit_sha"] ||
    workflowIdentity["workflow_sha"] !== workflowIdentity["workflow_file_commit_sha"] ||
    typeof workflowIdentity["workflow_file_commit_sha"] !== "string" ||
    !/^[0-9a-f]{40}$/.test(workflowIdentity["workflow_file_commit_sha"]) ||
    typeof claims["sha"] !== "string" ||
    !/^[0-9a-f]{40}$/.test(claims["sha"]) ||
    typeof claims["workflow_sha"] !== "string" ||
    !/^[0-9a-f]{40}$/.test(claims["workflow_sha"]) ||
    String(claims["run_id"]) !== workflowIdentity["run_id"] ||
    String(claims["run_attempt"]) !== workflowIdentity["run_attempt"] ||
    typeof claims["exp"] !== "number" ||
    typeof claims["iat"] !== "number" ||
    claims["exp"] < nowSeconds ||
    claims["iat"] > nowSeconds + 60
  ) {
    blockers.push("OIDC_CLAIMS_MISMATCH");
  }
  return blockers;
}

export function validateParserAttestationPayload(payload: Record<string, unknown>): string[] {
  const expected = PARSER_ATTESTATION_EXPECTED;
  const blockers: string[] = [];
  const runtime = record(payload["runtime_identity"]);
  const deployment = record(payload["deployment_evidence"]);
  const customVersion = record(payload["custom_domain_version"]);
  const railwayVersion = record(payload["railway_domain_version"]);
  const hashes = record(payload["critical_file_hashes"]);
  const mappingRelease = record(payload["mapping_release"]);
  const workflowIdentity = record(payload["workflow_identity"]);
  const attestorSource = record(payload["attestor_source_identity"]);
  const releaseGateEvidence = record(payload["release_gate_evidence"]);

  if (
    payload["schema_version"] !== PARSER_ATTESTATION_SCHEMA_VERSION ||
    payload["repository"] !== expected.repository ||
    payload["railway_branch"] !== expected.branch ||
    payload["git_commit"] !== expected.commit ||
    payload["deployment_id"] !== expected.deploymentId ||
    payload["railway_project_id"] !== expected.projectId ||
    payload["railway_service_id"] !== expected.serviceId ||
    payload["railway_environment_id"] !== expected.environmentId
  ) {
    blockers.push("PINNED_IDENTITY_MISMATCH");
  }
  if (
    !workflowIdentity ||
    workflowIdentity["repository"] !== expected.repository ||
    workflowIdentity["ref_name"] !== expected.attestorBranch ||
    workflowIdentity["workflow_ref"] !== expected.workflowRef ||
    workflowIdentity["event_name"] !== PARSER_ATTESTATION_OIDC.eventName ||
    typeof workflowIdentity["workflow_sha"] !== "string" ||
    !/^[0-9a-f]{40}$/.test(workflowIdentity["workflow_sha"]) ||
    typeof workflowIdentity["trigger_commit_sha"] !== "string" ||
    !/^[0-9a-f]{40}$/.test(workflowIdentity["trigger_commit_sha"]) ||
    typeof workflowIdentity["workflow_file_commit_sha"] !== "string" ||
    !/^[0-9a-f]{40}$/.test(workflowIdentity["workflow_file_commit_sha"]) ||
    workflowIdentity["workflow_sha"] !== workflowIdentity["workflow_file_commit_sha"] ||
    workflowIdentity["workflow_sha"] === expected.commit ||
    workflowIdentity["workflow_path"] !== expected.workflowPath ||
    workflowIdentity["workflow_source_sha"] !== expected.workflowSourceSha
  ) {
    blockers.push("ATTESTATION_WORKFLOW_VERSION_NOT_APPROVED");
  }
  if (
    !attestorSource ||
    attestorSource["repository"] !== expected.repository ||
    attestorSource["branch"] !== expected.attestorBranch ||
    attestorSource["workflow_sha"] !== workflowIdentity?.["workflow_sha"] ||
    attestorSource["trigger_commit_sha"] !== workflowIdentity?.["trigger_commit_sha"] ||
    attestorSource["workflow_file_commit_sha"] !== workflowIdentity?.["workflow_file_commit_sha"] ||
    attestorSource["workflow_path"] !== expected.workflowPath ||
    attestorSource["workflow_source_sha"] !== expected.workflowSourceSha
  ) {
    blockers.push("ATTESTOR_SOURCE_IDENTITY_INVALID");
  }
  if (!releaseGateEvidence || record(releaseGateEvidence["mapping_inventory"]) === null) {
    blockers.push("RELEASE_GATE_EVIDENCE_INVALID");
  }
  const attestedAt =
    typeof payload["attested_at"] === "string" ? Date.parse(payload["attested_at"]) : NaN;
  if (
    !Number.isFinite(attestedAt) ||
    typeof payload["nonce"] !== "string" ||
    !/^[0-9a-f]{32,128}$/.test(payload["nonce"])
  ) {
    blockers.push("ATTESTATION_FRESHNESS_INVALID");
  }
  if (
    payload["parser_name"] !== expected.parser ||
    payload["parser_version"] !== expected.parserVersion ||
    payload["contract_version"] !== expected.contractVersion ||
    payload["semantic_revision"] !== `git:${expected.commit}` ||
    payload["build_revision"] !== `git:${expected.buildCommit}`
  ) {
    blockers.push("PARSER_IDENTITY_MISMATCH");
  }
  if (
    !runtime ||
    runtime["repository"] !== expected.repository ||
    runtime["branch"] !== expected.branch ||
    runtime["commit"] !== expected.commit ||
    runtime["branch_contains_commit"] !== true ||
    typeof runtime["tree"] !== "string" ||
    !/^[0-9a-f]{40}$/.test(runtime["tree"])
  ) {
    blockers.push("RUNTIME_SOURCE_PROOF_INVALID");
  }
  if (
    !deployment ||
    deployment["verification_source"] !== "RAILWAY_API" ||
    deployment["independently_verified"] !== true ||
    deployment["deployment_id"] !== expected.deploymentId ||
    deployment["project_id"] !== expected.projectId ||
    deployment["service_id"] !== expected.serviceId ||
    deployment["environment_id"] !== expected.environmentId ||
    deployment["source_branch"] !== expected.branch ||
    deployment["source_commit"] !== expected.deploymentSourceCommit ||
    deployment["deployment_status"] !== "SUCCESS" ||
    typeof deployment["query_digest"] !== "string" ||
    !/^[0-9a-f]{64}$/.test(deployment["query_digest"])
  ) {
    blockers.push("RAILWAY_API_PROOF_INVALID");
  }
  if (
    !customVersion ||
    !railwayVersion ||
    JSON.stringify(customVersion) !== JSON.stringify(railwayVersion) ||
    customVersion["name"] !== expected.parser ||
    customVersion["version"] !== expected.parserVersion ||
    customVersion["contract_version"] !== expected.contractVersion ||
    customVersion["semantic_revision"] !== `git:${expected.commit}` ||
    customVersion["build_revision"] !== `git:${expected.buildCommit}`
  ) {
    blockers.push("LIVE_RUNTIME_PROOF_INVALID");
  }
  if (!hashes) {
    blockers.push("CRITICAL_HASH_PROOF_INVALID");
  } else {
    for (const [path, expectedHash] of Object.entries(CRITICAL_HASHES)) {
      const evidence = record(hashes[path]);
      if (evidence?.["observed"] !== expectedHash || evidence["match"] !== true) {
        blockers.push(`CRITICAL_HASH_MISMATCH:${path}`);
      }
    }
  }
  if (
    !mappingRelease ||
    mappingRelease["release_id"] !== expected.mappingReleaseId ||
    mappingRelease["inventory_version"] !== expected.inventoryVersion ||
    mappingRelease["inventory_digest"] !== expected.inventoryDigest ||
    mappingRelease["matrix_digest"] !== expected.matrixDigest ||
    mappingRelease["row_count"] !== 105 ||
    mappingRelease["generic_count"] !== 0 ||
    mappingRelease["authorized_count"] !== 0 ||
    mappingRelease["verified_count"] !== 0 ||
    mappingRelease["status"] !== "BLOCKED"
  ) {
    blockers.push("MAPPING_RELEASE_PROOF_INVALID");
  }
  return blockers;
}

export function extractBoundReleaseGateEvidence(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  return record(payload["release_gate_evidence"]);
}
