/**
 * Asynchronous job lifecycle (server-only).
 *
 * pending -> processing -> processed | failed
 *
 * A job is NEVER processed inside the user's request/response cycle beyond a
 * single controlled step, and the demo file is deleted after the retention
 * window. Failures are recorded with a structured error code, and transient
 * failures are retried up to MAX_JOB_RETRIES.
 */
import {
  ANALYSIS_VERSION,
  JOB_STALE_MINUTES,
  MAX_CONCURRENT_DEMO_JOBS,
  MAX_JOB_RETRIES,
  SCHEMA_VERSION,
} from "@/config/pipeline";
import { PipelineError, toPipelineError } from "@/lib/pipeline/errors";
import { extractFeatures } from "@/lib/pipeline/features";
import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { resolveParserAdapter } from "@/lib/pipeline/parser/remoteParser.server";
import { persistCanonicalMatch } from "@/lib/pipeline/persistence.server";
import {
  computeStoredDemoSha256,
  createDemoSignedUrl,
  deleteDemo,
  demoExists,
  retainUntil,
} from "@/lib/pipeline/storage.server";
import {
  resolveOwnSteamId,
  validateCanonicalMatch,
  validateDemoFile,
} from "@/lib/pipeline/validator";

export type JobStage =
  | "queued"
  | "validating"
  | "parsing"
  | "normalizing"
  | "metrics"
  | "persisting"
  | "cleanup"
  | "done"
  | "failed";

export interface JobProcessResult {
  jobId: string;
  status: "processed" | "failed" | "skipped";
  errorCode?: string;
  matchId?: string;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function setStage(jobId: string, stage: JobStage) {
  const db = await admin();
  await db.from("demo_jobs").update({ stage }).eq("id", jobId);
}

/** Re-queues jobs stuck in `processing` beyond the stale window. */
export async function recoverStaleJobs(): Promise<number> {
  const db = await admin();
  const threshold = new Date(Date.now() - JOB_STALE_MINUTES * 60_000).toISOString();
  const { data } = await db
    .from("demo_jobs")
    .update({ status: "pending", stage: "queued" })
    .eq("status", "processing")
    .lt("started_at", threshold)
    .select("id");
  return data?.length ?? 0;
}

/** Deletes temporary demo files whose retention window has expired. */
export async function cleanupExpiredDemos(limit = 25): Promise<number> {
  const db = await admin();
  const { data } = await db
    .from("demo_jobs")
    .select("id, storage_path")
    .not("storage_path", "is", null)
    .is("storage_deleted_at", null)
    .lt("retain_until", new Date().toISOString())
    .limit(limit);

  let deleted = 0;
  for (const job of data ?? []) {
    if (!job.storage_path) continue;
    try {
      await deleteDemo(job.storage_path);
      await db
        .from("demo_jobs")
        .update({ storage_deleted_at: new Date().toISOString(), cleanup_error: null })
        .eq("id", job.id);
      deleted += 1;
    } catch (error) {
      await db
        .from("demo_jobs")
        .update({ cleanup_error: toPipelineError(error).code })
        .eq("id", job.id);
    }
  }
  return deleted;
}

/**
 * Atomically claims the next pending job.
 *
 * The claim is a single transactional SQL function (`claim_next_demo_job`) that
 * locks the candidate row with FOR UPDATE SKIP LOCKED, honours the concurrency
 * limit and flips the row to `processing` in the same transaction, so two
 * concurrent workers can never claim the same job.
 */
export async function claimNextJob(): Promise<string | null> {
  const db = await admin();
  const { data, error } = await db.rpc("claim_next_demo_job", {
    _max_concurrent: MAX_CONCURRENT_DEMO_JOBS,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return (data as string | null) ?? null;
}

/** Runs one job end to end. Safe to call repeatedly; never throws. */
export async function processJob(jobId: string): Promise<JobProcessResult> {
  const db = await admin();
  const startedAt = Date.now();

  const { data: job } = await db
    .from("demo_jobs")
    .select(
      "id, upload_id, user_id, player_id, status, retry_count, max_retries, storage_path, demo_sha256, file_size",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (!job) return { jobId, status: "skipped", errorCode: "DEMO_NOT_FOUND" };
  if (job.status === "processed") return { jobId, status: "skipped" };

  // The job may already have been claimed transactionally by
  // `claim_next_demo_job`. Otherwise claim it here, still atomically: only a
  // row that is still `pending` can be moved to `processing`.
  if (job.status !== "processing") {
    const { data: claimed } = await db
      .from("demo_jobs")
      .update({ status: "processing", stage: "validating", started_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) return { jobId, status: "skipped" };
  }

  await db.from("uploads").update({ status: "processing" }).eq("id", job.upload_id);

  try {
    if (!job.storage_path) throw new PipelineError("DEMO_NOT_FOUND", "missing storage path");

    const stored = await demoExists(job.storage_path);
    if (!stored) throw new PipelineError("DEMO_NOT_FOUND");
    validateDemoFile(job.storage_path, stored.size || (job.file_size ?? 0));

    // The hash reported by the browser is NOT proof of integrity: the worker
    // recomputes SHA-256 from the stored bytes and refuses a divergent file.
    if (job.demo_sha256) {
      const actual = await computeStoredDemoSha256(job.storage_path);
      if (actual !== job.demo_sha256) {
        throw new PipelineError("CORRUPTED_DEMO", "sha256 mismatch");
      }
    }

    const adapter = resolveParserAdapter();
    if (!adapter.isAvailable()) throw new PipelineError("PARSER_UNAVAILABLE");

    await setStage(jobId, "parsing");
    const signedUrl = await createDemoSignedUrl(job.storage_path);
    const raw = await adapter.parseDemo({
      storagePath: job.storage_path,
      signedUrl,
      uploadId: job.upload_id,
      fileSize: stored.size || (job.file_size ?? 0),
      demoSha256: job.demo_sha256,
    });

    await setStage(jobId, "normalizing");
    const match = normalizeParserOutput(raw);
    validateCanonicalMatch(match);

    // Identity: only an explicitly stored Steam ID is accepted.
    const { data: player } = await db
      .from("player_profiles")
      .select("id, steam_id")
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (!player) throw new PipelineError("PLAYER_IDENTITY_UNRESOLVED", "no player profile");
    const steamId = resolveOwnSteamId(match, player.steam_id);

    await setStage(jobId, "metrics");
    const metrics = computeMetrics(match, steamId);
    const features = extractFeatures(match, metrics);

    await setStage(jobId, "persisting");
    const persisted = await persistCanonicalMatch({
      uploadId: job.upload_id,
      playerId: player.id,
      steamId,
      match,
      metrics,
      features,
    });

    const durationMs = Date.now() - startedAt;
    await db
      .from("demo_jobs")
      .update({
        status: "processed",
        stage: "done",
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        match_id: persisted.matchId,
        player_id: player.id,
        resolved_steam_id: steamId,
        identity_status: "resolved",
        parser_name: match.parser.name,
        parser_version: match.parser.version,
        parser_revision: match.parser.revision,
        schema_version: SCHEMA_VERSION,
        analysis_version: ANALYSIS_VERSION,
        rounds_detected: match.quality.roundsDetected,
        rounds_valid: match.quality.roundsValid,
        players_detected: match.quality.playersDetected,
        events_detected: match.quality.eventsDetected,
        extraction_confidence: match.quality.extractionConfidence,
        partial_parse: match.quality.partialParse,
        quality_flags: match.quality.flags,
        error_code: null,
        error_message: null,
        retain_until: retainUntil(true),
      })
      .eq("id", jobId);

    await db
      .from("uploads")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        processing_duration_ms: durationMs,
        parser_name: match.parser.name,
        parser_version: match.parser.version,
        schema_version: SCHEMA_VERSION,
        analysis_version: ANALYSIS_VERSION,
        error_code: null,
        error_message: null,
      })
      .eq("id", job.upload_id);

    await cleanupExpiredDemos(5);
    return { jobId, status: "processed", matchId: persisted.matchId };
  } catch (error) {
    const pipelineError = toPipelineError(error);
    const canRetry =
      !pipelineError.permanent && job.retry_count < (job.max_retries ?? MAX_JOB_RETRIES);

    await db
      .from("demo_jobs")
      .update({
        status: canRetry ? "pending" : "failed",
        stage: canRetry ? "queued" : "failed",
        retry_count: job.retry_count + 1,
        error_code: pipelineError.code,
        error_message: pipelineError.detail ?? null,
        finished_at: canRetry ? null : new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        retain_until: retainUntil(false),
      })
      .eq("id", jobId);

    await db
      .from("uploads")
      .update({
        status: canRetry ? "pending" : "failed",
        error_code: pipelineError.code,
        error_message: pipelineError.detail ?? null,
      })
      .eq("id", job.upload_id);

    console.error("[pipeline] job failed", { jobId, code: pipelineError.code });
    return { jobId, status: "failed", errorCode: pipelineError.code };
  }
}
