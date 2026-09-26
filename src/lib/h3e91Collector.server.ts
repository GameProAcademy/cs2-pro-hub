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
import { H3E91_APPROVED_WORKFLOW_SHA } from "@/lib/h3e91WorkflowRegistry";
import { H3E9_EXPECTED_ENDPOINT } from "@/lib/h3e9FinalExecutionReadiness";
import { H3E91_RAILWAY_SOURCE_COMMIT } from "@/lib/h3e91LiveEvidence";
import { getH3E91Freshness } from "@/lib/h3e91LiveEvidence";
import { PARSER_ATTESTATION_EXPECTED } from "@/lib/parserAttestation";
import { inspectH3E91ExecutionSurfaces } from "@/lib/h3e91ExecutionSurfaces.server";

function getH3E91EvidenceBlockers(
  external: H3E91ExternalEvidence,
  db: H3E91DatabaseEvidence,
  freshness: "FRESH" | "STALE" | "UNKNOWN",
  baselineValid: boolean,
) {
  const blockers: Array<import("@/lib/h3e9FinalExecutionReadiness").H3E9BlockerCode> = [];
  if (freshness !== "FRESH") blockers.push("H3E91_PREFLIGHT_STALE");
  if (!baselineValid) blockers.push("H3E91_BASELINE_INVALID", "H3E91_PREFLIGHT_STALE");
  const execution = db.executionEvidence;
  const coverage = inspectH3E91ExecutionSurfaces();
  if (coverage.uncoveredSurfaceCount > 0 || coverage.unexpectedWriterCount > 0)
    blockers.push("H3E91_EXECUTION_SURFACE_NOT_COVERED");
  if (coverage.unknownSurfaceCount > 0) blockers.push("H3E91_EXECUTION_SURFACE_UNKNOWN");
  if (
    !execution ||
    execution.writerCoverageVerified !== true ||
    execution.ledgerAuthority !== "AUTHORITATIVE"
  ) {
    blockers.push("H3E91_EXECUTION_LEDGER_UNKNOWN");
    if (execution?.ledgerType === "APPEND_ONLY_PREPARED")
      blockers.push("H3E91_EXECUTION_LEDGER_MUTABLE_ONLY");
  }
  if (execution?.securityVerified === false)
    blockers.push("H3E91_EXECUTION_LEDGER_SECURITY_FAILED");
  if ((execution?.afterBaselineCount ?? 0) > 0 || (db.realDemoExecutionCount ?? 0) > 0)
    blockers.push("H3E91_EXECUTION_AFTER_BASELINE");
  if ((execution?.cacheAfterBaselineCount ?? 0) > 0 || (db.cacheDemoExecutionCount ?? 0) > 0)
    blockers.push("H3E91_CACHE_EXECUTION_AFTER_BASELINE");
  if ((execution?.attempt9AfterBaselineCount ?? 0) > 0)
    blockers.push("H3E91_ATTEMPT9_AFTER_BASELINE");
  if ((execution?.attempt10PlusAfterBaselineCount ?? 0) > 0)
    blockers.push("H3E91_ATTEMPT10_PLUS_AFTER_BASELINE");
  if (
    db.status === "UNKNOWN" ||
    db.realDemoExecutionCount === null ||
    db.cacheDemoExecutionCount === null ||
    db.historicalStartedJobCount === null
  )
    blockers.push("H3E91_DATABASE_EVIDENCE_UNKNOWN");
  if (db.migration.exactMatchCount === null) blockers.push("H3E91_MIGRATION_EVIDENCE_UNKNOWN");
  if (Object.values(db.security).some((v) => v === null))
    blockers.push("H3E91_SECURITY_EVIDENCE_UNKNOWN");
  if (Object.values(db.security).some((v) => v === false))
    blockers.push("H3E9_DATABASE_SECURITY_INVARIANT_FAILED");
  if (
    external.workflowIdentity.collectorWorkflowSha !== H3E91_APPROVED_WORKFLOW_SHA ||
    external.workflowEvidence.collectorWorkflowSha.value !== H3E91_APPROVED_WORKFLOW_SHA ||
    external.workflowEvidence.collectorWorkflowSha.status !== "PASS"
  )
    blockers.push("H3E9_WORKFLOW_NOT_APPROVED");
  if (Object.values(external.runtimeEvidence).some((v) => v.status !== "PASS" || v.value !== true))
    blockers.push("H3E91_RUNTIME_EVIDENCE_UNKNOWN");
  if (
    Object.values(external.railwayEvidence).some(
      (v) => v.status !== "PASS" || v.value === false || v.value === null,
    )
  )
    blockers.push("H3E91_RAILWAY_EVIDENCE_UNKNOWN");
  if (
    Object.values(external.workflowEvidence).some(
      (v) => v.status !== "PASS" || v.value === false || v.value === null,
    )
  )
    blockers.push("H3E9_WORKFLOW_SOURCE_MISMATCH");
  if (
    external.transportEvidence.noNegativePostSideEffect.value !== true ||
    external.transportEvidence.anonymousStatus.value !== 401 ||
    Object.values(external.transportEvidence).some((v) => v.status !== "PASS") ||
    external.transportEvidence.preNegativeProvenanceCount.value !==
      external.transportEvidence.postNegativeProvenanceCount.value ||
    external.transportEvidence.preNegativeNonceCount.value !==
      external.transportEvidence.postNegativeNonceCount.value
  )
    blockers.push("H3E9_ANONYMOUS_BOUNDARY_FAILED");
  return [...new Set(blockers)];
}

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
    historicalStartedJobCount: null,
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
  baselineStartedAt?: string,
): Promise<H3E91DatabaseEvidence> {
  const evidence = unknownDatabaseEvidence(observedAt);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("h3e91_live_database_evidence");
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return evidence;
    const value = data as Record<string, unknown>;
    for (const key of [
      "provenanceCount",
      "verifiedProvenanceCount",
      "nonceCount",
      "attempt9Count",
      "attempt10PlusCount",
    ] as const) {
      const count = value[key];
      if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0)
        evidence[key] = count;
    }
    const canonical = value["canonical"];
    if (canonical && typeof canonical === "object" && !Array.isArray(canonical)) {
      for (const key of Object.keys(evidence.canonical) as Array<
        keyof H3E91DatabaseEvidence["canonical"]
      >) {
        const count = (canonical as Record<string, unknown>)[key];
        if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0)
          evidence.canonical[key] = count;
      }
    }
    const exactMigration = value["migrationExactMatchCount"];
    if (
      typeof exactMigration === "number" &&
      Number.isSafeInteger(exactMigration) &&
      exactMigration >= 0
    )
      evidence.migration = {
        version: H3E91_EXPECTED_MIGRATION.version,
        name: H3E91_EXPECTED_MIGRATION.name,
        exactMatchCount: exactMigration,
      };
    const security = value["security"];
    if (security && typeof security === "object" && !Array.isArray(security)) {
      for (const key of Object.keys(evidence.security) as Array<
        keyof H3E91DatabaseEvidence["security"]
      >) {
        const observed = (security as Record<string, unknown>)[key];
        if (typeof observed === "boolean") evidence.security[key] = observed;
      }
    }
    if (baselineStartedAt) {
      const { data: sealedLedger, error: sealedError } = await supabaseAdmin.rpc(
        "h3e91_authoritative_execution_evidence",
        { _baseline_started_at: baselineStartedAt },
      );
      if (
        !sealedError &&
        sealedLedger &&
        typeof sealedLedger === "object" &&
        !Array.isArray(sealedLedger)
      ) {
        const item = sealedLedger as Record<string, unknown>;
        const numberOrNull = (key: string): number | null =>
          typeof item[key] === "number" &&
          Number.isSafeInteger(item[key]) &&
          (item[key] as number) >= 0
            ? (item[key] as number)
            : null;
        evidence.executionEvidence = {
          ledgerType: typeof item["ledgerType"] === "string" ? item["ledgerType"] : null,
          ledgerAuthority:
            typeof item["ledgerAuthority"] === "string" ? item["ledgerAuthority"] : null,
          baselineStartedAt,
          historicalCount: numberOrNull("historicalCount"),
          spanningBaselineCount: numberOrNull("spanningBaselineCount"),
          afterBaselineCount: numberOrNull("afterBaselineCount"),
          cacheAfterBaselineCount: numberOrNull("cacheAfterBaselineCount"),
          attempt9AfterBaselineCount: numberOrNull("attempt9AfterBaselineCount"),
          attempt10PlusAfterBaselineCount: numberOrNull("attempt10PlusAfterBaselineCount"),
          writerCoverageVerified: item["writerCoverageVerified"] === true,
          securityVerified:
            item["rlsEnabled"] === true &&
            item["noClientPrivileges"] === true &&
            item["serviceReadOnly"] === true &&
            item["mutationTriggerPresent"] === true &&
            item["rpcServiceRoleOnly"] === true,
        };
      }
      const { data: ledger, error: ledgerError } = await supabaseAdmin.rpc(
        "h3e91_execution_ledger_after_baseline",
        { _baseline_started_at: baselineStartedAt },
      );
      if (!ledgerError && ledger && typeof ledger === "object" && !Array.isArray(ledger)) {
        const entries = ledger as Record<string, unknown>;
        const mapping = {
          historicalStartedJobCount: "historicalStartedJobCount",
          realDemoExecutionCount: "realDemoExecutionCountAfterBaseline",
          cacheDemoExecutionCount: "cacheDemoExecutionCountAfterBaseline",
        } as const;
        if (
          entries["baselineValid"] === true &&
          entries["startedAtMissingCount"] === 0 &&
          entries["invalidTimestampsCount"] === 0
        ) {
          for (const [target, source] of Object.entries(mapping) as Array<
            [keyof typeof mapping, string]
          >) {
            const count = entries[source];
            if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0)
              evidence[target] = count;
          }
          // A mutable job row is a positive signal but cannot prove the absence
          // of starts: retry/reset or deletion may erase the only timestamp.
          if (evidence.realDemoExecutionCount === 0) evidence.realDemoExecutionCount = null;
          if (evidence.cacheDemoExecutionCount === 0) evidence.cacheDemoExecutionCount = null;
          const attempt9 = entries["attempt9CountAfterBaseline"];
          const attempt10 = entries["attempt10PlusCountAfterBaseline"];
          // All-time attempts from the primary RPC still gate the historical lock.
          if (
            typeof attempt9 !== "number" ||
            !Number.isSafeInteger(attempt9) ||
            attempt9 < 0 ||
            typeof attempt10 !== "number" ||
            !Number.isSafeInteger(attempt10) ||
            attempt10 < 0
          ) {
            evidence.realDemoExecutionCount = null;
            evidence.cacheDemoExecutionCount = null;
          } else if (attempt9 > 0 || attempt10 > 0) {
            evidence.status = "BLOCKED";
          }
        }
      }
    }
    const countsKnown = [
      evidence.provenanceCount,
      evidence.verifiedProvenanceCount,
      evidence.nonceCount,
      evidence.attempt9Count,
      evidence.attempt10PlusCount,
      ...Object.values(evidence.canonical),
      evidence.realDemoExecutionCount,
      evidence.cacheDemoExecutionCount,
      evidence.historicalStartedJobCount,
    ].every((value) => typeof value === "number");
    const securityKnown = Object.values(evidence.security).every(
      (value) => typeof value === "boolean",
    );
    // Job starts are positive signals, not immutable proof that no work occurred.
    // Missing and zero counts stay UNKNOWN until an authoritative ledger exists.
    evidence.status =
      countsKnown && securityKnown && evidence.migration.exactMatchCount !== null
        ? evidence.migration.exactMatchCount === 1 &&
          Object.values(evidence.security).every(Boolean) &&
          evidence.provenanceCount === 0 &&
          evidence.nonceCount === 0 &&
          evidence.attempt9Count === 0 &&
          evidence.attempt10PlusCount === 0 &&
          evidence.realDemoExecutionCount === 0 &&
          evidence.cacheDemoExecutionCount === 0
          ? "PASS"
          : "BLOCKED"
        : "UNKNOWN";
    if (
      !evidence.executionEvidence ||
      evidence.executionEvidence.writerCoverageVerified !== true ||
      evidence.executionEvidence.ledgerAuthority !== "AUTHORITATIVE"
    )
      evidence.status = "UNKNOWN";
    return evidence;
  } catch {
    return evidence;
  }
}

export async function buildH3E91Artifact(external: H3E91ExternalEvidence): Promise<H3E91Artifact> {
  const baselineStartedAt = new Date().toISOString();
  const before = await collectH3E91DatabaseEvidence(new Date().toISOString(), baselineStartedAt);
  let status: number | null = null;
  try {
    const response = await fetch(H3E9_EXPECTED_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    status = response.status;
  } catch {
    /* Unavailable remains UNKNOWN. */
  }
  const after = await collectH3E91DatabaseEvidence(new Date().toISOString(), baselineStartedAt);
  const safe = <T>(value: T, source: string, valid: boolean) => ({
    source,
    observedAt: new Date().toISOString(),
    classification: "SAFE_NON_SECRET" as const,
    status: (valid ? "PASS" : value === null ? "UNKNOWN" : "BLOCKED") as
      "PASS" | "UNKNOWN" | "BLOCKED",
    value,
  });
  const noSideEffect =
    before.provenanceCount !== null &&
    before.nonceCount !== null &&
    after.provenanceCount !== null &&
    after.nonceCount !== null
      ? before.provenanceCount === after.provenanceCount && before.nonceCount === after.nonceCount
      : null;
  const trusted = {
    ...external,
    transportEvidence: {
      ...external.transportEvidence,
      anonymousStatus: safe(status, "TRUSTED_SERVER_NEGATIVE_POST", status === 401),
      preNegativeProvenanceCount: safe(
        before.provenanceCount,
        "TRUSTED_SERVER_DATABASE_PRE",
        before.provenanceCount !== null,
      ),
      postNegativeProvenanceCount: safe(
        after.provenanceCount,
        "TRUSTED_SERVER_DATABASE_POST",
        after.provenanceCount !== null,
      ),
      preNegativeNonceCount: safe(
        before.nonceCount,
        "TRUSTED_SERVER_DATABASE_PRE",
        before.nonceCount !== null,
      ),
      postNegativeNonceCount: safe(
        after.nonceCount,
        "TRUSTED_SERVER_DATABASE_POST",
        after.nonceCount !== null,
      ),
      noNegativePostSideEffect: safe(
        noSideEffect,
        "TRUSTED_SERVER_DATABASE_COMPARISON",
        noSideEffect === true,
      ),
    },
  };
  return finalizeH3E91Artifact(trusted, after, baselineStartedAt);
}

export function finalizeH3E91Artifact(
  external: H3E91ExternalEvidence,
  databaseEvidence: H3E91DatabaseEvidence,
  baselineStartedAt: string = external.observedAt,
  evaluatedAt: string = new Date().toISOString(),
): H3E91Artifact {
  const input = buildH3E91ReadinessInput(external, databaseEvidence);
  const finalResult = evaluateH3E9FinalExecutionReadiness(input);
  const freshness = getH3E91Freshness(external.observedAt, evaluatedAt);
  const baselineValid =
    getH3E91Freshness(baselineStartedAt, evaluatedAt) === "FRESH" &&
    Date.parse(baselineStartedAt) >= Date.parse(external.observedAt);
  const blockers = getH3E91EvidenceBlockers(external, databaseEvidence, freshness, baselineValid);
  const withoutDigest = {
    schemaVersion: H3E91_LIVE_EVIDENCE_SCHEMA_VERSION,
    gate: "H.3-E.9" as const,
    collectorVersion: H3E91_COLLECTOR_VERSION,
    observedAt: external.observedAt,
    baselineStartedAt,
    baseline: {
      startedAt: baselineStartedAt,
      source: "SERVER_READ_ONLY_PREFLIGHT_BASELINE" as const,
      semantics: "COUNT_EXECUTION_STARTED_AFTER_BASELINE_ONLY" as const,
    },
    freshness,
    parserRuntimeRevision: `git:${PARSER_ATTESTATION_EXPECTED.commit}`,
    workflowIdentity: external.workflowIdentity,
    collectorWorkflowSha: external.workflowIdentity.collectorWorkflowSha,
    collectorTriggerCommitSha: external.workflowIdentity.collectorTriggerCommitSha,
    attestationWorkflowSourceSha: external.workflowEvidence.actualBlobSha.value,
    railwayDeploymentCommit: H3E91_RAILWAY_SOURCE_COMMIT,
    databaseEvidence,
    executionEvidence: databaseEvidence.executionEvidence ?? {
      ledgerType: null,
      ledgerAuthority: null,
      baselineStartedAt,
      historicalCount: null,
      spanningBaselineCount: null,
      afterBaselineCount: null,
      cacheAfterBaselineCount: null,
      attempt9AfterBaselineCount: null,
      attempt10PlusAfterBaselineCount: null,
      writerCoverageVerified: null,
      securityVerified: null,
    },
    executionSurfaceCoverage: inspectH3E91ExecutionSurfaces(),
    securityEvidence: databaseEvidence.security,
    runtimeEvidence: external.runtimeEvidence,
    railwayEvidence: external.railwayEvidence,
    transportEvidence: external.transportEvidence,
    secretPresence: external.secretPresence,
    authorizationEvidence: { retention: input.retention, operator: input.operatorAuthorization },
    executionLocks: {
      ...input.execution,
      attempt10PlusCount: databaseEvidence.attempt10PlusCount,
      realDemoExecutionCount: databaseEvidence.realDemoExecutionCount,
      cacheDemoExecutionCount: databaseEvidence.cacheDemoExecutionCount,
      historicalStartedJobCount: databaseEvidence.historicalStartedJobCount,
    },
    finalResult: {
      ...finalResult,
      blockers: [...new Set([...finalResult.blockers, ...blockers])],
      technicalReadiness: blockers.length ? ("BLOCKED" as const) : finalResult.technicalReadiness,
      status: blockers.length ? ("BLOCKED" as const) : finalResult.status,
    },
  };
  // Recompute the diagnostic status from the exact blocker set, not a client claim.
  const evidenceDigest = createHash("sha256")
    .update(canonicalAttestationJson(withoutDigest))
    .digest("hex");
  return { ...withoutDigest, evidenceDigest };
}
