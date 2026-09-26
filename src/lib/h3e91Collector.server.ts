import { createHash } from "node:crypto";

import type {
  H3E91Artifact,
  H3E91DatabaseEvidence,
  H3E91ExternalEvidence,
} from "@/lib/h3e91LiveEvidence";
import {
  H3E91_COLLECTOR_VERSION,
  H3E91_EXPECTED_MIGRATION,
  H3E91_LIVE_EVIDENCE_SCHEMA_VERSION,
  buildH3E91ReadinessInput,
} from "@/lib/h3e91LiveEvidence";
import { evaluateH3E9FinalExecutionReadiness } from "@/lib/h3e9FinalExecutionReadiness";
import { canonicalAttestationJson } from "@/lib/parserAttestationCrypto.server";

function unknownDatabaseEvidence(observedAt: string): H3E91DatabaseEvidence {
  return {
    source: "LIVE_DATABASE_READ_ONLY",
    observedAt,
    status: "UNKNOWN",
    provenanceCount: null,
    verifiedProvenanceCount: null,
    nonceCount: null,
    attempt9Count: null,
    attempt10PlusCount: null,
    realDemoExecutionCount: null,
    cacheDemoExecutionCount: null,
    canonical: { total: null, authorized: null, verified: null, generic: null },
    migration: { version: null, name: null, exactMatchCount: null },
    security: {
      rlsEnabled: null,
      clientPrivilegesZero: null,
      recorderServiceRoleOnly: null,
      hmacBridgeServiceRoleOnly: null,
      securityDefiner: null,
      emptySearchPath: null,
      approvedPinsPresent: null,
      transactionLocalHmacBridge: null,
      noClientExecutableBypass: null,
    },
  };
}

export async function collectH3E91DatabaseEvidence(
  observedAt: string,
): Promise<H3E91DatabaseEvidence> {
  const evidence = unknownDatabaseEvidence(observedAt);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("h3e91_live_database_evidence");
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return evidence;
    const value = data as Record<string, unknown>;
    for (const key of ["provenanceCount", "verifiedProvenanceCount", "nonceCount", "attempt9Count", "attempt10PlusCount"] as const) {
      const count = value[key];
      if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) evidence[key] = count;
    }
    const canonical = value["canonical"];
    if (canonical && typeof canonical === "object" && !Array.isArray(canonical)) {
      for (const key of Object.keys(evidence.canonical) as Array<keyof H3E91DatabaseEvidence["canonical"]>) {
        const count = (canonical as Record<string,unknown>)[key];
        if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) evidence.canonical[key] = count;
      }
    }
    const exactMigration = value["migrationExactMatchCount"];
    if (typeof exactMigration === "number" && Number.isSafeInteger(exactMigration) && exactMigration >= 0) evidence.migration = {
      version: H3E91_EXPECTED_MIGRATION.version,
      name: H3E91_EXPECTED_MIGRATION.name,
      exactMatchCount: exactMigration,
    };
    const security = value["security"];
    if (security && typeof security === "object" && !Array.isArray(security)) {
      for (const key of Object.keys(evidence.security) as Array<keyof H3E91DatabaseEvidence["security"]>) {
        const observed = (security as Record<string,unknown>)[key];
        if (typeof observed === "boolean") evidence.security[key] = observed;
      }
    }
    const countsKnown = [
      evidence.provenanceCount,
      evidence.verifiedProvenanceCount,
      evidence.nonceCount,
      evidence.attempt9Count,
      evidence.attempt10PlusCount,
      ...Object.values(evidence.canonical),
    ].every((value) => typeof value === "number");
    const securityKnown = Object.values(evidence.security).every(
      (value) => typeof value === "boolean",
    );
    evidence.status =
      countsKnown && securityKnown && evidence.migration.exactMatchCount !== null
        ? evidence.migration.exactMatchCount === 1 && Object.values(evidence.security).every(Boolean) ? "PASS" : "BLOCKED"
        : "UNKNOWN";
    return evidence;
  } catch {
    return evidence;
  }
}

export async function buildH3E91Artifact(external: H3E91ExternalEvidence): Promise<H3E91Artifact> {
  const databaseEvidence = await collectH3E91DatabaseEvidence(external.observedAt);
  return finalizeH3E91Artifact(external, databaseEvidence);
}

export function finalizeH3E91Artifact(
  external: H3E91ExternalEvidence,
  databaseEvidence: H3E91DatabaseEvidence,
): H3E91Artifact {
  const input = buildH3E91ReadinessInput(external, databaseEvidence);
  const finalResult = evaluateH3E9FinalExecutionReadiness(input);
  const withoutDigest = {
    schemaVersion: H3E91_LIVE_EVIDENCE_SCHEMA_VERSION,
    gate: "H.3-E.9" as const,
    collectorVersion: H3E91_COLLECTOR_VERSION,
    observedAt: external.observedAt,
    workflowIdentity: external.workflowIdentity,
    collectorWorkflowSha: external.workflowIdentity.collectorWorkflowSha,
    collectorTriggerCommitSha: external.workflowIdentity.collectorTriggerCommitSha,
    attestationWorkflowSourceSha: external.workflowEvidence.actualBlobSha.value,
    railwayDeploymentCommit: "ff0cc222f514c01eda6e26d7bb95271a8b0c9b04",
    databaseEvidence,
    securityEvidence: databaseEvidence.security,
    runtimeEvidence: external.runtimeEvidence,
    railwayEvidence: external.railwayEvidence,
    transportEvidence: external.transportEvidence,
    secretPresence: external.secretPresence,
    authorizationEvidence: { retention: input.retention, operator: input.operatorAuthorization },
    executionLocks: { ...input.execution, attempt10PlusCount: databaseEvidence.attempt10PlusCount, realDemoExecutionCount: databaseEvidence.realDemoExecutionCount, cacheDemoExecutionCount: databaseEvidence.cacheDemoExecutionCount },
    finalResult: {
      ...finalResult,
      blockers: [...new Set([
        ...finalResult.blockers,
        ...getH3E91EvidenceBlockers(external, databaseEvidence),
      ])],
      technicalReadiness: getH3E91EvidenceBlockers(external, databaseEvidence).length ? "BLOCKED" as const : finalResult.technicalReadiness,
      status: getH3E91EvidenceBlockers(external, databaseEvidence).length ? "BLOCKED" as const : finalResult.status,
    },
  };
  const evidenceDigest = createHash("sha256")
    .update(canonicalAttestationJson(withoutDigest))
    .digest("hex");
  return { ...withoutDigest, evidenceDigest };
}
