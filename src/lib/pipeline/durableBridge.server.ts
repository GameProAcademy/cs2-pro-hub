import { createHash, timingSafeEqual } from "node:crypto";

import { MAX_CONCURRENT_DEMO_JOBS, MAX_JOB_RETRIES } from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import { processJob, type DurableJobClaim } from "@/lib/pipeline/jobs.server";
import { mapParserErrorCode } from "@/lib/pipeline/parser/adapter";
import type { DurableDemoCompletionV1 } from "@/lib/pipeline/types";
import { createDemoSignedUrl, demoExists } from "@/lib/pipeline/storage.server";
import {
  createRawEvidenceSignedUploadUrl,
  rawEvidenceObjectSha256,
  uploadRawEvidenceManifest,
} from "@/lib/pipeline/storage.server";
import { createHash as sha256Hash } from "node:crypto";

const VISIBILITY_SECONDS = 15 * 60;

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

async function context() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin, rpc: supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as Rpc };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function authenticateDurableWorker(request: Request): Response | null {
  const expected = process.env["DEMO_PIPELINE_BRIDGE_SECRET"] ?? "";
  const header = request.headers.get("authorization") ?? "";
  const [scheme, supplied = ""] = header.split(" ", 2);
  if (!expected || scheme?.toLowerCase() !== "bearer" || !supplied || !timingSafeEqual(digest(expected), digest(supplied))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function claimDurableDemo(workerId: string) {
  const { db, rpc } = await context();
  const { data, error } = await rpc("claim_demo_parse_message", {
    _worker_id: workerId,
    _visibility_seconds: VISIBILITY_SECONDS,
    _max_concurrent: MAX_CONCURRENT_DEMO_JOBS,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  const claim = data as Record<string, unknown> | null;
  if (!claim || claim["status"] !== "claimed") return claim ?? { status: "empty" };
  const storagePath = typeof claim["storage_path"] === "string" ? claim["storage_path"] : "";
  const exists = storagePath ? await demoExists(storagePath) : null;
  if (!exists) throw new PipelineError("DEMO_NOT_FOUND");
  const jobId = typeof claim["job_id"] === "string" ? claim["job_id"] : "";
  const { data: job, error: jobError } = await db
    .from("demo_jobs")
    .select("user_id")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError || !job) throw new PipelineError("PERSISTENCE_ERROR", "durable job owner unavailable");
  return {
    status: "claimed",
    message_id: claim["message_id"],
    job_id: jobId,
    upload_id: claim["upload_id"],
    user_id: job.user_id,
    demo_sha256: claim["demo_sha256"],
    attempt: claim["attempt"],
    attempt_number: claim["attempt"],
    schema_version: claim["schema_version"],
    file_size: exists.size || claim["file_size"],
    demo_url: await createDemoSignedUrl(storagePath),
    visibility_seconds: VISIBILITY_SECONDS,
  };
}

export async function heartbeatDurableDemo(input: DurableJobClaim & { jobId: string; stage?: string | undefined }) {
  const { rpc } = await context();
  const { data, error } = await rpc("heartbeat_demo_parse_message", {
    _job_id: input.jobId,
    _message_id: input.messageId,
    _attempt: input.attempt,
    _worker_id: input.workerId,
    _visibility_seconds: VISIBILITY_SECONDS,
    _stage: input.stage ?? null,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return data;
}

export async function completeDurableDemo(input: DurableJobClaim & { jobId: string } & DurableDemoCompletionV1) {
  const heartbeat = (await heartbeatDurableDemo({ ...input, stage: "persisting" })) as Record<string, unknown>;
  if (heartbeat["accepted"] !== true || heartbeat["cancelled"] === true) {
    return { status: heartbeat["cancelled"] === true ? "cancelled" : "stale" };
  }
  const result = await processJob(input.jobId, { hot: input.hot, raw: input.raw }, input);
  if (result.status !== "processed" && result.status !== "blocked_raw_audit") return result;
  const { rpc } = await context();
  const { data, error } = await rpc("finalize_demo_parse_message", {
    _job_id: input.jobId,
    _message_id: input.messageId,
    _attempt: input.attempt,
    _worker_id: input.workerId,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return { ...result, queue: data };
}

export async function failDurableDemo(input: DurableJobClaim & { jobId: string; errorCode: string; detail?: string | undefined }) {
  const mapped = mapParserErrorCode(input.errorCode);
  const { rpc } = await context();
  const { data, error } = await rpc("fail_demo_parse_message", {
    _job_id: input.jobId,
    _message_id: input.messageId,
    _attempt: input.attempt,
    _worker_id: input.workerId,
    _error_code: mapped.code,
    _error_message: input.detail?.slice(0, 300) ?? null,
    _permanent: mapped.permanent,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return { ...(data as object), maxRetries: MAX_JOB_RETRIES };
}

function rawPrefix(userId: string, uploadId: string, attempt: number): string {
  return `${userId}/${uploadId}/attempt-${attempt}`;
}

async function currentRawJob(input: DurableJobClaim & { jobId: string }) {
  const { db } = await context();
  const { data: job, error } = await db.from("demo_jobs")
    .select("id, upload_id, user_id, demo_sha256, dispatch_attempt, queue_message_id, worker_id, lease_expires_at")
    .eq("id", input.jobId).maybeSingle();
  if (error || !job || Number(job.queue_message_id) !== input.messageId ||
      job.dispatch_attempt !== input.attempt || job.worker_id !== input.workerId ||
      !job.lease_expires_at || new Date(job.lease_expires_at).getTime() <= Date.now()) {
    throw new PipelineError("JOB_STALE");
  }
  return { db, job };
}

export async function initializeRawArtifact(input: DurableJobClaim & { jobId: string }) {
  const { db, job } = await currentRawJob(input);
  const prefix = rawPrefix(job.user_id, job.upload_id, input.attempt);
  const { data: existing, error: existingError } = await db.from("raw_evidence_artifacts")
    .select("*").eq("job_id", input.jobId).maybeSingle();
  if (existingError) throw new PipelineError("PERSISTENCE_ERROR", existingError.message);
  if (existing) {
    if (existing.upload_id !== job.upload_id || existing.user_id !== job.user_id ||
        existing.attempt_number !== input.attempt || existing.demo_sha256 !== job.demo_sha256) {
      throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW artifact identity conflict");
    }
    return existing;
  }
  const { data, error } = await db.from("raw_evidence_artifacts").insert({
    job_id: input.jobId, upload_id: job.upload_id, user_id: job.user_id,
    attempt_number: input.attempt, demo_sha256: job.demo_sha256 ?? "",
    storage_bucket: "cs2-raw-evidence", storage_prefix: prefix,
    manifest_storage_path: `${prefix}/manifest.json`, schema_version: 1,
    status: "uploading", raw_status: "writing", audit_status: "running",
  }).select("*").single();
  if (error || !data) throw new PipelineError("PERSISTENCE_ERROR", error?.message ?? "artifact create failed");
  return data;
}

export async function prepareRawChunk(input: DurableJobClaim & { jobId: string; artifactId: string;
  section: string; chunkIndex: number; firstRow: number; lastRow: number; rowCount: number;
  byteSize: number; sha256: string; previousChunkSha256: string | null }) {
  const { db, job } = await currentRawJob(input);
  if (input.byteSize <= 0 || input.byteSize > 8 * 1024 * 1024 || !/^[0-9a-f]{64}$/.test(input.sha256)) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW chunk metadata");
  }
  const prefix = rawPrefix(job.user_id, job.upload_id, input.attempt);
  const path = `${prefix}/${input.section}/chunk-${String(input.chunkIndex).padStart(6, "0")}.jsonl.gz`;
  const { data: artifact } = await db.from("raw_evidence_artifacts").select("id, storage_prefix, status")
    .eq("id", input.artifactId).eq("job_id", input.jobId).maybeSingle();
  if (!artifact || artifact.storage_prefix !== prefix || artifact.status === "ready") {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW artifact state");
  }
  const { error } = await db.from("raw_evidence_chunks").upsert({
    artifact_id: input.artifactId, section: input.section, chunk_index: input.chunkIndex,
    storage_path: path, first_row: input.firstRow, last_row: input.lastRow,
    row_count: input.rowCount, byte_size: input.byteSize, sha256: input.sha256,
    previous_chunk_sha256: input.previousChunkSha256, status: "uploading",
  }, { onConflict: "artifact_id,section,chunk_index" });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return { path, uploadUrl: await createRawEvidenceSignedUploadUrl(path) };
}

export async function verifyRawChunk(input: DurableJobClaim & { jobId: string; artifactId: string;
  section: string; chunkIndex: number }) {
  const { db } = await currentRawJob(input);
  const { data: chunk } = await db.from("raw_evidence_chunks").select("storage_path, sha256")
    .eq("artifact_id", input.artifactId).eq("section", input.section)
    .eq("chunk_index", input.chunkIndex).maybeSingle();
  if (!chunk || await rawEvidenceObjectSha256(chunk.storage_path) !== chunk.sha256) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW chunk verification failed");
  }
  const now = new Date().toISOString();
  const { error } = await db.from("raw_evidence_chunks").update({ status: "verified", uploaded_at: now, verified_at: now })
    .eq("artifact_id", input.artifactId).eq("section", input.section).eq("chunk_index", input.chunkIndex);
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return { verified: true };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function finalizeRawArtifact(input: DurableJobClaim & { jobId: string; artifactId: string;
  rootDigest: string; manifest: Record<string, unknown> }) {
  const { db } = await currentRawJob(input);
  const { data: artifact } = await db.from("raw_evidence_artifacts").select("*")
    .eq("id", input.artifactId).eq("job_id", input.jobId).maybeSingle();
  const { data: chunks, error: chunksError } = await db.from("raw_evidence_chunks")
    .select("section, chunk_index, row_count, byte_size, sha256, previous_chunk_sha256, status")
    .eq("artifact_id", input.artifactId).order("section").order("chunk_index");
  if (!artifact || chunksError || !chunks?.length || chunks.some((chunk) => chunk.status !== "verified")) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW artifact incomplete");
  }
  const order = ["header", "players", "rounds", "events", "ticks", "grenades", "player-info", "game-state", "economy", "forensic"];
  let previous: string | null = null;
  const summaries = order.map((section) => {
    const own = chunks.filter((chunk) => chunk.section === section).sort((a, b) => a.chunk_index - b.chunk_index);
    own.forEach((chunk, index) => {
      if (chunk.chunk_index !== index || chunk.previous_chunk_sha256 !== previous) throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW chain mismatch");
      previous = chunk.sha256;
    });
    return { name: section, chunk_count: own.length,
      row_count: own.reduce((sum, chunk) => sum + Number(chunk.row_count), 0),
      byte_count: own.reduce((sum, chunk) => sum + Number(chunk.byte_size), 0),
      digest: sha256Hash("sha256").update(stable(own.map((chunk) => chunk.sha256))).digest("hex") };
  });
  const computed = sha256Hash("sha256").update(stable(summaries)).digest("hex");
  if (computed !== input.rootDigest || input.manifest["root_digest"] !== computed) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW root mismatch");
  }
  await uploadRawEvidenceManifest(artifact.manifest_storage_path, stable(input.manifest));
  const totals = { total_chunks: chunks.length,
    total_rows: chunks.reduce((sum, chunk) => sum + Number(chunk.row_count), 0),
    total_bytes: chunks.reduce((sum, chunk) => sum + Number(chunk.byte_size), 0) };
  const approved = input.manifest["audit_status"] === "approved";
  const { data: ready, error } = await db.from("raw_evidence_artifacts").update({ ...totals,
    status: "ready", raw_status: "ready", audit_status: approved ? "approved" : "blocked",
    root_digest: computed, ready_at: new Date().toISOString() }).eq("id", input.artifactId).select("*").single();
  if (error || !ready) throw new PipelineError("PERSISTENCE_ERROR", error?.message ?? "artifact finalize failed");
  return ready;
}