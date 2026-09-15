/**
 * Client-facing pipeline server functions.
 *
 * The browser NEVER parses a demo and never touches the service role. It only:
 *  1. requests an upload slot (`createDemoUpload`);
 *  2. uploads the .dem straight into the private bucket with its own session;
 *  3. enqueues the job (`enqueueDemoJob`);
 *  4. polls the job status (`getDemoJobStatus` / `listMyDemoJobs`).
 *
 * The actual parse runs server-side through the parser adapter.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { DEMO_BUCKET, MAX_DEMO_SIZE_BYTES, MIN_DEMO_SIZE_BYTES } from "@/config/pipeline";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DemoJobView {
  jobId: string;
  uploadId: string;
  fileName: string;
  status:
    | "pending"
    | "processing"
    | "processed"
    | "failed"
    | "cancel_requested"
    | "cancelled"
    | "blocked_raw_audit";
  stage: string;
  errorCode: string | null;
  retryCount: number;
  maxRetries: number;
  matchId: string | null;
  extractionConfidence: number | null;
  partialParse: boolean;
  roundsValid: number | null;
  /** FASE 2.7.2A: whether the canonical match got this player's projection. */
  attachmentState: "attached" | "unattached" | "conflict";
  attachmentReason: string | null;
  map: string | null;
  result: string | null;
  scorePlayer: number | null;
  scoreOpponent: number | null;
  queuedAt: string;
  finishedAt: string | null;
  attemptNumber: number;
  supersedesJobId: string | null;
  supersededByJobId: string | null;
  replacementReason: ReplacementReason;
}

export type ReplacementReason = "stale" | "failed" | "cancelled" | "legacy_unvalidated" | null;

const createSchema = z.object({
  fileName: z
    .string()
    .min(5)
    .max(255)
    .refine((value) => value.toLowerCase().endsWith(".dem"), "INVALID_DEMO_FORMAT"),
  fileSize: z.number().int().min(MIN_DEMO_SIZE_BYTES).max(MAX_DEMO_SIZE_BYTES),
  demoSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Status of a demo that was already submitted with the same content hash. */
export type DuplicateStatus = "processed" | "pending" | "failed" | "cancelled" | null;

/**
 * Registers the upload row and returns the private storage path.
 *
 * The row is inserted ALREADY containing the deterministic `storage_path`
 * (`{user_id}/{upload_id}.dem`): the player has no UPDATE privilege on
 * `uploads`, so nothing may depend on a later client-side update. Every
 * administrative/technical column (status, parser, schema, analysis, timestamps,
 * error codes) is set by the backend only and never accepted from the browser.
 */
export const createDemoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const uploadId = crypto.randomUUID();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reserved, error } = await supabaseAdmin.rpc("reserve_demo_upload", {
      _user_id: userId,
      _upload_id: uploadId,
      _file_name: data.fileName,
      _file_size: data.fileSize,
      _demo_sha256: data.demoSha256,
    });
    if (error || !reserved || typeof reserved !== "object" || Array.isArray(reserved)) {
      throw new Error("UPLOAD_REGISTRATION_FAILED");
    }

    const result = reserved as Record<string, unknown>;
    const reservedUploadId = typeof result["upload_id"] === "string" ? result["upload_id"] : null;
    const storagePath = typeof result["storage_path"] === "string" ? result["storage_path"] : null;
    if (!reservedUploadId || !storagePath || !storagePath.startsWith(`${userId}/`)) {
      throw new Error("UPLOAD_REGISTRATION_FAILED");
    }
    const duplicate = result["duplicate"] === true;
    const rawStatus = result["duplicate_status"];
    const duplicateStatus: DuplicateStatus =
      rawStatus === "processed" ||
      rawStatus === "failed" ||
      rawStatus === "pending" ||
      rawStatus === "cancelled"
        ? rawStatus
        : null;

    return {
      uploadId: reservedUploadId,
      storagePath,
      bucket: DEMO_BUCKET,
      duplicate,
      duplicateStatus,
      existingJobId: typeof result["job_id"] === "string" ? result["job_id"] : null,
      newAttempt: result["new_attempt"] === true,
      attemptNumber: typeof result["attempt_number"] === "number" ? result["attempt_number"] : 1,
      supersedesJobId:
        typeof result["supersedes_job_id"] === "string" ? result["supersedes_job_id"] : null,
      replacementReason:
        result["replacement_reason"] === "stale" ||
        result["replacement_reason"] === "failed" ||
        result["replacement_reason"] === "cancelled" ||
        result["replacement_reason"] === "legacy_unvalidated"
          ? result["replacement_reason"]
          : null,
    };
  });

/**
 * Queues the job after the file landed in storage and returns immediately.
 *
 * NOTHING is parsed inside this request: the worker/cron layer claims and
 * processes the job later, and the UI polls the job status.
 */
export const enqueueDemoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ uploadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: upload } = await supabase
      .from("uploads")
      .select("id, user_id, status, file_size, demo_sha256, storage_path")
      .eq("id", data.uploadId)
      .maybeSingle();
    if (!upload || upload.user_id !== userId) throw new Error("UPLOAD_NOT_FOUND");
    if (!upload.storage_path || !upload.storage_path.startsWith(`${userId}/`)) {
      throw new Error("UPLOAD_NOT_FOUND");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Existing jobs are resolved transactionally by the RPC. Do not require a
    // temporary object that may already have expired after successful processing.
    const { data: existingJob } = await supabaseAdmin
      .from("demo_jobs")
      .select("id")
      .eq("upload_id", upload.id)
      .maybeSingle();

    // The file must really be in the private bucket before a job is queued.
    if (!existingJob) {
      const { demoExists } = await import("@/lib/pipeline/storage.server");
      const stored = await demoExists(upload.storage_path);
      if (!stored) throw new Error("DEMO_NOT_FOUND");
    }

    const { data: enqueued, error } = await supabaseAdmin.rpc("enqueue_demo_job", {
      _upload_id: upload.id,
      _user_id: userId,
    });
    if (error || !enqueued || typeof enqueued !== "object" || Array.isArray(enqueued)) {
      throw new Error("JOB_ENQUEUE_FAILED");
    }
    const result = enqueued as Record<string, unknown>;
    if (typeof result["job_id"] !== "string") throw new Error("JOB_ENQUEUE_FAILED");
    return {
      jobId: result["job_id"],
      queued: result["queued"] === true,
      duplicate: result["duplicate"] === true,
    };
  });

function toView(
  row: {
    id: string;
    upload_id: string;
    status: string;
    stage: string;
    error_code: string | null;
    retry_count: number;
    max_retries: number;
    match_id: string | null;
    extraction_confidence: number | null;
    partial_parse: boolean;
    rounds_valid: number | null;
    attachment_state: string;
    attachment_reason: string | null;
    queued_at: string;
    finished_at: string | null;
    attempt_number: number;
    supersedes_job_id: string | null;
    superseded_by_job_id: string | null;
    replacement_reason: string | null;
    uploads?: { file_name: string } | null;
  },
  match?: {
    map: string | null;
    result: string | null;
    score_player: number | null;
    score_opponent: number | null;
  } | null,
): DemoJobView {
  return {
    jobId: row.id,
    uploadId: row.upload_id,
    fileName: row.uploads?.file_name ?? "",
    status: row.status as DemoJobView["status"],
    stage: row.stage,
    errorCode: row.error_code,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    matchId: row.match_id,
    extractionConfidence: row.extraction_confidence,
    partialParse: row.partial_parse,
    roundsValid: row.rounds_valid,
    attachmentState:
      row.attachment_state === "attached"
        ? "attached"
        : row.attachment_state === "conflict"
          ? "conflict"
          : "unattached",
    attachmentReason: row.attachment_reason,
    map: match?.map ?? null,
    result: match?.result ?? null,
    scorePlayer: match?.score_player ?? null,
    scoreOpponent: match?.score_opponent ?? null,
    queuedAt: row.queued_at,
    finishedAt: row.finished_at,
    attemptNumber: row.attempt_number,
    supersedesJobId: row.supersedes_job_id,
    supersededByJobId: row.superseded_by_job_id,
    replacementReason:
      row.replacement_reason === "stale" ||
      row.replacement_reason === "failed" ||
      row.replacement_reason === "cancelled" ||
      row.replacement_reason === "legacy_unvalidated"
        ? row.replacement_reason
        : null,
  };
}

const JOB_COLUMNS =
  "id, upload_id, status, stage, error_code, retry_count, max_retries, match_id, extraction_confidence, partial_parse, rounds_valid, attachment_state, attachment_reason, queued_at, finished_at, attempt_number, supersedes_job_id, superseded_by_job_id, replacement_reason, uploads(file_name)";

export const getDemoJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DemoJobView | null> => {
    const { data: row } = await context.supabase
      .from("demo_jobs")
      .select(JOB_COLUMNS)
      .eq("id", data.jobId)
      .maybeSingle();
    if (!row) return null;
    const { data: match } = row.match_id
      ? await context.supabase
          .from("matches")
          .select("map, result, score_player, score_opponent")
          .eq("id", row.match_id)
          .maybeSingle()
      : { data: null };
    return toView(row, match);
  });

/** Player's own processing history. RLS scopes it to the signed-in user. */
export const listMyDemoJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DemoJobView[]> => {
    const { data, error: jobsError } = await context.supabase
      .from("demo_jobs")
      .select(JOB_COLUMNS)
      .order("queued_at", { ascending: false })
      .limit(25);
    if (jobsError) throw new Error("DEMO_HISTORY_QUERY_FAILED");
    const rows = data ?? [];
    const matchIds = [...new Set(rows.flatMap((row) => (row.match_id ? [row.match_id] : [])))];
    const { data: matches, error: matchesError } = matchIds.length
      ? await context.supabase
          .from("matches")
          .select("id, map, result, score_player, score_opponent")
          .in("id", matchIds)
      : { data: [], error: null };
    if (matchesError) throw new Error("DEMO_HISTORY_MATCH_QUERY_FAILED");
    const matchById = new Map((matches ?? []).map((match) => [match.id, match]));
    return rows.map((row) => toView(row, row.match_id ? matchById.get(row.match_id) : null));
  });

/** Re-dispatches a transient failure within the same immutable upload attempt. */
export const retryMyDemoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase
      .from("demo_jobs")
      .select("id, status, retry_count, max_retries, storage_deleted_at, error_code")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("JOB_NOT_FOUND");
    if (job.status !== "failed") throw new Error("JOB_NOT_RETRYABLE");
    if (job.storage_deleted_at) throw new Error("DEMO_EXPIRED");
    if (job.retry_count >= job.max_retries) throw new Error("RETRY_LIMIT_REACHED");
    // FASE 2.7.2 — a permanent failure (e.g. CORRUPTED_DEMO) stays permanent:
    // re-queueing the same bytes cannot change the outcome.
    {
      const { PIPELINE_ERROR_CODES, isPermanentError } = await import("@/lib/pipeline/errors");
      const code = job.error_code as (typeof PIPELINE_ERROR_CODES)[number] | null;
      if (code && PIPELINE_ERROR_CODES.includes(code) && isPermanentError(code)) {
        throw new Error("JOB_NOT_RETRYABLE");
      }
    }

    // Retry only RE-QUEUES: the worker/cron layer picks the job up afterwards,
    // so the user never waits for the parser inside this request.
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
      .eq("id", job.id);

    return { jobId: job.id, queued: true as const };
  });

/** Persistently cancels a job owned by the signed-in player. */
export const cancelMyDemoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: owned } = await context.supabase
      .from("demo_jobs")
      .select("id, storage_path, status")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!owned) throw new Error("JOB_NOT_FOUND");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("request_demo_job_cancel", {
      _job_id: owned.id,
      _user_id: context.userId,
    });
    if (error) throw new Error("JOB_CANCEL_FAILED");

    const outcome = result as { status?: string; changed?: boolean } | null;
    if (outcome?.status === "cancelled" && owned.storage_path) {
      const { deleteDemo } = await import("@/lib/pipeline/storage.server");
      try {
        await deleteDemo(owned.storage_path);
        await supabaseAdmin
          .from("demo_jobs")
          .update({ storage_deleted_at: new Date().toISOString(), cleanup_error: null })
          .eq("id", owned.id)
          .eq("status", "cancelled");
      } catch {
        await supabaseAdmin
          .from("demo_jobs")
          .update({ cleanup_error: "STORAGE_ERROR" })
          .eq("id", owned.id)
          .eq("status", "cancelled");
      }
    }
    return {
      jobId: owned.id,
      status: (outcome?.status ?? owned.status) as DemoJobView["status"],
      changed: outcome?.changed ?? false,
    };
  });

/** Tells the UI honestly whether real processing is currently possible. */
export const getPipelineStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveParserAdapter } = await import("@/lib/pipeline/parser/remoteParser.server");
  const adapter = resolveParserAdapter();
  return { parserAvailable: adapter.isAvailable(), adapter: adapter.id };
});
