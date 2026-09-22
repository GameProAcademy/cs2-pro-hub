export const PARSER_ATTESTATION_EXPECTED = {
  repository: "GameProAcademy/cs2-pro-hub",
  branch: "infra/cs2-parser-worker-v8",
  commit: "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76",
  deploymentId: "6330c8c4-a410-45db-a364-4eb47702c2fc",
  projectId: "aa2176ec-0e35-45f0-8cfa-9f8c0707dca4",
  serviceId: "706fa246-a263-484f-a986-c74516be862b",
  environmentId: "2385d707-795d-4e32-a00b-0afaba0a9b7e",
  workflowRef:
    "GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/infra/cs2-parser-worker-v8",
  parser: "demoparser2",
  parserVersion: "0.42.0",
  contractVersion: 1,
} as const;

export const PARSER_ATTESTATION_OIDC = {
  issuer: "https://token.actions.githubusercontent.com",
  audience: "gamepro-parser-attestation",
  repositoryOwner: "GameProAcademy",
  repositoryOwnerId: "323426481",
  repositoryId: "1358428146",
  branchRef: "refs/heads/infra/cs2-parser-worker-v8",
  subject:
    "repo:GameProAcademy@323426481/cs2-pro-hub@1358428146:ref:refs/heads/infra/cs2-parser-worker-v8",
  eventName: "workflow_dispatch",
} as const;

const CRITICAL_HASHES: Record<string, string> = {
  "services/cs2-demo-parser/parser.py": "9d21670e47ddf330881e95a9d78c19074ccc0aea",
  "services/cs2-demo-parser/adapter.py": "34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71",
  "services/cs2-demo-parser/worker.py": "dfc2e67fcb3644be91108079f9096947c16119b3",
  "services/cs2-demo-parser/raw_evidence.py": "750195c1218abd53cfc77b6e8d2fb4a88e31579e",
  "services/cs2-demo-parser/settings.py": "35eecfb06223812137a4a2f17114aae57cb7fe54",
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
    claims["iss"] !== oidc.issuer ||
    claims["aud"] !== oidc.audience ||
    claims["repository"] !== expected.repository ||
    claims["repository_id"] !== oidc.repositoryId ||
    claims["repository_owner"] !== oidc.repositoryOwner ||
    claims["repository_owner_id"] !== oidc.repositoryOwnerId ||
    claims["ref"] !== oidc.branchRef ||
    claims["workflow_ref"] !== expected.workflowRef ||
    claims["job_workflow_ref"] !== expected.workflowRef ||
    claims["sub"] !== oidc.subject ||
    claims["event_name"] !== oidc.eventName ||
    claims["sha"] !== workflowIdentity["workflow_sha"] ||
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

  if (
    payload["schema_version"] !== 2 ||
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
    payload["parser_name"] !== expected.parser ||
    payload["parser_version"] !== expected.parserVersion ||
    payload["contract_version"] !== expected.contractVersion ||
    payload["semantic_revision"] !== `git:${expected.commit}` ||
    payload["build_revision"] !== `git:${expected.commit}`
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
    deployment["source_commit"] !== expected.commit ||
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
    customVersion["build_revision"] !== `git:${expected.commit}`
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
  return blockers;
}
