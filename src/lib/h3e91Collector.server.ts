import { createHash } from "node:crypto";

import type { H3E91Artifact, H3E91DatabaseEvidence, H3E91ExternalEvidence } from "@/lib/h3e91LiveEvidence";
import { H3E91_COLLECTOR_VERSION, H3E91_EXPECTED_MIGRATION, H3E91_LIVE_EVIDENCE_SCHEMA_VERSION, buildH3E91ReadinessInput } from "@/lib/h3e91LiveEvidence";
import { evaluateH3E9FinalExecutionReadiness } from "@/lib/h3e9FinalExecutionReadiness";
import { canonicalAttestationJson } from "@/lib/parserAttestationCrypto.server";

function unknownDatabaseEvidence(observedAt: string): H3E91DatabaseEvidence {
  return {
    source: "LIVE_DATABASE_READ_ONLY", observedAt, status: "UNKNOWN",
    provenanceCount: null, nonceCount: null, attempt9Count: null,
    canonical: { total: null, authorized: null, verified: null, generic: null },
    migration: { version: null, name: null, exactMatchCount: null },
    security: { rlsEnabled: null, clientPrivilegesZero: null, recorderServiceRoleOnly: null, hmacBridgeServiceRoleOnly: null, securityDefiner: null, emptySearchPath: null, approvedPinsPresent: null, transactionLocalHmacBridge: null, noClientExecutableBypass: null },
  };
}

export async function collectH3E91DatabaseEvidence(observedAt: string): Promise<H3E91DatabaseEvidence> {
  const evidence = unknownDatabaseEvidence(observedAt);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [provenance, nonces, attempts, canonical, gate] = await Promise.all([
      supabaseAdmin.from("parser_runtime_provenance").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("parser_attestation_nonces").select("nonce", { count: "exact", head: true }),
      supabaseAdmin.from("demo_jobs").select("id", { count: "exact", head: true }).gte("attempt_number", 9),
      supabaseAdmin.from("canonical_mapping_inventory").select("canonical_authorization,parity_status,determinism_status,evidence_class"),
      supabaseAdmin.rpc("pre_real_demo_gate_status"),
    ]);
    if (provenance.error || nonces.error || attempts.error || canonical.error) return evidence;
    const rows = canonical.data ?? [];
    evidence.provenanceCount = provenance.count ?? null;
    evidence.nonceCount = nonces.count ?? null;
    evidence.attempt9Count = attempts.count ?? null;
    evidence.canonical = {
      total: rows.length,
      authorized: rows.filter((row) => row.canonical_authorization).length,
      verified: rows.filter((row) => row.parity_status === "VERIFIED" && row.determinism_status === "VERIFIED").length,
      generic: rows.filter((row) => ["generic", "unknown", "*", "all"].includes(row.evidence_class.toLowerCase())).length,
    };
    // PostgREST does not expose pg_catalog or supabase_migrations. Existing gate
    // output may safely attest security/history only when the database publishes
    // explicit booleans; otherwise these stay UNKNOWN and the evaluator blocks.
    if (!gate.error && gate.data && typeof gate.data === "object" && !Array.isArray(gate.data)) {
      const value = gate.data as Record<string, unknown>;
      const exactMigration = value["h3e8_migration_exact_match_count"];
      if (typeof exactMigration === "number") {
        evidence.migration = { version: H3E91_EXPECTED_MIGRATION.version, name: H3E91_EXPECTED_MIGRATION.name, exactMatchCount: exactMigration };
      }
      for (const key of Object.keys(evidence.security) as Array<keyof H3E91DatabaseEvidence["security"]>) {
        const observed = value[`h3e91_${key}`];
        if (typeof observed === "boolean") evidence.security[key] = observed;
      }
    }
    const countsKnown = [evidence.provenanceCount, evidence.nonceCount, evidence.attempt9Count, evidence.canonical.total].every((value) => typeof value === "number");
    const securityKnown = Object.values(evidence.security).every((value) => typeof value === "boolean");
    evidence.status = countsKnown && securityKnown && evidence.migration.exactMatchCount === 1 ? "PASS" : "UNKNOWN";
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
    sourceCommit: external.workflowIdentity.sourceCommit,
    workflowSourceSha: external.workflowEvidence.actualBlobSha.value,
    databaseEvidence,
    securityEvidence: databaseEvidence.security,
    runtimeEvidence: external.runtimeEvidence,
    railwayEvidence: external.railwayEvidence,
    transportEvidence: external.transportEvidence,
    secretPresence: external.secretPresence,
    authorizationEvidence: { retention: input.retention, operator: input.operatorAuthorization },
    executionLocks: input.execution,
    finalResult,
  };
  const evidenceDigest = createHash("sha256").update(canonicalAttestationJson(withoutDigest)).digest("hex");
  return { ...withoutDigest, evidenceDigest };
}
