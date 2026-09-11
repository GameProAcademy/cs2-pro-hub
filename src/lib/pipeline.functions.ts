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
  status: "pending" | "processing" | "processed" | "failed";
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
  queuedAt: string;
  finishedAt: string | null;
}

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
export type DuplicateStatus = "processed" | "pending" | "failed" | null;

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
    const { supabase, userId } = context;

    // Idempotency: the same file content re-uploaded reuses the existing row.
    const { data: existing } = await supabase
      .from("uploads")
      .select("id, status, storage_path, demo_jobs(id, status, storage_deleted_at)")
      .eq("user_id", userId)
      .eq("demo_sha256", data.demoSha256)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const related = existing.demo_jobs as { id: string }[] | { id: string } | null;
      const job = Array.isArray(related) ? (related[0] ?? null) : related;
      const duplicateStatus: DuplicateStatus =
        existing.status === "processed"
          ? "processed"
          : existing.status === "failed"
            ? "failed"
            : "pending";
      return {
        uploadId: existing.id,
        storagePath: existing.storage_path ?? `${userId}/${existing.id}.dem`,
        bucket: DEMO_BUCKET,
        duplicate: true as const,
        duplicateStatus,
        // A processed demo keeps its permanent derived data even after the
        // temporary file expired; it must NOT be re-processed.
        existingJobId: job?.id ?? null,
      };
    }

    const uploadId = crypto.randomUUID();
    const storagePath = `${userId}/${uploadId}.dem`;

    const { error } = await supabase.from("uploads").insert({
      id: uploadId,
      user_id: userId,
      type: "demo",
      source: "manual",
      file_name: data.fileName,
      file_size: data.fileSize,
      mime_type: "application/octet-stream",
      demo_sha256: data.demoSha256,
      storage_path: storagePath,
      status: "pending",
      processed_at: null,
      error_message: null,
    });
    if (error) throw new Error("UPLOAD_REGISTRATION_FAILED");

    return {
      uploadId,
      storagePath,
      bucket: DEMO_BUCKET,
      duplicate: false as const,
      duplicateStatus: null as DuplicateStatus,
      existingJobId: null,
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

    // An already processed upload keeps its permanent derived data: re-queueing
    // it would only duplicate work against a file that may no longer exist.
    if (upload.status === "processed") {
      const { data: done } = await supabaseAdmin
        .from("demo_jobs")
        .select("id")
        .eq("upload_id", upload.id)
        .maybeSingle();
      if (done?.id) return { jobId: done.id, queued: false as const, duplicate: true as const };
    }

    // The file must really be in the private bucket before a job is queued.
    const { demoExists } = await import("@/lib/pipeline/storage.server");
    const stored = await demoExists(upload.storage_path);
    if (!stored) throw new Error("DEMO_NOT_FOUND");

    const { data: job, error } = await supabaseAdmin
      .from("demo_jobs")
      .upsert(
        {
          upload_id: upload.id,
          user_id: userId,
          status: "pending",
          stage: "queued",
          storage_path: upload.storage_path,
          demo_sha256: upload.demo_sha256,
          file_size: upload.file_size,
          queued_at: new Date().toISOString(),
          started_at: null,
          finished_at: null,
          error_code: null,
          error_message: null,
        },
        { onConflict: "upload_id" },
      )
      .select("id")
      .single();
    if (error || !job) throw new Error("JOB_ENQUEUE_FAILED");

    return { jobId: job.id, queued: true as const, duplicate: false as const };
  });

function toView(row: {
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
  uploads?: { file_name: string } | null;
}): DemoJobView {
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
    queuedAt: row.queued_at,
    finishedAt: row.finished_at,
  };
}

const JOB_COLUMNS =
  "id, upload_id, status, stage, error_code, retry_count, max_retries, match_id, extraction_confidence, partial_parse, rounds_valid, attachment_state, attachment_reason, queued_at, finished_at, uploads(file_name)";

export const getDemoJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DemoJobView | null> => {
    const { data: row } = await context.supabase
      .from("demo_jobs")
      .select(JOB_COLUMNS)
      .eq("id", data.jobId)
      .maybeSingle();
    return row ? toView(row) : null;
  });

/** Player's own processing history. RLS scopes it to the signed-in user. */
export const listMyDemoJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DemoJobView[]> => {
    const { data } = await context.supabase
      .from("demo_jobs")
      .select(JOB_COLUMNS)
      .order("queued_at", { ascending: false })
      .limit(25);
    return (data ?? []).map(toView);
  });

/** Retries a failed job the player owns (bounded by max_retries). */
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

/** Tells the UI honestly whether real processing is currently possible. */
export const getPipelineStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveParserAdapter } = await import("@/lib/pipeline/parser/remoteParser.server");
  const adapter = resolveParserAdapter();
  return { parserAvailable: adapter.isAvailable(), adapter: adapter.id };
});
