import { z } from "zod";

import {
  H3E9_EXPECTED_ENDPOINT,
  H3E9_EXPECTED_MIGRATION,
  evaluateH3E9FinalExecutionReadiness,
  type H3E9AuthorizationEvidence,
  type H3E9ReadinessInput,
  type H3E9ReadinessResult,
} from "@/lib/h3e9FinalExecutionReadiness";
import { PARSER_ATTESTATION_EXPECTED } from "@/lib/parserAttestation";
import { APPROVED_ATTESTATION_WORKFLOW_SHA } from "@/lib/parserAttestationWorkflowRegistry";
import type { inspectH3E91ExecutionSurfaces } from "@/lib/h3e91ExecutionSurfaces.server";
import {
  H3E91_APPROVED_WORKFLOW_PATH,
  H3E91_APPROVED_WORKFLOW_SHA,
  H3E91_APPROVED_WORKFLOW_NAME,
} from "@/lib/h3e91WorkflowRegistry";

export const H3E91_LIVE_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const H3E91_COLLECTOR_VERSION = "H.3-E.9.1" as const;
export const H3E91_WORKFLOW_PATH = H3E91_APPROVED_WORKFLOW_PATH;
export const H3E91_OIDC_AUDIENCE = "gamepro-h3e9-live-preflight" as const;
export const H3E91_RAILWAY_SOURCE_COMMIT = "ff0cc222f514c01eda6e26d7bb95271a8b0c9b04" as const;
export const H3E91_MAX_AGE_SECONDS = 600 as const;

export function getH3E91Freshness(observedAt: string, now: string): "FRESH" | "STALE" | "UNKNOWN" {
  const observed = Date.parse(observedAt);
  const current = Date.parse(now);
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return "UNKNOWN";
  const age = current - observed;
  return age < 0 ? "UNKNOWN" : age <= H3E91_MAX_AGE_SECONDS * 1000 ? "FRESH" : "STALE";
}

const isoDate = z.string().datetime({ offset: true });
const sha40 = z.string().regex(/^[0-9a-f]{40}$/);
const evidenceStatus = z.enum(["PASS", "BLOCKED", "UNKNOWN"]);
const safeEvidence = <T extends z.ZodTypeAny>(value: T) =>
  z
    .object({
      source: z.string().min(1).max(160),
      observedAt: isoDate,
      classification: z.literal("SAFE_NON_SECRET"),
      status: evidenceStatus,
      value,
    })
    .strict();

export const h3e91ExternalEvidenceSchema = z
  .object({
    schemaVersion: z.literal(H3E91_LIVE_EVIDENCE_SCHEMA_VERSION),
    observedAt: isoDate,
    workflowIdentity: z
      .object({
        repository: z.literal(PARSER_ATTESTATION_EXPECTED.repository),
        ref: z.literal("refs/heads/main"),
        refType: z.literal("branch"),
        eventName: z.literal("workflow_dispatch"),
        workflow: z.literal(H3E91_APPROVED_WORKFLOW_NAME),
        workflowRef: z.literal(
          `${PARSER_ATTESTATION_EXPECTED.repository}/${H3E91_WORKFLOW_PATH}@refs/heads/main`,
        ),
        collectorWorkflowSha: z.literal(H3E91_APPROVED_WORKFLOW_SHA),
        collectorTriggerCommitSha: sha40,
      })
      .strict(),
    workflowEvidence: z
      .object({
        approvedPathMatches: safeEvidence(z.boolean()),
        actualBlobSha: safeEvidence(sha40.nullable()),
        approvedBlobSha: safeEvidence(sha40),
        blobMatches: safeEvidence(z.boolean()),
        oidcStructureValid: safeEvidence(z.boolean()),
        collectorWorkflowSha: safeEvidence(sha40.nullable()),
      })
      .strict(),
    secretPresence: z
      .object({
        endpointPresent: safeEvidence(z.boolean()),
        transportSecretPresent: safeEvidence(z.boolean()),
        hmacSecretPresent: safeEvidence(z.boolean()),
        railwayTokenPresent: safeEvidence(z.boolean()),
      })
      .strict(),
    railwayEvidence: z
      .object({
        available: safeEvidence(z.boolean()),
        projectMatches: safeEvidence(z.boolean()),
        serviceMatches: safeEvidence(z.boolean()),
        environmentMatches: safeEvidence(z.boolean()),
        deploymentIdMatches: safeEvidence(z.boolean()),
        deploymentStatus: safeEvidence(z.string().max(40).nullable()),
        branchMatches: safeEvidence(z.boolean()),
        sourceCommitMatches: safeEvidence(z.boolean()),
      })
      .strict(),
    runtimeEvidence: z
      .object({
        customDomainAvailable: safeEvidence(z.boolean()),
        railwayDomainAvailable: safeEvidence(z.boolean()),
        healthMatches: safeEvidence(z.boolean()),
        parserNameMatches: safeEvidence(z.boolean()),
        parserVersionMatches: safeEvidence(z.boolean()),
        parserRevisionMatches: safeEvidence(z.boolean()),
        contractVersionMatches: safeEvidence(z.boolean()),
        bothDomainsMatch: safeEvidence(z.boolean()),
      })
      .strict(),
    transportEvidence: z
      .object({
        endpointMatches: safeEvidence(z.boolean()),
        anonymousStatus: safeEvidence(z.number().int().min(100).max(599).nullable()),
        preNegativeProvenanceCount: safeEvidence(z.number().int().nonnegative().nullable()),
        postNegativeProvenanceCount: safeEvidence(z.number().int().nonnegative().nullable()),
        preNegativeNonceCount: safeEvidence(z.number().int().nonnegative().nullable()),
        postNegativeNonceCount: safeEvidence(z.number().int().nonnegative().nullable()),
        noNegativePostSideEffect: safeEvidence(z.boolean().nullable()),
      })
      .strict(),
  })
  .strict();

export type H3E91ExternalEvidence = z.infer<typeof h3e91ExternalEvidenceSchema>;

export interface H3E91DatabaseEvidence {
  source: "LIVE_DATABASE_READ_ONLY";
  observedAt: string;
  status: "PASS" | "BLOCKED" | "UNKNOWN";
  provenanceCount: number | null;
  verifiedProvenanceCount: number | null;
  nonceCount: number | null;
  attempt9Count: number | null;
  attempt10PlusCount: number | null;
  realDemoExecutionCount: number | null;
  cacheDemoExecutionCount: number | null;
  historicalStartedJobCount: number | null;
  executionEvidence?: {
    ledgerType: string | null;
    ledgerAuthority: string | null;
    baselineStartedAt: string;
    historicalCount: number | null;
    spanningBaselineCount: number | null;
    afterBaselineCount: number | null;
    cacheAfterBaselineCount: number | null;
    attempt9AfterBaselineCount: number | null;
    attempt10PlusAfterBaselineCount: number | null;
    writerCoverageVerified: boolean | null;
    securityVerified: boolean | null;
  };
  canonical: {
    total: number | null;
    authorized: number | null;
    verified: number | null;
    generic: number | null;
  };
  migration: { version: string | null; name: string | null; exactMatchCount: number | null };
  security: {
    rlsEnabled: boolean | null;
    clientPrivilegesZero: boolean | null;
    recorderServiceRoleOnly: boolean | null;
    hmacBridgeServiceRoleOnly: boolean | null;
    securityDefiner: boolean | null;
    emptySearchPath: boolean | null;
    approvedPinsPresent: boolean | null;
    transactionLocalHmacBridge: boolean | null;
    noClientExecutableBypass: boolean | null;
  };
}

export interface H3E91Artifact {
  schemaVersion: typeof H3E91_LIVE_EVIDENCE_SCHEMA_VERSION;
  gate: "H.3-E.9";
  collectorVersion: typeof H3E91_COLLECTOR_VERSION;
  observedAt: string;
  baselineStartedAt: string;
  baseline: { startedAt: string; source: "SERVER_READ_ONLY_PREFLIGHT_BASELINE"; semantics: "COUNT_EXECUTION_STARTED_AFTER_BASELINE_ONLY" };
  freshness: "FRESH" | "STALE" | "UNKNOWN";
  parserRuntimeRevision: string;
  workflowIdentity: H3E91ExternalEvidence["workflowIdentity"];
  collectorWorkflowSha: string;
  collectorTriggerCommitSha: string;
  attestationWorkflowSourceSha: string | null;
  railwayDeploymentCommit: string;
  databaseEvidence: H3E91DatabaseEvidence;
  executionEvidence: NonNullable<H3E91DatabaseEvidence["executionEvidence"]>;
  executionSurfaceCoverage: ReturnType<typeof inspectH3E91ExecutionSurfaces>;
  securityEvidence: H3E91DatabaseEvidence["security"];
  runtimeEvidence: H3E91ExternalEvidence["runtimeEvidence"];
  railwayEvidence: H3E91ExternalEvidence["railwayEvidence"];
  transportEvidence: H3E91ExternalEvidence["transportEvidence"];
  secretPresence: H3E91ExternalEvidence["secretPresence"];
  authorizationEvidence: {
    retention: H3E9AuthorizationEvidence;
    operator: H3E9AuthorizationEvidence;
  };
  executionLocks: H3E9ReadinessInput["execution"] & {
    attempt10PlusCount: number | null;
    realDemoExecutionCount: number | null;
    cacheDemoExecutionCount: number | null;
    historicalStartedJobCount: number | null;
  };
  finalResult: H3E9ReadinessResult;
  evidenceDigest: string;
}

export function buildH3E91ReadinessInput(
  external: H3E91ExternalEvidence,
  database: H3E91DatabaseEvidence,
): H3E9ReadinessInput {
  const security = database.security;
  return {
    now: external.observedAt,
    identities: {
      repository: external.workflowIdentity.repository,
      attestorBranch:
        external.workflowIdentity.ref === "refs/heads/main"
          ? "main"
          : external.workflowIdentity.ref,
      railwayBranch: PARSER_ATTESTATION_EXPECTED.branch,
      parserCommit: PARSER_ATTESTATION_EXPECTED.commit,
      deploymentId: PARSER_ATTESTATION_EXPECTED.deploymentId,
      projectId: PARSER_ATTESTATION_EXPECTED.projectId,
      serviceId: PARSER_ATTESTATION_EXPECTED.serviceId,
      environmentId: PARSER_ATTESTATION_EXPECTED.environmentId,
      workflowPath:
        external.workflowEvidence.approvedPathMatches.value &&
        external.workflowEvidence.approvedPathMatches.status === "PASS"
          ? PARSER_ATTESTATION_EXPECTED.workflowPath
          : "MISMATCH",
      workflowSourceSha: external.workflowEvidence.actualBlobSha.value ?? "UNKNOWN",
    },
    storage: {
      provenanceCount: database.provenanceCount,
      nonceCount: database.nonceCount,
      verifiedProvenanceCount: database.verifiedProvenanceCount,
    },
    database: {
      migrationVersion:
        database.migration.exactMatchCount === 1
          ? (database.migration.version ?? "UNKNOWN")
          : "UNKNOWN",
      migrationName:
        database.migration.exactMatchCount === 1
          ? (database.migration.name ?? "UNKNOWN")
          : "UNKNOWN",
      rlsEnabled: security.rlsEnabled,
      clientPrivilegesZero: security.clientPrivilegesZero,
      recorderServiceRoleOnly: security.recorderServiceRoleOnly,
      hmacBridgeServiceRoleOnly: security.hmacBridgeServiceRoleOnly,
      securityDefiner: security.securityDefiner,
      emptySearchPath: security.emptySearchPath,
      migrationExactMatchCount: database.migration.exactMatchCount,
    },
    transport: {
      endpointConfigured: external.secretPresence.endpointPresent.value,
      endpoint: external.transportEvidence.endpointMatches.value ? H3E9_EXPECTED_ENDPOINT : null,
      anonymousNegativeBoundary:
        external.transportEvidence.anonymousStatus.value === 401 &&
        external.transportEvidence.noNegativePostSideEffect.value === true,
      anonymousNegativeBoundaryStatus: external.transportEvidence.anonymousStatus.value,
    },
    secrets: {
      endpointPresent: external.secretPresence.endpointPresent.value,
      transportSecretPresent: external.secretPresence.transportSecretPresent.value,
      hmacSecretPresent: external.secretPresence.hmacSecretPresent.value,
      railwayTokenPresent: external.secretPresence.railwayTokenPresent.value,
    },
    workflow: {
      approvedPath:
        external.workflowEvidence.approvedPathMatches.value &&
        external.workflowEvidence.approvedPathMatches.status === "PASS"
          ? PARSER_ATTESTATION_EXPECTED.workflowPath
          : "MISMATCH",
      approvedSourceSha: APPROVED_ATTESTATION_WORKFLOW_SHA,
      registryMatches:
        external.workflowEvidence.approvedBlobSha.value === APPROVED_ATTESTATION_WORKFLOW_SHA &&
        external.workflowEvidence.actualBlobSha.value === APPROVED_ATTESTATION_WORKFLOW_SHA &&
        external.workflowEvidence.blobMatches.value &&
        external.workflowEvidence.blobMatches.status === "PASS",
      sourceMatches:
        external.workflowEvidence.actualBlobSha.value === APPROVED_ATTESTATION_WORKFLOW_SHA &&
        external.workflowEvidence.actualBlobSha.status === "PASS",
      oidcConfigured:
        external.workflowEvidence.oidcStructureValid.value &&
        external.workflowEvidence.oidcStructureValid.status === "PASS",
    },
    railway: {
      deploymentIdMatches:
        external.railwayEvidence.deploymentIdMatches.value &&
        external.railwayEvidence.deploymentIdMatches.status === "PASS" &&
        external.railwayEvidence.available.value,
      deploymentStatus: external.railwayEvidence.deploymentStatus.value ?? "UNKNOWN",
      branchMatches: external.railwayEvidence.branchMatches.value,
      parserCommitMatches: external.railwayEvidence.sourceCommitMatches.value,
      parserNameMatches: external.runtimeEvidence.parserNameMatches.value,
      parserVersionMatches: external.runtimeEvidence.parserVersionMatches.value,
      contractVersionMatches: external.runtimeEvidence.contractVersionMatches.value,
      projectMatches: external.railwayEvidence.projectMatches.value,
      serviceMatches: external.railwayEvidence.serviceMatches.value,
      environmentMatches: external.railwayEvidence.environmentMatches.value,
      bothRuntimeDomainsMatch:
        external.runtimeEvidence.customDomainAvailable.value &&
        external.runtimeEvidence.railwayDomainAvailable.value &&
        external.runtimeEvidence.bothDomainsMatch.value &&
        external.runtimeEvidence.healthMatches.value &&
        external.runtimeEvidence.parserRevisionMatches.value,
    },
    retention: { status: "NOT_AUTHORIZED" },
    operatorAuthorization: { status: "NOT_AUTHORIZED" },
    execution: {
      validAttestationExecuted:
        database.verifiedProvenanceCount === null ? null : database.verifiedProvenanceCount > 0,
      demExecuted:
        database.realDemoExecutionCount === null ? null : database.realDemoExecutionCount > 0,
      cacheDemExecuted:
        database.cacheDemoExecutionCount === null ? null : database.cacheDemoExecutionCount > 0,
      attempt9Created:
        database.attempt9Count === null || database.attempt10PlusCount === null
          ? null
          : database.attempt9Count > 0 || database.attempt10PlusCount > 0,
      realDemoExecutionCount: database.realDemoExecutionCount,
      cacheDemoExecutionCount: database.cacheDemoExecutionCount,
      attempt10PlusCount: database.attempt10PlusCount,
      canonicalAdmission:
        database.canonical.authorized === 0 && database.canonical.verified === 0
          ? "LOCKED"
          : database.canonical.authorized === null || database.canonical.verified === null
            ? "UNKNOWN"
            : "UNLOCKED",
    },
  };
}

export const H3E91_EXPECTED_MIGRATION = H3E9_EXPECTED_MIGRATION;
