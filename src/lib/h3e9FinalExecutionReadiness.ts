import { PARSER_ATTESTATION_EXPECTED, PARSER_ATTESTATION_OIDC } from "@/lib/parserAttestation";
import {
  APPROVED_ATTESTATION_WORKFLOW_PATH,
  APPROVED_ATTESTATION_WORKFLOW_SHA,
} from "@/lib/parserAttestationWorkflowRegistry";

export const H3E9_GATE_VERSION = "H.3-E.9" as const;
export const H3E9_EXPECTED_ENDPOINT =
  "https://gamepro.network/api/public/parser-attestation" as const;
export const H3E9_EXPECTED_MIGRATION = {
  version: "20260925011902",
  name: "051ef9cf-6adf-4689-9fe2-c2fc86dedc40",
} as const;

export const H3E9_BLOCKER_CODES = [
  "H3E9_IDENTITY_MISMATCH",
  "H3E9_DATABASE_STATE_NOT_EMPTY",
  "H3E9_DATABASE_SECURITY_INVARIANT_FAILED",
  "H3E9_MIGRATION_HISTORY_MISMATCH",
  "H3E9_WORKFLOW_NOT_APPROVED",
  "H3E9_WORKFLOW_SOURCE_MISMATCH",
  "H3E9_OIDC_CONFIGURATION_INVALID",
  "H3E9_ENDPOINT_NOT_CONFIGURED",
  "H3E9_ENDPOINT_MISMATCH",
  "H3E9_ANONYMOUS_BOUNDARY_FAILED",
  "H3E9_TRANSPORT_SECRET_MISSING",
  "H3E9_HMAC_SECRET_MISSING",
  "H3E9_RAILWAY_TOKEN_MISSING",
  "H3E9_RAILWAY_RUNTIME_MISMATCH",
  "H3E9_RAILWAY_DEPLOYMENT_NOT_SUCCESS",
  "H3E9_RETENTION_NOT_AUTHORIZED",
  "H3E9_RETENTION_AUTHORIZATION_INVALID",
  "H3E9_OPERATOR_AUTHORIZATION_MISSING",
  "H3E9_OPERATOR_AUTHORIZATION_INVALID",
  "H3E9_UNEXPECTED_PROVENANCE",
  "H3E9_UNEXPECTED_NONCE",
  "H3E9_CANONICAL_NOT_LOCKED",
  "H3E9_DEM_EXECUTION_DETECTED",
  "H3E9_ATTESTATION_ALREADY_EXECUTED",
  "H3E9_UNKNOWN_STATE",
  "H3E91_DATABASE_EVIDENCE_UNKNOWN",
  "H3E91_MIGRATION_EVIDENCE_UNKNOWN",
  "H3E91_SECURITY_EVIDENCE_UNKNOWN",
  "H3E91_RUNTIME_EVIDENCE_UNKNOWN",
  "H3E91_RAILWAY_EVIDENCE_UNKNOWN",
] as const;

export type H3E9BlockerCode = (typeof H3E9_BLOCKER_CODES)[number];
export type H3E9AuthorizationStatus = "AUTHORIZED" | "NOT_AUTHORIZED" | "INVALID";

export interface H3E9AuthorizationEvidence {
  status: H3E9AuthorizationStatus;
  reference?: string;
  issuedAt?: string;
  expiresAt?: string;
  scope?: string;
}

export interface H3E9ReadinessInput {
  now: string;
  identities: {
    repository: string;
    attestorBranch: string;
    railwayBranch: string;
    parserCommit: string;
    deploymentId: string;
    projectId: string;
    serviceId: string;
    environmentId: string;
    workflowPath: string;
    workflowSourceSha: string;
  };
  storage: { provenanceCount: number | null; nonceCount: number | null; verifiedProvenanceCount?: number | null };
  database: {
    migrationVersion: string;
    migrationName: string;
    rlsEnabled: boolean | null;
    clientPrivilegesZero: boolean | null;
    recorderServiceRoleOnly: boolean | null;
    hmacBridgeServiceRoleOnly: boolean | null;
    securityDefiner: boolean | null;
    emptySearchPath: boolean | null;
    migrationExactMatchCount?: number | null;
  };
  transport: {
    endpointConfigured: boolean;
    endpoint: string | null;
    anonymousNegativeBoundary: boolean;
    anonymousNegativeBoundaryStatus: number | null;
  };
  secrets: {
    endpointPresent: boolean;
    transportSecretPresent: boolean;
    hmacSecretPresent: boolean;
    railwayTokenPresent: boolean;
  };
  workflow: {
    approvedPath: string;
    approvedSourceSha: string;
    registryMatches: boolean;
    sourceMatches: boolean;
    oidcConfigured: boolean;
  };
  railway: {
    deploymentIdMatches: boolean;
    deploymentStatus: string;
    branchMatches: boolean;
    parserCommitMatches: boolean;
    parserNameMatches: boolean;
    parserVersionMatches: boolean;
    contractVersionMatches: boolean;
    projectMatches: boolean;
    serviceMatches: boolean;
    environmentMatches: boolean;
    bothRuntimeDomainsMatch: boolean;
  };
  retention: H3E9AuthorizationEvidence;
  operatorAuthorization: H3E9AuthorizationEvidence;
  execution: {
    validAttestationExecuted: boolean | null;
    demExecuted: boolean | null;
    cacheDemExecuted: boolean | null;
    attempt9Created: boolean | null;
    canonicalAdmission: "LOCKED" | "UNLOCKED" | "UNKNOWN";
    realDemoExecutionCount?: number | null;
    cacheDemoExecutionCount?: number | null;
    attempt10PlusCount?: number | null;
  };
}

export interface H3E9ReadinessResult extends H3E9ReadinessInput {
  status: "READY" | "BLOCKED";
  blockers: H3E9BlockerCode[];
  gateVersion: typeof H3E9_GATE_VERSION;
  technicalReadiness: "READY" | "BLOCKED";
  attestationAuthorization: H3E9AuthorizationStatus;
  executionAuthorization: H3E9AuthorizationStatus;
  attestationExecuted: boolean | null;
  provenanceVerified: boolean | null;
  operation: "DIAGNOSTIC_ONLY";
  sideEffects: false;
}

function validAuthorization(
  evidence: H3E9AuthorizationEvidence,
  expectedScope: string,
  nowMs: number,
): "VALID" | "MISSING" | "INVALID" {
  if (evidence.status === "NOT_AUTHORIZED") return "MISSING";
  if (evidence.status !== "AUTHORIZED") return "INVALID";
  const issuedAt = Date.parse(evidence.issuedAt ?? "");
  const expiresAt = Date.parse(evidence.expiresAt ?? "");
  if (
    !evidence.reference?.trim() ||
    evidence.scope !== expectedScope ||
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    issuedAt > nowMs ||
    expiresAt <= nowMs ||
    expiresAt <= issuedAt
  ) {
    return "INVALID";
  }
  return "VALID";
}

export function evaluateH3E9FinalExecutionReadiness(
  input: H3E9ReadinessInput,
): H3E9ReadinessResult {
  const blockers: H3E9BlockerCode[] = [];
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) blockers.push("H3E9_UNKNOWN_STATE");
  if (input.storage.provenanceCount === null || input.storage.nonceCount === null || input.storage.verifiedProvenanceCount === null || input.execution.validAttestationExecuted === null || input.execution.attempt9Created === null || input.execution.realDemoExecutionCount === null || input.execution.cacheDemoExecutionCount === null || input.execution.attempt10PlusCount === null)
    blockers.push("H3E91_DATABASE_EVIDENCE_UNKNOWN");
  if (input.database.migrationExactMatchCount === null) blockers.push("H3E91_MIGRATION_EVIDENCE_UNKNOWN");
  if (Object.entries(input.database).some(([key,value]) => key !== "migrationExactMatchCount" && value === null)) blockers.push("H3E91_SECURITY_EVIDENCE_UNKNOWN");
  if (input.railway.deploymentStatus === "UNKNOWN") blockers.push("H3E91_RAILWAY_EVIDENCE_UNKNOWN");
  if (input.execution.canonicalAdmission === "UNKNOWN") blockers.push("H3E91_DATABASE_EVIDENCE_UNKNOWN");

  const expected = PARSER_ATTESTATION_EXPECTED;
  if (
    input.identities.repository !== expected.repository ||
    input.identities.attestorBranch !== expected.attestorBranch ||
    input.identities.railwayBranch !== expected.branch ||
    input.identities.parserCommit !== expected.commit ||
    input.identities.deploymentId !== expected.deploymentId ||
    input.identities.projectId !== expected.projectId ||
    input.identities.serviceId !== expected.serviceId ||
    input.identities.environmentId !== expected.environmentId ||
    input.identities.workflowPath !== expected.workflowPath ||
    input.identities.workflowSourceSha !== expected.workflowSourceSha
  )
    blockers.push("H3E9_IDENTITY_MISMATCH");

  if (input.storage.provenanceCount !== null && input.storage.provenanceCount !== 0) blockers.push("H3E9_UNEXPECTED_PROVENANCE");
  if (input.storage.nonceCount !== null && input.storage.nonceCount !== 0) blockers.push("H3E9_UNEXPECTED_NONCE");
  if ((input.storage.provenanceCount !== null && input.storage.provenanceCount !== 0) || (input.storage.nonceCount !== null && input.storage.nonceCount !== 0))
    blockers.push("H3E9_DATABASE_STATE_NOT_EMPTY");

  if (
    !input.database.rlsEnabled ||
    !input.database.clientPrivilegesZero ||
    !input.database.recorderServiceRoleOnly ||
    !input.database.hmacBridgeServiceRoleOnly ||
    !input.database.securityDefiner ||
    !input.database.emptySearchPath
  )
    blockers.push("H3E9_DATABASE_SECURITY_INVARIANT_FAILED");
  if (
    (input.database.migrationExactMatchCount !== undefined && input.database.migrationExactMatchCount !== 1) ||
    input.database.migrationVersion !== H3E9_EXPECTED_MIGRATION.version ||
    input.database.migrationName !== H3E9_EXPECTED_MIGRATION.name
  )
    blockers.push("H3E9_MIGRATION_HISTORY_MISMATCH");

  if (input.workflow.approvedPath !== APPROVED_ATTESTATION_WORKFLOW_PATH)
    blockers.push("H3E9_WORKFLOW_NOT_APPROVED");
  if (
    input.workflow.approvedSourceSha !== APPROVED_ATTESTATION_WORKFLOW_SHA ||
    !input.workflow.registryMatches ||
    !input.workflow.sourceMatches
  )
    blockers.push("H3E9_WORKFLOW_SOURCE_MISMATCH");
  if (!input.workflow.oidcConfigured) blockers.push("H3E9_OIDC_CONFIGURATION_INVALID");

  if (!input.transport.endpointConfigured) blockers.push("H3E9_ENDPOINT_NOT_CONFIGURED");
  if (input.transport.endpoint !== H3E9_EXPECTED_ENDPOINT) blockers.push("H3E9_ENDPOINT_MISMATCH");
  if (
    !input.transport.anonymousNegativeBoundary ||
    input.transport.anonymousNegativeBoundaryStatus !== 401
  )
    blockers.push("H3E9_ANONYMOUS_BOUNDARY_FAILED");
  if (!input.secrets.endpointPresent) blockers.push("H3E9_ENDPOINT_NOT_CONFIGURED");
  if (!input.secrets.transportSecretPresent) blockers.push("H3E9_TRANSPORT_SECRET_MISSING");
  if (!input.secrets.hmacSecretPresent) blockers.push("H3E9_HMAC_SECRET_MISSING");
  if (!input.secrets.railwayTokenPresent) blockers.push("H3E9_RAILWAY_TOKEN_MISSING");

  if (input.railway.deploymentStatus !== "SUCCESS")
    blockers.push("H3E9_RAILWAY_DEPLOYMENT_NOT_SUCCESS");
  if (
    !input.railway.deploymentIdMatches ||
    !input.railway.branchMatches ||
    !input.railway.parserCommitMatches ||
    !input.railway.parserNameMatches ||
    !input.railway.parserVersionMatches ||
    !input.railway.contractVersionMatches ||
    !input.railway.projectMatches ||
    !input.railway.serviceMatches ||
    !input.railway.environmentMatches ||
    !input.railway.bothRuntimeDomainsMatch
  )
    blockers.push("H3E9_RAILWAY_RUNTIME_MISMATCH");

  const retention = validAuthorization(input.retention, "H3E9_ATTESTATION_RETENTION", nowMs);
  if (retention === "MISSING") blockers.push("H3E9_RETENTION_NOT_AUTHORIZED");
  if (retention === "INVALID") blockers.push("H3E9_RETENTION_AUTHORIZATION_INVALID");
  const operator = validAuthorization(
    input.operatorAuthorization,
    "H3E9_FIRST_VALID_ATTESTATION",
    nowMs,
  );
  if (operator === "MISSING") blockers.push("H3E9_OPERATOR_AUTHORIZATION_MISSING");
  if (operator === "INVALID") blockers.push("H3E9_OPERATOR_AUTHORIZATION_INVALID");

  if (input.execution.validAttestationExecuted) blockers.push("H3E9_ATTESTATION_ALREADY_EXECUTED");
  if (
    input.execution.demExecuted ||
    input.execution.cacheDemExecuted ||
    input.execution.attempt9Created ||
    (input.execution.attempt10PlusCount ?? 0) > 0
  )
    blockers.push("H3E9_DEM_EXECUTION_DETECTED");
  if (input.execution.canonicalAdmission !== "LOCKED") blockers.push("H3E9_CANONICAL_NOT_LOCKED");

  const uniqueBlockers = [...new Set(blockers)];
  const technicalBlockers = uniqueBlockers.filter(
    (blocker) =>
      ![
        "H3E9_RETENTION_NOT_AUTHORIZED",
        "H3E9_RETENTION_AUTHORIZATION_INVALID",
        "H3E9_OPERATOR_AUTHORIZATION_MISSING",
        "H3E9_OPERATOR_AUTHORIZATION_INVALID",
      ].includes(blocker),
  );

  return {
    ...input,
    status: uniqueBlockers.length === 0 ? "READY" : "BLOCKED",
    blockers: uniqueBlockers,
    gateVersion: H3E9_GATE_VERSION,
    technicalReadiness: technicalBlockers.length === 0 ? "READY" : "BLOCKED",
    attestationAuthorization: input.retention.status,
    executionAuthorization: input.operatorAuthorization.status,
    attestationExecuted: input.execution.validAttestationExecuted,
    provenanceVerified: input.storage.verifiedProvenanceCount === undefined ? (input.storage.provenanceCount !== null && input.storage.provenanceCount > 0) : input.storage.verifiedProvenanceCount === null ? null : input.storage.verifiedProvenanceCount > 0,
    operation: "DIAGNOSTIC_ONLY",
    sideEffects: false,
  };
}

export const H3E9_EXPECTED_OIDC = PARSER_ATTESTATION_OIDC;
