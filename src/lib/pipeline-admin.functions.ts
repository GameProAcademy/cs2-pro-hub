/**
 * Master-admin observability for the demo pipeline.
 *
 * Authorisation is re-verified server-side (active profile + authoritative
 * `is_admin_master`) exactly like the rest of the admin area. Fail-closed.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

const FORBIDDEN = "ADMIN_FORBIDDEN";
const UNAVAILABLE = "ADMIN_UNAVAILABLE";

async function requireMaster(context: Ctx) {
  const { supabase, userId } = context;
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(UNAVAILABLE);
  if (!profile || profile.status !== "active") throw new Error(FORBIDDEN);

  const { data: master, error: roleError } = await supabase.rpc("is_admin_master", {
    _user_id: userId,
  });
  if (roleError) throw new Error(UNAVAILABLE);
  if (master !== true) throw new Error(FORBIDDEN);
}

export interface AdminDemoJob {
  id: string;
  uploadId: string;
  userId: string;
  fileName: string;
  status: string;
  stage: string;
  errorCode: string | null;
  retryCount: number;
  maxRetries: number;
  durationMs: number | null;
  parserVersion: string | null;
  schemaVersion: number;
  extractionConfidence: number | null;
  partialParse: boolean;
  roundsDetected: number | null;
  roundsValid: number | null;
  identityStatus: string;
  attachmentMethod: string | null;
  attachmentSource: string | null;
  attachmentConfidence: string | null;
  attachmentConfirmationStatus: string;
  storageDeletedAt: string | null;
  queuedAt: string;
  finishedAt: string | null;
}

export interface AdminRawAuditForensics {
  jobId: string;
  artifactId: string;
  manifestStoragePath: string;
  auditStatus: string;
  auditEvidenceDigest: string;
  contractVersion: number;
  parser: Record<string, unknown>;
  rawBlockReasons: string[];
  gates: Array<{ gate: string; status: string; reasons: string[] }>;
  eventCoverage: Array<Record<string, unknown>>;
  unmapped: Array<{
    rawField: string;
    appField: string | null;
    canonicalField: string | null;
    status: string;
    reason: string | null;
  }>;
  mappingInventory: Array<{
    rawField: string;
    appField: string | null;
    canonicalField: string | null;
    status: string;
    reason: string | null;
  }>;
  forensicInventory: Record<string, unknown>;
}

export const getAdminRawAuditForensics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AdminRawAuditForensics> => {
    await requireMaster(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: artifact, error: artifactError } = await supabaseAdmin
      .from("raw_evidence_artifacts")
      .select("id, job_id, upload_id, attempt_number, demo_sha256, root_digest, manifest_storage_path, status, raw_status, audit_status")
      .eq("job_id", data.jobId)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (artifactError || !artifact) throw new Error(UNAVAILABLE);
    if (artifact.status !== "ready" || artifact.raw_status !== "ready") throw new Error(UNAVAILABLE);

    const { data: blob, error: blobError } = await supabaseAdmin.storage
      .from("cs2-raw-evidence")
      .download(artifact.manifest_storage_path);
    if (blobError || !blob) throw new Error(UNAVAILABLE);

    let manifest: Record<string, unknown>;
    try {
      const parsed = JSON.parse(await blob.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid manifest");
      manifest = parsed as Record<string, unknown>;
    } catch {
      throw new Error(UNAVAILABLE);
    }

    const { deriveRawArtifactAuditStatus, rawArtifactSha256, stableRawArtifactJson } =
      await import("@/lib/pipeline/rawArtifactContract");
    const auditEvidence = manifest["audit_evidence"];
    const auditEvidenceDigest = manifest["audit_evidence_digest"];
    if (
      !auditEvidence || typeof auditEvidence !== "object" || Array.isArray(auditEvidence) ||
      typeof auditEvidenceDigest !== "string" ||
      rawArtifactSha256(stableRawArtifactJson(auditEvidence)) !== auditEvidenceDigest
    ) {
      throw new Error(UNAVAILABLE);
    }

    const evidence = auditEvidence as Record<string, unknown>;
    if (
      manifest["job_id"] !== artifact.job_id ||
      manifest["upload_id"] !== artifact.upload_id ||
      manifest["attempt_number"] !== artifact.attempt_number ||
      manifest["demo_sha256"] !== artifact.demo_sha256 ||
      manifest["root_digest"] !== artifact.root_digest
    ) {
      throw new Error(UNAVAILABLE);
    }
    const rawBlockReasons = Array.isArray(evidence["raw_block_reasons"])
      ? evidence["raw_block_reasons"].filter((v): v is string => typeof v === "string")
      : [];
    const topLevelReasons = Array.isArray(manifest["raw_block_reasons"])
      ? manifest["raw_block_reasons"].filter((v): v is string => typeof v === "string")
      : [];
    if (stableRawArtifactJson(rawBlockReasons) !== stableRawArtifactJson(topLevelReasons)) {
      throw new Error(UNAVAILABLE);
    }
    const gates = Array.isArray(evidence["gates"])
      ? evidence["gates"].filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)).map((v) => ({
          gate: typeof v["gate"] === "string" ? v["gate"] : "unknown",
          status: typeof v["status"] === "string" ? v["status"] : "unknown",
          reasons: Array.isArray(v["reasons"]) ? v["reasons"].filter((r): r is string => typeof r === "string") : [],
        }))
      : [];
    const mappingInventory = Array.isArray(evidence["field_mappings"])
      ? evidence["field_mappings"].filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)).map((v) => ({
          rawField: typeof v["raw_field"] === "string" ? v["raw_field"] : "",
          appField: typeof v["app_field"] === "string" ? v["app_field"] : null,
          canonicalField: typeof v["canonical_field"] === "string" ? v["canonical_field"] : null,
          status: typeof v["status"] === "string" ? v["status"] : "unknown",
          reason: typeof v["reason"] === "string" ? v["reason"] : null,
        }))
      : [];
    const derivedAuditStatus = deriveRawArtifactAuditStatus(manifest);
    if (artifact.audit_status !== derivedAuditStatus) throw new Error(UNAVAILABLE);
    return {
      jobId: artifact.job_id,
      artifactId: artifact.id,
      manifestStoragePath: artifact.manifest_storage_path,
      auditStatus: derivedAuditStatus,
      auditEvidenceDigest,
      contractVersion: typeof manifest["contract_version"] === "number" ? manifest["contract_version"] : 0,
      parser:
        manifest["parser"] && typeof manifest["parser"] === "object" && !Array.isArray(manifest["parser"])
          ? manifest["parser"] as Record<string, unknown>
          : {},
      rawBlockReasons,
      gates,
      eventCoverage: Array.isArray(evidence["event_coverage"])
        ? evidence["event_coverage"].filter(
            (v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v),
          )
        : [],
      unmapped: mappingInventory.filter((item) => item.status === "UNMAPPED_BUT_AVAILABLE"),
      mappingInventory,
      forensicInventory:
        evidence["forensic_inventory"] && typeof evidence["forensic_inventory"] === "object" && !Array.isArray(evidence["forensic_inventory"])
          ? evidence["forensic_inventory"] as Record<string, unknown>
          : {},
    };
  });

export interface AdminPipelineOverview {
  parserAvailable: boolean;
  adapter: string;
  counts: { pending: number; processing: number; processed: number; failed: number };
  jobs: AdminDemoJob[];
}

export const getAdminPipelineOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminPipelineOverview> => {
    await requireMaster(context as Ctx);
    const { supabase } = context as Ctx;

    const statuses = ["pending", "processing", "processed", "failed"] as const;
    const counts = { pending: 0, processing: 0, processed: 0, failed: 0 };
    await Promise.all(
      statuses.map(async (status) => {
        const { count } = await supabase
          .from("demo_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        counts[status] = count ?? 0;
      }),
    );

    const { data } = await supabase
      .from("demo_jobs")
      .select(
        "id, upload_id, user_id, status, stage, error_code, retry_count, max_retries, duration_ms, parser_version, schema_version, extraction_confidence, partial_parse, rounds_detected, rounds_valid, identity_status, attachment_method, attachment_source, attachment_confidence_label, attachment_confirmation_status, storage_deleted_at, queued_at, finished_at, uploads(file_name)",
      )
      .order("queued_at", { ascending: false })
      .limit(50);

    const { resolveParserAdapter } = await import("@/lib/pipeline/parser/remoteParser.server");
    const adapter = resolveParserAdapter();

    return {
      parserAvailable: adapter.isAvailable(),
      adapter: adapter.id,
      counts,
      jobs: (data ?? []).map((row) => ({
        id: row.id,
        uploadId: row.upload_id,
        userId: row.user_id,
        fileName: row.uploads?.file_name ?? "",
        status: row.status,
        stage: row.stage,
        errorCode: row.error_code,
        retryCount: row.retry_count,
        maxRetries: row.max_retries,
        durationMs: row.duration_ms,
        parserVersion: row.parser_version,
        schemaVersion: row.schema_version,
        extractionConfidence: row.extraction_confidence,
        partialParse: row.partial_parse,
        roundsDetected: row.rounds_detected,
        roundsValid: row.rounds_valid,
        identityStatus: row.identity_status,
        attachmentMethod: row.attachment_method,
        attachmentSource: row.attachment_source,
        attachmentConfidence: row.attachment_confidence_label,
        attachmentConfirmationStatus: row.attachment_confirmation_status,
        storageDeletedAt: row.storage_deleted_at,
        queuedAt: row.queued_at,
        finishedAt: row.finished_at,
      })),
    };
  });

/** Master-triggered reprocessing of a single job. */
export const adminRetryDemoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireMaster(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("demo_jobs")
      .update({
        status: "pending",
        stage: "queued",
        error_code: null,
        error_message: null,
        started_at: null,
        finished_at: null,
      })
      .eq("id", data.jobId);

    const { error: auditError } = await (context as Ctx).supabase.from("admin_audit_logs").insert({
      admin_user_id: (context as Ctx).userId,
      action: "DEMO_JOB_RETRIED",
      target_user_id: null,
      metadata: { job_id: data.jobId },
    });
    if (auditError) throw new Error("AUDIT_FAILED");

    // Re-queue only: the worker/cron layer performs the processing.
    return { status: "queued" as const, errorCode: null };
  });

/**
 * FASE 2.7.2 GATE 1E — parser worker diagnostic (`/health` + `/version`).
 *
 * Master-only, never on the parse hot path, never returns the token or the
 * private endpoint URL beyond its origin.
 */
export const getAdminParserWorkerStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireMaster(context as Ctx);
    const { probeParserWorker } = await import("@/lib/pipeline/parser/remoteParser.server");
    const { PARSER_CONTRACT_VERSION } = await import("@/config/pipeline");
    const probe = await probeParserWorker();
    return { ...probe, appContractVersion: PARSER_CONTRACT_VERSION };
  });

/** Master-triggered retention cleanup of expired temporary demo files. */
export const adminCleanupDemos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireMaster(context as Ctx);
    const { cleanupExpiredDemos, recoverStaleJobs } = await import("@/lib/pipeline/jobs.server");
    const recovered = await recoverStaleJobs();
    const deleted = await cleanupExpiredDemos(50);
    return { recovered, deleted };
  });
