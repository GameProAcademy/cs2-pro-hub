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
  storageDeletedAt: string | null;
  queuedAt: string;
  finishedAt: string | null;
}

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
        "id, upload_id, user_id, status, stage, error_code, retry_count, max_retries, duration_ms, parser_version, schema_version, extraction_confidence, partial_parse, rounds_detected, rounds_valid, identity_status, storage_deleted_at, queued_at, finished_at, uploads(file_name)",
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

    const { error: auditError } = await (context as Ctx).supabase
      .from("admin_audit_logs")
      .insert({
        admin_user_id: (context as Ctx).userId,
        action: "DEMO_JOB_RETRIED",
        target_user_id: null,
        metadata: { job_id: data.jobId },
      });
    if (auditError) throw new Error("AUDIT_FAILED");

    // Re-queue only: the worker/cron layer performs the processing.
    return { status: "queued" as const, errorCode: null };
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
