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
  queuedAt: string;
  finishedAt: string | null;
}

const createSchema = z.object({
  fileName: z.string().min(5).max(255),
  fileSize: z.number().int().min(MIN_DEMO_SIZE_BYTES).max(MAX_DEMO_SIZE_BYTES),
  demoSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Registers the upload row + job and returns the private storage path. */
export const createDemoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Idempotency: the same file content re-uploaded reuses the existing job.
    const { data: existing } = await supabase
      .from("uploads")
      .select("id, demo_sha256, demo_jobs(id)")
      .eq("user_id", userId)
      .eq("demo_sha256", data.demoSha256)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return {
        uploadId: existing.id,
        storagePath: `${userId}/${existing.id}.dem`,
        bucket: DEMO_BUCKET,
        duplicate: true as const,
      };
    }

    const { data: upload, error } = await supabase
      .from("uploads")
      .insert({
        user_id: userId,
        type: "demo",
        source: "manual",
        file_name: data.fileName,
        file_size: data.fileSize,
        mime_type: "application/octet-stream",
        demo_sha256: data.demoSha256,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !upload) throw new Error("UPLOAD_REGISTRATION_FAILED");

    const storagePath = `${userId}/${upload.id}.dem`;
    await supabase.from("uploads").update({ storage_path: storagePath }).eq("id", upload.id);

    return { uploadId: upload.id, storagePath, bucket: DEMO_BUCKET, duplicate: false as const };
  });

/** Queues the job after the file landed in storage, then runs one step. */
export const enqueueDemoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ uploadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: upload } = await supabase
      .from("uploads")
      .select("id, user_id, file_size, demo_sha256, storage_path")
      .eq("id", data.uploadId)
      .maybeSingle();
    if (!upload || upload.user_id !== userId) throw new Error("UPLOAD_NOT_FOUND");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
        },
        { onConflict: "upload_id" },
      )
      .select("id")
      .single();
    if (error || !job) throw new Error("JOB_ENQUEUE_FAILED");

    // Process asynchronously relative to the UI: the client keeps polling.
    const { claimNextJob, processJob, recoverStaleJobs } = await import(
      "@/lib/pipeline/jobs.server"
    );
    await recoverStaleJobs();
    const next = (await claimNextJob()) ?? job.id;
    const result = await processJob(next);

    return { jobId: job.id, processed: result.status };
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
    queuedAt: row.queued_at,
    finishedAt: row.finished_at,
  };
}

const JOB_COLUMNS =
  "id, upload_id, status, stage, error_code, retry_count, max_retries, match_id, extraction_confidence, partial_parse, rounds_valid, queued_at, finished_at, uploads(file_name)";

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
      .select("id, status, retry_count, max_retries, storage_deleted_at")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("JOB_NOT_FOUND");
    if (job.status !== "failed") throw new Error("JOB_NOT_RETRYABLE");
    if (job.storage_deleted_at) throw new Error("DEMO_EXPIRED");
    if (job.retry_count >= job.max_retries) throw new Error("RETRY_LIMIT_REACHED");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("demo_jobs")
      .update({ status: "pending", stage: "queued", error_code: null, error_message: null })
      .eq("id", job.id);

    const { processJob } = await import("@/lib/pipeline/jobs.server");
    const result = await processJob(job.id);
    return { jobId: job.id, processed: result.status };
  });

/** Tells the UI honestly whether real processing is currently possible. */
export const getPipelineStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveParserAdapter } = await import("@/lib/pipeline/parser/remoteParser.server");
  const adapter = resolveParserAdapter();
  return { parserAvailable: adapter.isAvailable(), adapter: adapter.id };
});
