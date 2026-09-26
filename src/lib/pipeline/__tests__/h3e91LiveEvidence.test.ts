import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { finalizeH3E91Artifact } from "@/lib/h3e91Collector.server";
import {
  H3E91_OIDC_AUDIENCE,
  H3E91_WORKFLOW_PATH,
  h3e91ExternalEvidenceSchema,
  type H3E91DatabaseEvidence,
  type H3E91ExternalEvidence,
} from "@/lib/h3e91LiveEvidence";
import { evaluateH3E9FinalExecutionReadiness } from "@/lib/h3e9FinalExecutionReadiness";
import { validateH3E91OidcClaims } from "@/lib/h3e91Oidc.server";
import { canonicalAttestationJson } from "@/lib/parserAttestationCrypto.server";

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
      sourceCommit: "a".repeat(40),
    },
    workflowEvidence: {
      approvedPathMatches: safe(true),
      actualBlobSha: safe("fae651ed5174aa609e4b07d575105d80a00d0055"),
      approvedBlobSha: safe("fae651ed5174aa609e4b07d575105d80a00d0055"),
      blobMatches: safe(true),
      oidcStructureValid: safe(true),
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
    transportEvidence: { endpointMatches: safe(true), anonymousStatus: safe(401) },
  };
}

function database(): H3E91DatabaseEvidence {
  return {
    source: "LIVE_DATABASE_READ_ONLY",
    observedAt: NOW,
    status: "PASS",
    provenanceCount: 0,
    nonceCount: 0,
    attempt9Count: 0,
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
    ref: "refs/heads/main",
    ref_type: "branch",
    event_name: "workflow_dispatch",
    workflow: "H.3-E.9.1 Live Evidence Preflight",
    workflow_ref: `GameProAcademy/cs2-pro-hub/${H3E91_WORKFLOW_PATH}@refs/heads/main`,
    workflow_sha: "a".repeat(40),
    iat: 1_790_899_170,
    nbf: 1_790_899_170,
    exp: 1_790_899_500,
  };
}

describe("H.3-E.9.1 live evidence", () => {
  it("accepts a strict safe external evidence envelope", () =>
    expect(h3e91ExternalEvidenceSchema.safeParse(external()).success).toBe(true));
  it("rejects unknown and secret-bearing fields", () => {
    const candidate = structuredClone(external()) as Record<string, unknown>;
    candidate["railwayToken"] = "forbidden";
    expect(h3e91ExternalEvidenceSchema.safeParse(candidate).success).toBe(false);
  });
  it("produces READY only for fully valid synthetic evidence with explicit synthetic authorizations", () => {
    const artifact = finalizeH3E91Artifact(external(), database());
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
    const artifact = finalizeH3E91Artifact(external(), database());
    expect(artifact.finalResult.technicalReadiness).toBe("READY");
    expect(artifact.finalResult.status).toBe("BLOCKED");
    expect(artifact.finalResult.blockers).toEqual(
      expect.arrayContaining([
        "H3E9_RETENTION_NOT_AUTHORIZED",
        "H3E9_OPERATOR_AUTHORIZATION_MISSING",
      ]),
    );
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
