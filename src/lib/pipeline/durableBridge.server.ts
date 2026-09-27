import { createHash, timingSafeEqual } from "node:crypto";

import { MAX_CONCURRENT_DEMO_JOBS, MAX_JOB_RETRIES } from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import { readH3E91ExecutionLifecycle } from "@/lib/pipeline/h3e91Lifecycle.server";
import { processJob, type DurableJobClaim } from "@/lib/pipeline/jobs.server";
import { mapParserErrorCode } from "@/lib/pipeline/parser/adapter";
import { RAW_CHUNK_HARD_MAX_BYTES, type DurableDemoCompletionV1 } from "@/lib/pipeline/types";
import {
  RAW_ARTIFACT_SECTION_ORDER,
  deriveRawArtifactAuditStatus,
  rawArtifactSha256,
  stableRawArtifactJson,
} from "@/lib/pipeline/rawArtifactContract";
import { createDemoSignedUrl, demoExists } from "@/lib/pipeline/storage.server";
import {
  createRawEvidenceSignedUploadUrl,
  rawEvidenceObjectSha256,
  uploadRawEvidenceManifest,
} from "@/lib/pipeline/storage.server";

const VISIBILITY_SECONDS = 15 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_URL_NAMESPACE = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

/** Matches Python uuid.uuid5(uuid.NAMESPACE_URL, ...) in the durable worker. */
function durableExecutionId(jobId: string, attemptNumber: number, uploadId: string): string {
  const digest = createHash("sha1")
    .update(UUID_URL_NAMESPACE)
    .update(`h3e91:durable:${jobId}:${attemptNumber}:${uploadId}`, "utf8")
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const RAW_ARTIFACT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const RAW_MAX_CHUNKS_PER_SECTION = 100_000;
export const RAW_MAX_CHUNKS_TOTAL = 200_000;

type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

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
  if (
    !expected ||
    scheme?.toLowerCase() !== "bearer" ||
    !supplied ||
    !timingSafeEqual(digest(expected), digest(supplied))
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export type ValidatedDurableClaim = {
  status: "claimed";
  message_id: number;
  job_id: string;
  upload_id: string;
  user_id: string;
  demo_sha256: string;
  attempt: number;
  attempt_number: number;
  schema_version: number;
  file_size: number;
  storage_path: string;
};

export function validateDurableClaim(value: unknown): ValidatedDurableClaim | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const claim = value as Record<string, unknown>;
  if (claim["status"] !== "claimed") return null;
  const validUuid = (field: string) =>
    typeof claim[field] === "string" && UUID_PATTERN.test(claim[field]);
  const validInteger = (field: string, minimum: number) =>
    typeof claim[field] === "number" &&
    Number.isSafeInteger(claim[field]) &&
    claim[field] >= minimum;
  if (
    !validUuid("job_id") ||
    !validUuid("upload_id") ||
    !validUuid("user_id") ||
    !validInteger("message_id", 1) ||
    !validInteger("attempt", 0) ||
    !validInteger("attempt_number", 1) ||
    !validInteger("schema_version", 1) ||
    !validInteger("file_size", 1) ||
    typeof claim["demo_sha256"] !== "string" ||
    !SHA256_PATTERN.test(claim["demo_sha256"]) ||
    typeof claim["storage_path"] !== "string" ||
    claim["storage_path"].length === 0
  ) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "durable claim contract invalid");
  }
  return claim as ValidatedDurableClaim;
}

export async function claimDurableDemo(workerId: string) {
  const { rpc } = await context();
  const { data, error } = await rpc("claim_demo_parse_message", {
    _worker_id: workerId,
    _visibility_seconds: VISIBILITY_SECONDS,
    _max_concurrent: MAX_CONCURRENT_DEMO_JOBS,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  const claim = validateDurableClaim(data);
  if (!claim) return data ?? { status: "empty" };
  const exists = await demoExists(claim.storage_path);
  if (!exists) throw new PipelineError("DEMO_NOT_FOUND");
  return {
    status: "claimed",
    message_id: claim.message_id,
    job_id: claim.job_id,
    upload_id: claim.upload_id,
    user_id: claim.user_id,
    demo_sha256: claim.demo_sha256,
    attempt: claim.attempt,
    attempt_number: claim.attempt_number,
    schema_version: claim.schema_version,
    file_size: exists.size || claim.file_size,
    demo_url: await createDemoSignedUrl(claim.storage_path),
    visibility_seconds: VISIBILITY_SECONDS,
  };
}

export async function heartbeatDurableDemo(
  input: DurableJobClaim & { jobId: string; stage?: string | undefined },
) {
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

export async function completeDurableDemo(
  input: DurableJobClaim & { jobId: string } & DurableDemoCompletionV1,
) {
  const heartbeat = (await heartbeatDurableDemo({ ...input, stage: "persisting" })) as Record<
    string,
    unknown
  >;
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

export async function failDurableDemo(
  input: DurableJobClaim & { jobId: string; errorCode: string; detail?: string | undefined },
) {
  const mapped = mapParserErrorCode(input.errorCode);
  const { db, rpc } = await context();
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
  const accepted = (data as { accepted?: boolean } | null)?.accepted === true;
  if (accepted) {
    await db
      .from("raw_evidence_artifacts")
      .update({
        status: "failed",
        raw_status: "failed",
        audit_status: "blocked",
        error_code: mapped.code,
        error_message: input.detail?.slice(0, 300) ?? null,
        failed_at: new Date().toISOString(),
      })
      .eq("job_id", input.jobId)
      .neq("status", "ready");
  }
  return { ...(data as object), maxRetries: MAX_JOB_RETRIES };
}

export async function reconcileDurableExecution(
  input: DurableJobClaim & { jobId: string; executionId: string },
) {
  const { db, rpc } = await context();
  const { data: job, error: jobError } = await db
    .from("demo_jobs")
    .select(
      "status, queue_message_id, dispatch_attempt, worker_id, upload_id, attempt_number, demo_sha256, match_id, parser_name, parser_version, parser_revision, schema_version",
    )
    .eq("id", input.jobId)
    .maybeSingle();
  if (
    jobError ||
    !job ||
    Number(job.queue_message_id) !== input.messageId ||
    job.dispatch_attempt !== input.attempt ||
    job.worker_id !== input.workerId ||
    typeof job.upload_id !== "string" ||
    typeof job.attempt_number !== "number" ||
    durableExecutionId(input.jobId, job.attempt_number, job.upload_id) !== input.executionId
  ) {
    return { status: "reconciliation_required", lifecycle: "UNKNOWN" };
  }
  const lifecycle = await readH3E91ExecutionLifecycle(input.executionId);
  if (lifecycle.executionId !== input.executionId) {
    throw new PipelineError("PARSER_UNAVAILABLE", "H3E91_LIFECYCLE_IDENTITY_MISMATCH");
  }
  if (lifecycle.lifecycle === "INVALID" || lifecycle.lifecycle === "NONE") {
    return { status: "reconciliation_required", lifecycle: lifecycle.lifecycle };
  }
  if (lifecycle.lifecycle === "INTENT_ONLY" || lifecycle.lifecycle === "STARTED") {
    return { status: "reconciliation_required", lifecycle: lifecycle.lifecycle };
  }

  if (lifecycle.lifecycle === "FINISHED") {
    if (!["processed", "blocked_raw_audit"].includes(job.status)) {
      return { status: "reconciliation_required", lifecycle: "FINISHED" };
    }
    // A terminal job flag alone is not proof that RAW/HOT output survived a lost acknowledgement.
    const { data: artifact, error: artifactError } = await db
      .from("raw_evidence_artifacts")
      .select(
        "job_id, upload_id, attempt_number, demo_sha256, status, raw_status, audit_status, root_digest",
      )
      .eq("job_id", input.jobId)
      .eq("upload_id", job.upload_id)
      .maybeSingle();
    if (
      artifactError ||
      !artifact ||
      artifact.job_id !== input.jobId ||
      artifact.upload_id !== job.upload_id ||
      artifact.attempt_number !== job.attempt_number ||
      typeof job.demo_sha256 !== "string" ||
      !SHA256_PATTERN.test(job.demo_sha256) ||
      artifact.demo_sha256 !== job.demo_sha256 ||
      artifact.status !== "ready" ||
      artifact.raw_status !== "ready" ||
      typeof artifact.root_digest !== "string" ||
      !SHA256_PATTERN.test(artifact.root_digest) ||
      !["approved", "blocked"].includes(artifact.audit_status)
    ) {
      return { status: "reconciliation_required", lifecycle: "FINISHED" };
    }
    if (job.status === "processed" && artifact.audit_status !== "approved") {
      return { status: "reconciliation_required", lifecycle: "FINISHED" };
    }
    // A processed job is only the terminal envelope. The durable HOT result is
    // committed through the Canonical demo source and then projected back onto
    // demo_jobs. Require both sides of that production persistence contract,
    // bound to this upload and match, before acknowledging a lost queue reply.
    // blocked_raw_audit is the explicit exception: Canonical/HOT persistence is
    // intentionally forbidden when RAW admission fails.
    if (job.status === "processed") {
      if (
        typeof job.match_id !== "string" ||
        typeof job.parser_name !== "string" ||
        job.parser_name.length === 0 ||
        typeof job.parser_version !== "string" ||
        job.parser_version.length === 0 ||
        typeof job.parser_revision !== "string" ||
        job.parser_revision.length === 0 ||
        typeof job.schema_version !== "number" ||
        !Number.isSafeInteger(job.schema_version) ||
        job.schema_version < 1
      ) {
        return { status: "reconciliation_required", lifecycle: "FINISHED" };
      }
      const { data: persistedResult, error: persistedResultError } = await db
        .from("match_sources")
        .select("match_id, upload_id, source, source_contract_version, source_version, status")
        .eq("upload_id", job.upload_id)
        .eq("match_id", job.match_id)
        .eq("source", "demo")
        .maybeSingle();
      if (
        persistedResultError ||
        !persistedResult ||
        persistedResult.upload_id !== job.upload_id ||
        persistedResult.match_id !== job.match_id ||
        persistedResult.source !== "demo" ||
        typeof persistedResult.source_contract_version !== "string" ||
        persistedResult.source_contract_version.length === 0 ||
        persistedResult.source_contract_version !== String(job.schema_version) ||
        typeof persistedResult.source_version !== "string" ||
        persistedResult.source_version !== job.parser_version ||
        persistedResult.status !== "complete"
      ) {
        return { status: "reconciliation_required", lifecycle: "FINISHED" };
      }
    }
    const { data, error } = await rpc("finalize_demo_parse_message", {
      _job_id: input.jobId,
      _message_id: input.messageId,
      _attempt: input.attempt,
      _worker_id: input.workerId,
    });
    if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
    if ((data as { acknowledged?: boolean } | null)?.acknowledged !== true) {
      return { status: "reconciliation_required", lifecycle: "FINISHED" };
    }
    return { status: "queue_reconciled", lifecycle: "FINISHED", queue: data };
  }

  const { data, error } = await rpc("fail_demo_parse_message", {
    _job_id: input.jobId,
    _message_id: input.messageId,
    _attempt: input.attempt,
    _worker_id: input.workerId,
    _error_code: lifecycle.terminalOutcome ?? `EXECUTION_${lifecycle.lifecycle}`,
    _error_message: "Authoritative execution terminal reconciled without parser replay.",
    _permanent: lifecycle.lifecycle === "FAILED",
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  if ((data as { accepted?: boolean } | null)?.accepted !== true) {
    return { status: "reconciliation_required", lifecycle: lifecycle.lifecycle };
  }
  return { status: "queue_reconciled", lifecycle: lifecycle.lifecycle, queue: data };
}

export function rawPrefix(userId: string, uploadId: string, demoAttemptNumber: number): string {
  return `${userId}/${uploadId}/attempt-${demoAttemptNumber}`;
}

export { deriveRawArtifactAuditStatus };

type VerifiedRawChunk = {
  section: string;
  chunk_index: number;
  row_count: number;
  byte_size: number;
  sha256: string;
  previous_chunk_sha256: string | null;
};

export type RawChunkState = "verified" | "uploading" | "failed";

export function decideRawChunkRecovery(
  existing: {
    row_count: number;
    byte_size: number;
    sha256: string;
    previous_chunk_sha256: string | null;
    storage_path: string;
    first_row: number | null;
    last_row: number | null;
    status: string;
  } | null,
  incoming: VerifiedRawChunk & { storage_path: string; first_row: number; last_row: number },
): "reuse" | "rewrite" | "create" {
  if (!existing) return "create";
  const same =
    existing.storage_path === incoming.storage_path &&
    existing.first_row === incoming.first_row &&
    existing.last_row === incoming.last_row &&
    existing.row_count === incoming.row_count &&
    existing.byte_size === incoming.byte_size &&
    existing.sha256 === incoming.sha256 &&
    existing.previous_chunk_sha256 === incoming.previous_chunk_sha256;
  if (!same) throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW chunk identity conflict");
  if (existing.status === "verified") return "reuse";
  if (existing.status === "uploading" || existing.status === "failed") return "rewrite";
  throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW chunk lifecycle");
}

export function computeRawArtifactIntegrity(chunks: VerifiedRawChunk[]) {
  if (chunks.length > RAW_MAX_CHUNKS_TOTAL) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW artifact chunk limit exceeded");
  }
  const totalBytes = chunks.reduce((sum, chunk) => sum + Number(chunk.byte_size), 0);
  if (totalBytes > RAW_ARTIFACT_MAX_BYTES) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW artifact size limit exceeded");
  }
  if (
    chunks.some(
      (chunk) =>
        !RAW_ARTIFACT_SECTION_ORDER.includes(
          chunk.section as (typeof RAW_ARTIFACT_SECTION_ORDER)[number],
        ) ||
        !Number.isSafeInteger(chunk.chunk_index) ||
        chunk.chunk_index < 0 ||
        !Number.isSafeInteger(chunk.row_count) ||
        chunk.row_count <= 0 ||
        !Number.isSafeInteger(chunk.byte_size) ||
        chunk.byte_size <= 0 ||
        chunk.byte_size > RAW_CHUNK_HARD_MAX_BYTES,
    )
  ) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW chunk metadata");
  }
  let previous: string | null = null;
  const summaries = RAW_ARTIFACT_SECTION_ORDER.map((section) => {
    const own = chunks
      .filter((chunk) => chunk.section === section)
      .sort((a, b) => a.chunk_index - b.chunk_index);
    if (own.length > RAW_MAX_CHUNKS_PER_SECTION) {
      throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW section chunk limit exceeded");
    }
    own.forEach((chunk, index) => {
      if (
        chunk.chunk_index !== index ||
        chunk.previous_chunk_sha256 !== previous ||
        !/^[0-9a-f]{64}$/.test(chunk.sha256) ||
        chunk.row_count <= 0 ||
        chunk.byte_size <= 0 ||
        chunk.byte_size > RAW_CHUNK_HARD_MAX_BYTES
      ) {
        throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW chain mismatch");
      }
      previous = chunk.sha256;
    });
    return {
      name: section,
      chunk_count: own.length,
      row_count: own.reduce((sum, chunk) => sum + Number(chunk.row_count), 0),
      byte_count: own.reduce((sum, chunk) => sum + Number(chunk.byte_size), 0),
      digest: rawArtifactSha256(stableRawArtifactJson(own.map((chunk) => chunk.sha256))),
    };
  });
  return { summaries, rootDigest: rawArtifactSha256(stableRawArtifactJson(summaries)) };
}

async function currentRawJob(input: DurableJobClaim & { jobId: string }) {
  const { db } = await context();
  const { data: job, error } = await db
    .from("demo_jobs")
    .select(
      "id, upload_id, user_id, demo_sha256, attempt_number, dispatch_attempt, queue_message_id, worker_id, lease_expires_at",
    )
    .eq("id", input.jobId)
    .maybeSingle();
  if (
    error ||
    !job ||
    Number(job.queue_message_id) !== input.messageId ||
    job.dispatch_attempt !== input.attempt ||
    job.worker_id !== input.workerId ||
    !job.lease_expires_at ||
    new Date(job.lease_expires_at).getTime() <= Date.now()
  ) {
    throw new PipelineError("JOB_STALE");
  }
  return { db, job };
}

export async function initializeRawArtifact(input: DurableJobClaim & { jobId: string }) {
  const { db, job } = await currentRawJob(input);
  const prefix = rawPrefix(job.user_id, job.upload_id, job.attempt_number);
  const { data: existing, error: existingError } = await db
    .from("raw_evidence_artifacts")
    .select("*")
    .eq("job_id", input.jobId)
    .maybeSingle();
  if (existingError) throw new PipelineError("PERSISTENCE_ERROR", existingError.message);
  if (existing) {
    if (
      existing.upload_id !== job.upload_id ||
      existing.user_id !== job.user_id ||
      existing.attempt_number !== job.attempt_number ||
      existing.demo_sha256 !== job.demo_sha256 ||
      existing.storage_prefix !== prefix ||
      existing.storage_bucket !== "cs2-raw-evidence" ||
      existing.manifest_storage_path !== `${prefix}/manifest.json` ||
      existing.schema_version !== 1
    ) {
      throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW artifact identity conflict");
    }
    if (existing.status === "failed") {
      const { data: recovered, error: recoveryError } = await db
        .from("raw_evidence_artifacts")
        .update({
          status: "uploading",
          raw_status: "writing",
          audit_status: "running",
          error_code: null,
          error_message: null,
          failed_at: null,
          ready_at: null,
          root_digest: null,
          total_chunks: 0,
          total_rows: 0,
          total_bytes: 0,
        })
        .eq("id", existing.id)
        .eq("status", "failed")
        .select("*")
        .single();
      if (recoveryError || !recovered) {
        throw new PipelineError(
          "PERSISTENCE_ERROR",
          recoveryError?.message ?? "RAW recovery failed",
        );
      }
      console.info(
        `[raw-artifact] event=raw_artifact_recovery artifact=${String(existing.id).slice(0, 8)}`,
      );
      return { ...recovered, recovered: true };
    }
    return existing;
  }
  const { data, error } = await db
    .from("raw_evidence_artifacts")
    .insert({
      job_id: input.jobId,
      upload_id: job.upload_id,
      user_id: job.user_id,
      attempt_number: job.attempt_number,
      demo_sha256: job.demo_sha256 ?? "",
      storage_bucket: "cs2-raw-evidence",
      storage_prefix: prefix,
      manifest_storage_path: `${prefix}/manifest.json`,
      schema_version: 1,
      status: "uploading",
      raw_status: "writing",
      audit_status: "running",
    })
    .select("*")
    .single();
  if (error || !data)
    throw new PipelineError("PERSISTENCE_ERROR", error?.message ?? "artifact create failed");
  return data;
}

export async function prepareRawChunk(
  input: DurableJobClaim & {
    jobId: string;
    artifactId: string;
    section: (typeof RAW_ARTIFACT_SECTION_ORDER)[number];
    chunkIndex: number;
    firstRow: number;
    lastRow: number;
    rowCount: number;
    byteSize: number;
    sha256: string;
    previousChunkSha256: string | null;
  },
) {
  const { db, job } = await currentRawJob(input);
  if (
    input.byteSize <= 0 ||
    input.byteSize > RAW_CHUNK_HARD_MAX_BYTES ||
    !/^[0-9a-f]{64}$/.test(input.sha256)
  ) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW chunk metadata");
  }
  if (input.chunkIndex >= RAW_MAX_CHUNKS_PER_SECTION) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW section chunk limit exceeded");
  }
  if (
    !RAW_ARTIFACT_SECTION_ORDER.includes(input.section) ||
    input.rowCount <= 0 ||
    input.lastRow !== input.firstRow + input.rowCount - 1 ||
    (input.chunkIndex === 0 &&
      input.section === RAW_ARTIFACT_SECTION_ORDER[0] &&
      input.previousChunkSha256 !== null)
  ) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW chunk coordinates");
  }
  const prefix = rawPrefix(job.user_id, job.upload_id, job.attempt_number);
  const path = `${prefix}/${input.section}/chunk-${String(input.chunkIndex).padStart(6, "0")}.jsonl.gz`;
  const { data: artifact } = await db
    .from("raw_evidence_artifacts")
    .select("id, storage_prefix, status")
    .eq("id", input.artifactId)
    .eq("job_id", input.jobId)
    .maybeSingle();
  if (
    !artifact ||
    artifact.storage_prefix !== prefix ||
    !["creating", "uploading", "verifying"].includes(artifact.status)
  ) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW artifact state");
  }
  const { data: existingChunk, error: existingChunkError } = await db
    .from("raw_evidence_chunks")
    .select(
      "storage_path, first_row, last_row, row_count, byte_size, sha256, previous_chunk_sha256, status",
    )
    .eq("artifact_id", input.artifactId)
    .eq("section", input.section)
    .eq("chunk_index", input.chunkIndex)
    .maybeSingle();
  if (existingChunkError) throw new PipelineError("PERSISTENCE_ERROR", existingChunkError.message);
  const recovery = decideRawChunkRecovery(existingChunk, {
    section: input.section,
    chunk_index: input.chunkIndex,
    storage_path: path,
    first_row: input.firstRow,
    last_row: input.lastRow,
    row_count: input.rowCount,
    byte_size: input.byteSize,
    sha256: input.sha256,
    previous_chunk_sha256: input.previousChunkSha256,
  });
  if (recovery === "reuse") return { path, alreadyVerified: true };
  const { error } = await db.from("raw_evidence_chunks").upsert(
    {
      artifact_id: input.artifactId,
      section: input.section,
      chunk_index: input.chunkIndex,
      storage_path: path,
      first_row: input.firstRow,
      last_row: input.lastRow,
      row_count: input.rowCount,
      byte_size: input.byteSize,
      sha256: input.sha256,
      previous_chunk_sha256: input.previousChunkSha256,
      status: "uploading",
      error_code: null,
      error_message: null,
      failed_at: null,
      uploaded_at: null,
      verified_at: null,
    },
    { onConflict: "artifact_id,section,chunk_index" },
  );
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return { path, uploadUrl: await createRawEvidenceSignedUploadUrl(path) };
}

export async function verifyRawChunk(
  input: DurableJobClaim & {
    jobId: string;
    artifactId: string;
    section: (typeof RAW_ARTIFACT_SECTION_ORDER)[number];
    chunkIndex: number;
  },
) {
  const { db, job } = await currentRawJob(input);
  if (
    !RAW_ARTIFACT_SECTION_ORDER.includes(input.section) ||
    !Number.isSafeInteger(input.chunkIndex) ||
    input.chunkIndex < 0 ||
    input.chunkIndex >= RAW_MAX_CHUNKS_PER_SECTION
  ) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW chunk coordinates");
  }
  const prefix = rawPrefix(job.user_id, job.upload_id, job.attempt_number);
  const { data: artifact } = await db
    .from("raw_evidence_artifacts")
    .select("id, storage_prefix, status")
    .eq("id", input.artifactId)
    .eq("job_id", input.jobId)
    .maybeSingle();
  if (
    !artifact ||
    artifact.storage_prefix !== prefix ||
    !["creating", "uploading", "verifying"].includes(artifact.status)
  ) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW artifact state");
  }
  const { data: chunk } = await db
    .from("raw_evidence_chunks")
    .select("storage_path, sha256")
    .eq("artifact_id", input.artifactId)
    .eq("section", input.section)
    .eq("chunk_index", input.chunkIndex)
    .maybeSingle();
  if (!chunk || (await rawEvidenceObjectSha256(chunk.storage_path)) !== chunk.sha256) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW chunk verification failed");
  }
  const now = new Date().toISOString();
  const { error } = await db
    .from("raw_evidence_chunks")
    .update({ status: "verified", uploaded_at: now, verified_at: now })
    .eq("artifact_id", input.artifactId)
    .eq("section", input.section)
    .eq("chunk_index", input.chunkIndex);
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return { verified: true };
}

export async function finalizeRawArtifact(
  input: DurableJobClaim & {
    jobId: string;
    artifactId: string;
    rootDigest: string;
    manifest: Record<string, unknown>;
  },
) {
  const { db } = await currentRawJob(input);
  const { data: artifact } = await db
    .from("raw_evidence_artifacts")
    .select("*")
    .eq("id", input.artifactId)
    .eq("job_id", input.jobId)
    .maybeSingle();
  const { data: chunks, error: chunksError } = await db
    .from("raw_evidence_chunks")
    .select("section, chunk_index, row_count, byte_size, sha256, previous_chunk_sha256, status")
    .eq("artifact_id", input.artifactId)
    .order("section")
    .order("chunk_index");
  if (
    !artifact ||
    chunksError ||
    !chunks?.length ||
    chunks.some((chunk) => chunk.status !== "verified")
  ) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW artifact incomplete");
  }
  if (artifact.status === "ready") {
    if (artifact.root_digest !== input.rootDigest) {
      throw new PipelineError("PARSER_INVALID_RESPONSE", "READY RAW artifact is immutable");
    }
    const { data: storedManifest, error: storedManifestError } = await db.storage
      .from("cs2-raw-evidence")
      .download(artifact.manifest_storage_path);
    const submitted = {
      ...input.manifest,
      audit_status: deriveRawArtifactAuditStatus(input.manifest),
    };
    if (
      storedManifestError ||
      !storedManifest ||
      stableRawArtifactJson(JSON.parse(await storedManifest.text())) !==
        stableRawArtifactJson(submitted)
    ) {
      throw new PipelineError("PARSER_INVALID_RESPONSE", "READY RAW artifact manifest conflict");
    }
    return artifact;
  }
  if (artifact.status === "failed")
    throw new PipelineError(
      "PARSER_INVALID_RESPONSE",
      "RAW artifact requires recovery initialization",
    );
  if (!["creating", "uploading", "verifying"].includes(artifact.status)) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW artifact lifecycle");
  }
  const { summaries, rootDigest: computed } = computeRawArtifactIntegrity(chunks);
  if (computed !== input.rootDigest || input.manifest["root_digest"] !== computed) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW root mismatch");
  }
  const manifestSections = input.manifest["sections"];
  const manifestIdentity =
    input.manifest["schema_version"] === 1 &&
    input.manifest["job_id"] === artifact.job_id &&
    input.manifest["upload_id"] === artifact.upload_id &&
    input.manifest["attempt_number"] === artifact.attempt_number &&
    input.manifest["demo_sha256"] === artifact.demo_sha256 &&
    input.manifest["status"] === "ready" &&
    input.manifest["raw_status"] === "ready" &&
    input.manifest["contract_version"] === 1 &&
    typeof input.manifest["parser"] === "object" &&
    Array.isArray(manifestSections) &&
    stableRawArtifactJson(manifestSections) === stableRawArtifactJson(summaries);
  if (!manifestIdentity)
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW manifest identity mismatch");
  const auditEvidence = input.manifest["audit_evidence"];
  const evidenceDigest = input.manifest["audit_evidence_digest"];
  if (
    !auditEvidence ||
    typeof auditEvidence !== "object" ||
    Array.isArray(auditEvidence) ||
    typeof evidenceDigest !== "string" ||
    rawArtifactSha256(stableRawArtifactJson(auditEvidence)) !== evidenceDigest
  ) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW audit evidence digest mismatch");
  }
  const totals = {
    total_chunks: chunks.length,
    total_rows: chunks.reduce((sum, chunk) => sum + Number(chunk.row_count), 0),
    total_bytes: chunks.reduce((sum, chunk) => sum + Number(chunk.byte_size), 0),
  };
  // The worker transports evidence; it cannot self-approve Canonical admission.
  const auditStatus = deriveRawArtifactAuditStatus(input.manifest);
  await uploadRawEvidenceManifest(
    artifact.manifest_storage_path,
    stableRawArtifactJson({ ...input.manifest, audit_status: auditStatus }),
  );
  const { data: ready, error } = await db
    .from("raw_evidence_artifacts")
    .update({
      ...totals,
      status: "ready",
      raw_status: "ready",
      audit_status: auditStatus,
      root_digest: computed,
      ready_at: new Date().toISOString(),
    })
    .eq("id", input.artifactId)
    .select("*")
    .single();
  if (error || !ready)
    throw new PipelineError("PERSISTENCE_ERROR", error?.message ?? "artifact finalize failed");
  return ready;
}
