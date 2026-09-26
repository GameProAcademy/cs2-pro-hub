import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { finalizeH3E91Artifact } from "@/lib/h3e91Collector.server";
import {
  H3E91_OIDC_AUDIENCE,
  H3E91_WORKFLOW_PATH,
  getH3E91Freshness,
  h3e91ExternalEvidenceSchema,
  type H3E91DatabaseEvidence,
  type H3E91ExternalEvidence,
} from "@/lib/h3e91LiveEvidence";
import { evaluateH3E9FinalExecutionReadiness } from "@/lib/h3e9FinalExecutionReadiness";
import { validateH3E91OidcClaims } from "@/lib/h3e91Oidc.server";
import { canonicalAttestationJson } from "@/lib/parserAttestationCrypto.server";
import { H3E91_APPROVED_WORKFLOW_SHA } from "@/lib/h3e91WorkflowRegistry";
import { H3E91_EXECUTION_SURFACES, inspectH3E91ExecutionSurfaces } from "@/lib/h3e91ExecutionSurfaces.server";

const NOW = "2026-09-26T00:00:00.000Z";
const safe = <T>(value: T) => ({
  source: "SYNTHETIC_TEST",
  observedAt: NOW,
  classification: "SAFE_NON_SECRET" as const,
  status: (value === false || value === null ? "BLOCKED" : "PASS") as "PASS" | "BLOCKED",
  value,
});

function external(): H3E91ExternalEvidence {
  return {
    schemaVersion: 1,
    observedAt: NOW,
    workflowIdentity: {
      repository: "GameProAcademy/cs2-pro-hub",
      ref: "refs/heads/main",
      refType: "branch",
      eventName: "workflow_dispatch",
      workflow: "H.3-E.9.1 Live Evidence Preflight",
      workflowRef: `GameProAcademy/cs2-pro-hub/${H3E91_WORKFLOW_PATH}@refs/heads/main`,
      collectorWorkflowSha: H3E91_APPROVED_WORKFLOW_SHA,
      collectorTriggerCommitSha: "a".repeat(40),
    },
    workflowEvidence: {
      approvedPathMatches: safe(true),
      actualBlobSha: safe("fae651ed5174aa609e4b07d575105d80a00d0055"),
      approvedBlobSha: safe("fae651ed5174aa609e4b07d575105d80a00d0055"),
      blobMatches: safe(true),
      oidcStructureValid: safe(true),
      collectorWorkflowSha: safe(H3E91_APPROVED_WORKFLOW_SHA),
    },
    secretPresence: {
      endpointPresent: safe(true),
      transportSecretPresent: safe(true),
      hmacSecretPresent: safe(true),
      railwayTokenPresent: safe(true),
    },
    railwayEvidence: {
      available: safe(true),
      projectMatches: safe(true),
      serviceMatches: safe(true),
      environmentMatches: safe(true),
      deploymentIdMatches: safe(true),
      deploymentStatus: safe("SUCCESS"),
      branchMatches: safe(true),
      sourceCommitMatches: safe(true),
    },
    runtimeEvidence: {
      customDomainAvailable: safe(true),
      railwayDomainAvailable: safe(true),
      healthMatches: safe(true),
      parserNameMatches: safe(true),
      parserVersionMatches: safe(true),
      parserRevisionMatches: safe(true),
      contractVersionMatches: safe(true),
      bothDomainsMatch: safe(true),
    },
    transportEvidence: {
      endpointMatches: safe(true),
      anonymousStatus: safe(401),
      preNegativeProvenanceCount: safe(0),
      postNegativeProvenanceCount: safe(0),
      preNegativeNonceCount: safe(0),
      postNegativeNonceCount: safe(0),
      noNegativePostSideEffect: safe(true),
    },
  };
}

function database(): H3E91DatabaseEvidence {
  return {
    source: "LIVE_DATABASE_READ_ONLY",
    observedAt: NOW,
    status: "PASS",
    provenanceCount: 0,
    verifiedProvenanceCount: 0,
    nonceCount: 0,
    attempt9Count: 0,
    attempt10PlusCount: 0,
    realDemoExecutionCount: 0,
    cacheDemoExecutionCount: 0,
    historicalStartedJobCount: 0,
    canonical: { total: 105, authorized: 0, verified: 0, generic: 0 },
    migration: {
      version: "20260925011902",
      name: "051ef9cf-6adf-4689-9fe2-c2fc86dedc40",
      exactMatchCount: 1,
    },
    security: {
      rlsEnabled: true,
      clientPrivilegesZero: true,
      recorderServiceRoleOnly: true,
      hmacBridgeServiceRoleOnly: true,
      securityDefiner: true,
      emptySearchPath: true,
      approvedPinsPresent: true,
      transactionLocalHmacBridge: true,
      noClientExecutableBypass: true,
    },
  };
}

function claims() {
  return {
    iss: "https://token.actions.githubusercontent.com",
    aud: H3E91_OIDC_AUDIENCE,
    repository: "GameProAcademy/cs2-pro-hub",
    repository_id: "1358428146",
    repository_owner_id: "323426481",
    sub: "repo:GameProAcademy@323426481/cs2-pro-hub@1358428146:ref:refs/heads/main",
    sha: "a".repeat(40),
    ref: "refs/heads/main",
    ref_type: "branch",
    event_name: "workflow_dispatch",
    workflow: "H.3-E.9.1 Live Evidence Preflight",
    workflow_ref: `GameProAcademy/cs2-pro-hub/${H3E91_WORKFLOW_PATH}@refs/heads/main`,
    workflow_sha: H3E91_APPROVED_WORKFLOW_SHA,
    iat: 1_790_899_170,
    nbf: 1_790_899_170,
    exp: 1_790_899_500,
  };
}

describe("H.3-E.9.1 live evidence", () => {
  it("keeps every identified parser entry point uncovered until reviewed instrumentation exists", () => {
    const coverage = inspectH3E91ExecutionSurfaces();
    expect(Object.keys(coverage.surfaces).sort()).toEqual([...H3E91_EXECUTION_SURFACES].sort());
    expect(coverage.writerCoverageVerified).toBe(false);
    expect(coverage.uncoveredSurfaceCount).toBe(4);
    expect(coverage.activeInstrumentedSurfaceCount).toBe(0);
    expect(coverage.sealedOffSurfaceCount).toBe(0);
  });
  it("rejects newly discovered or missing execution surfaces rather than treating them as covered", () => {
    const unexpected = inspectH3E91ExecutionSurfaces([...H3E91_EXECUTION_SURFACES, "TEST_UNREGISTERED_SURFACE"]);
    expect(unexpected.unexpectedWriterCount).toBe(1);
    expect(unexpected.writerCoverageVerified).toBe(false);
    const missing = inspectH3E91ExecutionSurfaces(["APP_REMOTE_PARSER"]);
    expect(missing.unknownSurfaceCount).toBe(3);
    expect(missing.writerCoverageVerified).toBe(false);
  });
  it("binds the uncovered inventory into the diagnostic digest and blocker set", () => {
    const artifact = finalizeH3E91Artifact(external(), database(), NOW, NOW);
    expect(artifact.executionSurfaceCoverage.writerCoverageVerified).toBe(false);
    expect(artifact.finalResult.blockers).toContain("H3E91_EXECUTION_SURFACE_NOT_COVERED");
    expect(artifact.finalResult.technicalReadiness).toBe("BLOCKED");
    const { evidenceDigest: _digest, ...payload } = artifact;
    expect(artifact.evidenceDigest).toBe(createHash("sha256").update(canonicalAttestationJson(payload)).digest("hex"));
  });
  it("accepts a strict safe external evidence envelope", () =>
    expect(h3e91ExternalEvidenceSchema.safeParse(external()).success).toBe(true));
  it("rejects unknown and secret-bearing fields", () => {
    const candidate = structuredClone(external()) as Record<string, unknown>;
    candidate["railwayToken"] = "forbidden";
    expect(h3e91ExternalEvidenceSchema.safeParse(candidate).success).toBe(false);
  });
  it("produces READY only for fully valid synthetic evidence with explicit synthetic authorizations", () => {
    const artifact = finalizeH3E91Artifact(external(), database(), NOW, NOW);
    artifact.finalResult.retention = {
      status: "AUTHORIZED",
      reference: "synthetic",
      issuedAt: "2026-09-25T23:00:00Z",
      expiresAt: "2026-09-26T01:00:00Z",
      scope: "H3E9_ATTESTATION_RETENTION",
    };
    artifact.finalResult.operatorAuthorization = {
      status: "AUTHORIZED",
      reference: "synthetic",
      issuedAt: "2026-09-25T23:00:00Z",
      expiresAt: "2026-09-26T01:00:00Z",
      scope: "H3E9_FIRST_VALID_ATTESTATION",
    };
    const reevaluated = evaluateH3E9FinalExecutionReadiness(artifact.finalResult);
    expect(reevaluated.status).toBe("READY");
  });
  it("keeps real collector authorization absent and overall result blocked", () => {
    const artifact = finalizeH3E91Artifact(external(), database(), NOW, NOW);
    expect(artifact.finalResult.technicalReadiness).toBe("BLOCKED");
    expect(artifact.finalResult.status).toBe("BLOCKED");
    expect(artifact.finalResult.blockers).toEqual(
      expect.arrayContaining([
        "H3E9_RETENTION_NOT_AUTHORIZED",
        "H3E9_OPERATOR_AUTHORIZATION_MISSING",
        "H3E91_EXECUTION_LEDGER_UNKNOWN",
      ]),
    );
  });
  it.each([
    "provenanceCount",
    "verifiedProvenanceCount",
    "nonceCount",
    "attempt9Count",
    "attempt10PlusCount",
    "realDemoExecutionCount",
    "cacheDemoExecutionCount",
  ] as const)("blocks unknown %s without pretending false", (key) => {
    const d = database();
    d[key] = null;
    const result = finalizeH3E91Artifact(external(), d).finalResult;
    expect(result.technicalReadiness).toBe("BLOCKED");
    expect(result.blockers).toContain("H3E91_DATABASE_EVIDENCE_UNKNOWN");
  });
  it("blocks unknown migration and every unknown security invariant", () => {
    const d = database();
    d.migration.exactMatchCount = null;
    d.security.approvedPinsPresent = null;
    const result = finalizeH3E91Artifact(external(), d).finalResult;
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "H3E91_MIGRATION_EVIDENCE_UNKNOWN",
        "H3E91_SECURITY_EVIDENCE_UNKNOWN",
      ]),
    );
  });
  it("does not infer an attestation from an unverified provenance row", () => {
    const d = database();
    d.provenanceCount = 1;
    const result = finalizeH3E91Artifact(external(), d).finalResult;
    expect(result.attestationExecuted).toBe(false);
    expect(result.blockers).toContain("H3E9_UNEXPECTED_PROVENANCE");
  });
  it("blocks negative POST side effects even if the response is 401", () => {
    const e = external();
    e.transportEvidence.postNegativeNonceCount = safe(1);
    expect(finalizeH3E91Artifact(e, database()).finalResult.blockers).toContain(
      "H3E9_ANONYMOUS_BOUNDARY_FAILED",
    );
  });
  it("changes digest when safe evidence changes", () => {
    const a = external();
    const first = finalizeH3E91Artifact(a, database());
    expect(finalizeH3E91Artifact(external(), database()).evidenceDigest).toBe(first.evidenceDigest);
    a.runtimeEvidence.healthMatches.value = false;
    expect(finalizeH3E91Artifact(a, database()).evidenceDigest).not.toBe(first.evidenceDigest);
  });
  it("blocks stale or invalid baseline instead of inferring readiness", () => {
    expect(getH3E91Freshness(NOW, "2026-09-26T00:11:00Z")).toBe("STALE");
    expect(getH3E91Freshness("invalid", NOW)).toBe("UNKNOWN");
    const result = finalizeH3E91Artifact(external(), database(), "invalid", NOW);
    expect(result.finalResult.blockers).toContain("H3E91_PREFLIGHT_STALE");
    expect(result.finalResult.technicalReadiness).toBe("BLOCKED");
  });
  it("does not treat zero mutable job rows or an uninstrumented sealed ledger as proof of absence", () => {
    const artifact = finalizeH3E91Artifact(external(), database(), NOW, NOW);
    expect(artifact.executionEvidence.afterBaselineCount).toBeNull();
    expect(artifact.finalResult.blockers).toContain("H3E91_EXECUTION_LEDGER_UNKNOWN");
    expect(artifact.finalResult.technicalReadiness).toBe("BLOCKED");
  });
  it("blocks even an empty append-only ledger until its execution writers are covered", () => {
    const d = database();
    d.executionEvidence = {
      ledgerType: "APPEND_ONLY_PREPARED", ledgerAuthority: "UNINSTRUMENTED", baselineStartedAt: NOW,
      historicalCount: 0, spanningBaselineCount: null, afterBaselineCount: 0,
      cacheAfterBaselineCount: 0, attempt9AfterBaselineCount: 0,
      attempt10PlusAfterBaselineCount: 0, writerCoverageVerified: false, securityVerified: true,
    };
    const artifact = finalizeH3E91Artifact(external(), d, NOW, NOW);
    expect(artifact.finalResult.blockers).toContain("H3E91_EXECUTION_LEDGER_MUTABLE_ONLY");
    expect(artifact.finalResult.status).toBe("BLOCKED");
    d.executionEvidence.afterBaselineCount = 1;
    const changed = finalizeH3E91Artifact(external(), d, NOW, NOW);
    expect(changed.finalResult.blockers).toContain("H3E91_EXECUTION_AFTER_BASELINE");
    expect(changed.evidenceDigest).not.toBe(artifact.evidenceDigest);
  });
  it.each([
    [
      "workflow SHA",
      (e: H3E91ExternalEvidence, _d: H3E91DatabaseEvidence) => {
        e.workflowEvidence.blobMatches.value = false;
      },
      "H3E9_WORKFLOW_SOURCE_MISMATCH",
    ],
    [
      "deployment",
      (e: H3E91ExternalEvidence) => {
        e.railwayEvidence.deploymentIdMatches.value = false;
      },
      "H3E9_RAILWAY_RUNTIME_MISMATCH",
    ],
    [
      "runtime",
      (e: H3E91ExternalEvidence) => {
        e.runtimeEvidence.bothDomainsMatch.value = false;
      },
      "H3E9_RAILWAY_RUNTIME_MISMATCH",
    ],
    [
      "anonymous boundary",
      (e: H3E91ExternalEvidence) => {
        e.transportEvidence.anonymousStatus.value = 503;
      },
      "H3E9_ANONYMOUS_BOUNDARY_FAILED",
    ],
    [
      "provenance",
      (_e: H3E91ExternalEvidence, d: H3E91DatabaseEvidence) => {
        d.provenanceCount = 1;
      },
      "H3E9_UNEXPECTED_PROVENANCE",
    ],
    [
      "nonce",
      (_e: H3E91ExternalEvidence, d: H3E91DatabaseEvidence) => {
        d.nonceCount = 1;
      },
      "H3E9_UNEXPECTED_NONCE",
    ],
    [
      "attempt 9",
      (_e: H3E91ExternalEvidence, d: H3E91DatabaseEvidence) => {
        d.attempt9Count = 1;
      },
      "H3E9_DEM_EXECUTION_DETECTED",
    ],
    [
      "canonical",
      (_e: H3E91ExternalEvidence, d: H3E91DatabaseEvidence) => {
        d.canonical.authorized = 1;
      },
      "H3E9_CANONICAL_NOT_LOCKED",
    ],
    [
      "migration missing",
      (_e: H3E91ExternalEvidence, d: H3E91DatabaseEvidence) => {
        d.migration.exactMatchCount = 0;
      },
      "H3E9_MIGRATION_HISTORY_MISMATCH",
    ],
    [
      "migration duplicate",
      (_e: H3E91ExternalEvidence, d: H3E91DatabaseEvidence) => {
        d.migration.exactMatchCount = 2;
      },
      "H3E9_MIGRATION_HISTORY_MISMATCH",
    ],
    [
      "RLS",
      (_e: H3E91ExternalEvidence, d: H3E91DatabaseEvidence) => {
        d.security.rlsEnabled = false;
      },
      "H3E9_DATABASE_SECURITY_INVARIANT_FAILED",
    ],
    [
      "unknown database",
      (_e: H3E91ExternalEvidence, d: H3E91DatabaseEvidence) => {
        d.security.rlsEnabled = null;
      },
      "H3E9_DATABASE_SECURITY_INVARIANT_FAILED",
    ],
    [
      "endpoint secret",
      (e: H3E91ExternalEvidence) => {
        e.secretPresence.endpointPresent.value = false;
      },
      "H3E9_ENDPOINT_NOT_CONFIGURED",
    ],
    [
      "transport secret",
      (e: H3E91ExternalEvidence) => {
        e.secretPresence.transportSecretPresent.value = false;
      },
      "H3E9_TRANSPORT_SECRET_MISSING",
    ],
    [
      "HMAC secret",
      (e: H3E91ExternalEvidence) => {
        e.secretPresence.hmacSecretPresent.value = false;
      },
      "H3E9_HMAC_SECRET_MISSING",
    ],
    [
      "Railway token",
      (e: H3E91ExternalEvidence) => {
        e.secretPresence.railwayTokenPresent.value = false;
      },
      "H3E9_RAILWAY_TOKEN_MISSING",
    ],
  ])("blocks %s", (_name, mutate, code) => {
    const e = external();
    const d = database();
    mutate(e, d);
    expect(finalizeH3E91Artifact(e, d).finalResult.blockers).toContain(code);
  });
  it("computes a reproducible digest excluding itself", () => {
    const artifact = finalizeH3E91Artifact(external(), database());
    const { evidenceDigest: _ignored, ...payload } = artifact;
    expect(artifact.evidenceDigest).toBe(
      createHash("sha256").update(canonicalAttestationJson(payload)).digest("hex"),
    );
  });
  it("has no action-capable dependencies", () => {
    const collector = readFileSync(resolve("src/lib/h3e91Collector.server.ts"), "utf8");
    const workflow = readFileSync(
      resolve(".github/workflows/h3-e9-1-live-evidence-preflight.yml"),
      "utf8",
    );
    expect(collector).not.toMatch(
      /supabaseAdmin[\s\S]{0,120}\.(insert|update|delete)\(|workflow_dispatch|child_process|RAILWAY_API_TOKEN/,
    );
    expect(workflow).not.toMatch(
      /actions:\s*write|workflow_run:|dispatches|parser_runtime_attestation\.py|\/parse|\.dem/,
    );
  });
});

describe("H.3-E.9.1 OIDC claims", () => {
  it("accepts exact workflow identity", () =>
    expect(validateH3E91OidcClaims(claims(), 1_790_899_200)).toEqual([]));
  it.each([
    ["issuer", "iss"],
    ["audience", "aud"],
    ["repository", "repository"],
    ["branch", "ref"],
    ["event", "event_name"],
    ["workflow", "workflow"],
    ["workflow ref", "workflow_ref"],
    ["workflow SHA", "workflow_sha"],
  ])("rejects wrong %s", (_name, key) => {
    const candidate = claims();
    candidate[key as keyof typeof candidate] = "wrong" as never;
    expect(validateH3E91OidcClaims(candidate, 1_790_899_200)).not.toEqual([]);
  });
  it("rejects expired identity", () => {
    const candidate = claims();
    candidate.exp = 1_790_899_199;
    expect(validateH3E91OidcClaims(candidate, 1_790_899_200)).toContain("H3E91_OIDC_TIME_INVALID");
  });
});
