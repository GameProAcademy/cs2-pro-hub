import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PARSER_ATTESTATION_EXPECTED } from "@/lib/parserAttestation";
import {
  H3E9_EXPECTED_ENDPOINT,
  H3E9_EXPECTED_MIGRATION,
  evaluateH3E9FinalExecutionReadiness,
  type H3E9ReadinessInput,
} from "@/lib/h3e9FinalExecutionReadiness";

const validAuthorization = (scope: string) => ({
  status: "AUTHORIZED" as const,
  reference: "approval:test-only",
  issuedAt: "2026-09-25T00:00:00.000Z",
  expiresAt: "2026-09-26T00:00:00.000Z",
  scope,
});

const readyInput = (): H3E9ReadinessInput => ({
  now: "2026-09-25T01:00:00.000Z",
  identities: {
    repository: PARSER_ATTESTATION_EXPECTED.repository,
    attestorBranch: PARSER_ATTESTATION_EXPECTED.attestorBranch,
    railwayBranch: PARSER_ATTESTATION_EXPECTED.branch,
    parserCommit: PARSER_ATTESTATION_EXPECTED.commit,
    deploymentId: PARSER_ATTESTATION_EXPECTED.deploymentId,
    projectId: PARSER_ATTESTATION_EXPECTED.projectId,
    serviceId: PARSER_ATTESTATION_EXPECTED.serviceId,
    environmentId: PARSER_ATTESTATION_EXPECTED.environmentId,
    workflowPath: PARSER_ATTESTATION_EXPECTED.workflowPath,
    workflowSourceSha: PARSER_ATTESTATION_EXPECTED.workflowSourceSha,
  },
  storage: { provenanceCount: 0, nonceCount: 0 },
  database: {
    migrationVersion: H3E9_EXPECTED_MIGRATION.version,
    migrationName: H3E9_EXPECTED_MIGRATION.name,
    rlsEnabled: true,
    clientPrivilegesZero: true,
    recorderServiceRoleOnly: true,
    hmacBridgeServiceRoleOnly: true,
    securityDefiner: true,
    emptySearchPath: true,
  },
  transport: {
    endpointConfigured: true,
    endpoint: H3E9_EXPECTED_ENDPOINT,
    anonymousNegativeBoundary: true,
    anonymousNegativeBoundaryStatus: 401,
  },
  secrets: {
    endpointPresent: true,
    transportSecretPresent: true,
    hmacSecretPresent: true,
    railwayTokenPresent: true,
  },
  workflow: {
    approvedPath: PARSER_ATTESTATION_EXPECTED.workflowPath,
    approvedSourceSha: PARSER_ATTESTATION_EXPECTED.workflowSourceSha,
    registryMatches: true,
    sourceMatches: true,
    oidcConfigured: true,
  },
  railway: {
    deploymentIdMatches: true,
    deploymentStatus: "SUCCESS",
    branchMatches: true,
    parserCommitMatches: true,
    parserNameMatches: true,
    parserVersionMatches: true,
    contractVersionMatches: true,
    projectMatches: true,
    serviceMatches: true,
    environmentMatches: true,
    bothRuntimeDomainsMatch: true,
  },
  retention: validAuthorization("H3E9_ATTESTATION_RETENTION"),
  operatorAuthorization: validAuthorization("H3E9_FIRST_VALID_ATTESTATION"),
  execution: {
    validAttestationExecuted: false,
    demExecuted: false,
    cacheDemExecuted: false,
    attempt9Created: false,
    canonicalAdmission: "LOCKED",
  },
});

function blockerFor(mutator: (input: H3E9ReadinessInput) => void) {
  const input = readyInput();
  mutator(input);
  return evaluateH3E9FinalExecutionReadiness(input);
}

describe("H.3-E.9 final execution readiness", () => {
  it("is READY only when every explicit requirement is green", () => {
    const result = evaluateH3E9FinalExecutionReadiness(readyInput());
    expect(result.status).toBe("READY");
    expect(result.blockers).toEqual([]);
    expect(result.operation).toBe("DIAGNOSTIC_ONLY");
    expect(result.sideEffects).toBe(false);
  });

  it.each([
    [
      "deployment",
      "H3E9_IDENTITY_MISMATCH",
      (i: H3E9ReadinessInput) => (i.identities.deploymentId = "stale"),
    ],
    [
      "workflow identity",
      "H3E9_IDENTITY_MISMATCH",
      (i: H3E9ReadinessInput) => (i.identities.workflowSourceSha = "stale"),
    ],
    [
      "provenance",
      "H3E9_UNEXPECTED_PROVENANCE",
      (i: H3E9ReadinessInput) => (i.storage.provenanceCount = 1),
    ],
    ["nonce", "H3E9_UNEXPECTED_NONCE", (i: H3E9ReadinessInput) => (i.storage.nonceCount = 1)],
    [
      "RLS",
      "H3E9_DATABASE_SECURITY_INVARIANT_FAILED",
      (i: H3E9ReadinessInput) => (i.database.rlsEnabled = false),
    ],
    [
      "anon privilege",
      "H3E9_DATABASE_SECURITY_INVARIANT_FAILED",
      (i: H3E9ReadinessInput) => (i.database.clientPrivilegesZero = false),
    ],
    [
      "recorder role",
      "H3E9_DATABASE_SECURITY_INVARIANT_FAILED",
      (i: H3E9ReadinessInput) => (i.database.recorderServiceRoleOnly = false),
    ],
    [
      "security definer",
      "H3E9_DATABASE_SECURITY_INVARIANT_FAILED",
      (i: H3E9ReadinessInput) => (i.database.securityDefiner = false),
    ],
    [
      "search path",
      "H3E9_DATABASE_SECURITY_INVARIANT_FAILED",
      (i: H3E9ReadinessInput) => (i.database.emptySearchPath = false),
    ],
    [
      "migration history",
      "H3E9_MIGRATION_HISTORY_MISMATCH",
      (i: H3E9ReadinessInput) => (i.database.migrationVersion = "missing"),
    ],
    [
      "endpoint",
      "H3E9_ENDPOINT_MISMATCH",
      (i: H3E9ReadinessInput) => (i.transport.endpoint = "https://wrong.invalid"),
    ],
    [
      "negative boundary",
      "H3E9_ANONYMOUS_BOUNDARY_FAILED",
      (i: H3E9ReadinessInput) => (i.transport.anonymousNegativeBoundaryStatus = 200),
    ],
    [
      "transport secret",
      "H3E9_TRANSPORT_SECRET_MISSING",
      (i: H3E9ReadinessInput) => (i.secrets.transportSecretPresent = false),
    ],
    [
      "HMAC secret",
      "H3E9_HMAC_SECRET_MISSING",
      (i: H3E9ReadinessInput) => (i.secrets.hmacSecretPresent = false),
    ],
    [
      "Railway token",
      "H3E9_RAILWAY_TOKEN_MISSING",
      (i: H3E9ReadinessInput) => (i.secrets.railwayTokenPresent = false),
    ],
    [
      "deployment status",
      "H3E9_RAILWAY_DEPLOYMENT_NOT_SUCCESS",
      (i: H3E9ReadinessInput) => (i.railway.deploymentStatus = "FAILED"),
    ],
    [
      "runtime commit",
      "H3E9_RAILWAY_RUNTIME_MISMATCH",
      (i: H3E9ReadinessInput) => (i.railway.parserCommitMatches = false),
    ],
    [
      "runtime version",
      "H3E9_RAILWAY_RUNTIME_MISMATCH",
      (i: H3E9ReadinessInput) => (i.railway.parserVersionMatches = false),
    ],
    [
      "Canonical lock",
      "H3E9_CANONICAL_NOT_LOCKED",
      (i: H3E9ReadinessInput) => (i.execution.canonicalAdmission = "UNLOCKED"),
    ],
  ])("blocks when %s fails", (_name, code, mutate) => {
    const result = blockerFor(mutate);
    expect(result.status).toBe("BLOCKED");
    expect(result.blockers).toContain(code);
  });

  it("keeps technical readiness separate from absent retention authorization", () => {
    const result = blockerFor((input) => {
      input.retention = { status: "NOT_AUTHORIZED" };
    });
    expect(result.technicalReadiness).toBe("READY");
    expect(result.status).toBe("BLOCKED");
    expect(result.blockers).toContain("H3E9_RETENTION_NOT_AUTHORIZED");
  });

  it("reports the shared non-empty database blocker with specific provenance and nonce causes", () => {
    const result = blockerFor((input) => {
      input.storage.provenanceCount = 1;
      input.storage.nonceCount = 1;
    });
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "H3E9_DATABASE_STATE_NOT_EMPTY",
        "H3E9_UNEXPECTED_PROVENANCE",
        "H3E9_UNEXPECTED_NONCE",
      ]),
    );
  });

  it("rejects expired retention authorization", () => {
    const result = blockerFor((input) => {
      input.retention.expiresAt = "2026-09-25T00:30:00.000Z";
    });
    expect(result.blockers).toContain("H3E9_RETENTION_AUTHORIZATION_INVALID");
  });

  it("keeps READY separate from absent operator authorization", () => {
    const result = blockerFor((input) => {
      input.operatorAuthorization = { status: "NOT_AUTHORIZED" };
    });
    expect(result.technicalReadiness).toBe("READY");
    expect(result.status).toBe("BLOCKED");
    expect(result.executionAuthorization).toBe("NOT_AUTHORIZED");
    expect(result.blockers).toContain("H3E9_OPERATOR_AUTHORIZATION_MISSING");
  });

  it.each([
    [
      "valid attestation",
      (i: H3E9ReadinessInput) => (i.execution.validAttestationExecuted = true),
      "H3E9_ATTESTATION_ALREADY_EXECUTED",
    ],
    [
      "DEM",
      (i: H3E9ReadinessInput) => (i.execution.demExecuted = true),
      "H3E9_DEM_EXECUTION_DETECTED",
    ],
    [
      "Cache DEM",
      (i: H3E9ReadinessInput) => (i.execution.cacheDemExecuted = true),
      "H3E9_DEM_EXECUTION_DETECTED",
    ],
    [
      "Attempt 9",
      (i: H3E9ReadinessInput) => (i.execution.attempt9Created = true),
      "H3E9_DEM_EXECUTION_DETECTED",
    ],
  ])("blocks detected %s execution", (_name, mutate, code) => {
    expect(blockerFor(mutate).blockers).toContain(code);
  });

  it("is deterministic, does not mutate input, and has no action-capable dependencies", () => {
    const input = readyInput();
    const before = structuredClone(input);
    expect(evaluateH3E9FinalExecutionReadiness(input)).toEqual(
      evaluateH3E9FinalExecutionReadiness(input),
    );
    expect(input).toEqual(before);
    const source = readFileSync(resolve("src/lib/h3e9FinalExecutionReadiness.ts"), "utf8");
    expect(source).not.toMatch(/fetch\s*\(|supabase|child_process|writeFile|createServerFn/);
    expect(source).not.toMatch(/Date\.now\s*\(|Math\.random\s*\(/);
  });

  it("binds the single H.3-E.8.1 migration without creating a duplicate", () => {
    const files = readFileSync(
      resolve("src/lib/pipeline/__tests__/parserAttestationDatabaseParity.test.ts"),
      "utf8",
    );
    expect(files).toContain("20260925011902_051ef9cf-6adf-4689-9fe2-c2fc86dedc40.sql");
    expect(files).toContain("20260929110000_r58_1_recorder_pin_repair.sql");
  });
});
