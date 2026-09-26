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
  DEMO_CLEANUP_AUTHORITY,
  DEMO_CLEANUP_CLAIM_SECONDS,
  DEMO_CLEANUP_EXECUTION_ENABLED,
  JOB_STALE_MINUTES,
  MAX_CONCURRENT_DEMO_JOBS,
  MAX_JOB_RETRIES,
  SCHEMA_VERSION,
} from "@/config/pipeline";
import { demoToCanonicalBundle } from "@/lib/canonical/adapters/demo.adapter";
import { loadCanonicalCandidates } from "@/lib/canonical/candidates.server";
import { persistCanonicalObservation } from "@/lib/canonical/canonical.persistence.server";
import {
  canConvergeCrossSource,
  resolveAgainstAll,
  type MatchIdentityCandidate,
} from "@/lib/canonical/canonical.resolver";

import { PipelineError, toPipelineError } from "@/lib/pipeline/errors";
import { appExecutionRecorder } from "@/lib/pipeline/h3e91ExecutionRecorder.server";
import { extractFeatures } from "@/lib/pipeline/features";
import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import {
  assertRawAdmissionApproved,
  assertRawDemoEvidence,
  runRawForensicAudit,
  type RawAdmissionApproval,
  type RawAdmissionDecision,
} from "@/lib/pipeline/rawEvidence";
import { assertRawParserOutput } from "@/lib/pipeline/parser/adapter";
import {
  assertHotDemoPayload,
  assertRawArtifactReference,
  hotToRawParserOutput,
  rawArtifactApproval,
  verifyRawArtifact,
} from "@/lib/pipeline/rawArtifact.server";
import type { DurableDemoCompletionV1, RawParserOutput } from "@/lib/pipeline/types";
import type { Json } from "@/integrations/supabase/types";
import {
  assertParserWorkerReady,
  resolveParserAdapter,
} from "@/lib/pipeline/parser/remoteParser.server";
import { assertParserIdentityConsistency } from "@/lib/pipeline/parser/parserEndpoint";
import { persistDemoProjection } from "@/lib/pipeline/persistence.server";
import {
  assertDemoIntegrity,
  computeStoredDemoSha256,
  createDemoSignedUrl,
  deleteDemoVerified,
  demoExists,
  retainUntil,
} from "@/lib/pipeline/storage.server";
import {
  validateCanonicalBundle,
  validateCanonicalMatch,
  validateDemoFile,
} from "@/lib/pipeline/validator";

import {
  confidenceScore,
  resolvePlayerAttachment,
  type AttachmentReason,
  type AttachmentState,
  type PlayerDeclaration,
} from "@/lib/pipeline/attachment";

export type JobStage =
  | "queued"
  | "validating"
  | "parsing"
  | "raw_audit"
  | "normalizing"
  | "metrics"
  | "persisting"
  | "cleanup"
  | "done"
  | "cancel_requested"
  | "cancelled"
  | "failed";

export interface JobProcessResult {
  jobId: string;
  status: "processed" | "failed" | "cancelled" | "blocked_raw_audit" | "skipped";
  errorCode?: string;
  matchId?: string;
  /** Whether the canonical match got a per-player projection in this run. */
  attachmentState?: AttachmentState;
  attachmentReason?: AttachmentReason | null;
}

export interface DurableJobClaim {
  messageId: number;
  /** Technical delivery/lease attempt for the current queue message. */
  attempt: number;
  workerId: string;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function setStage(jobId: string, stage: JobStage) {
  const db = await admin();
  await db
    .from("demo_jobs")
    .update({ stage, heartbeat_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "processing");
}

class JobCancelledError extends Error {}

async function assertNotCancelled(jobId: string) {
  const db = await admin();
  const { data } = await db.from("demo_jobs").select("status").eq("id", jobId).maybeSingle();
  if (data?.status === "cancel_requested" || data?.status === "cancelled") {
    throw new JobCancelledError();
  }
}

type CleanupClaim = {
  job_id: string;
  upload_id: string;
  user_id: string;
  storage_path: string;
  claim_token: string;
  metadata_mismatch: boolean;
};

export type DemoCleanupSummary = {
  authority: typeof DEMO_CLEANUP_AUTHORITY;
  executionEnabled: boolean;
  candidates: number;
  verified: number;
  alreadyAbsent: number;
  failed: number;
  metadataMismatches: number;
};

function cleanupClaim(value: unknown): CleanupClaim | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row["job_id"] !== "string" ||
    typeof row["upload_id"] !== "string" ||
    typeof row["user_id"] !== "string" ||
    typeof row["storage_path"] !== "string" ||
    typeof row["claim_token"] !== "string"
  ) {
    return null;
  }
  return {
    job_id: row["job_id"],
    upload_id: row["upload_id"],
    user_id: row["user_id"],
    storage_path: row["storage_path"],
    claim_token: row["claim_token"],
    metadata_mismatch: row["metadata_mismatch"] === true,
  };
}

function cleanupErrorCode(error: unknown): string {
  const detail = error instanceof PipelineError ? error.detail : undefined;
  if (detail === "PATH_OWNERSHIP_MISMATCH") return "PATH_OWNERSHIP_MISMATCH";
  if (detail === "DELETE_NOT_VERIFIED") return "DELETE_NOT_VERIFIED";
  return "DELETE_FAILED";
}

async function executeCleanupClaim(claim: CleanupClaim): Promise<"verified" | "alreadyAbsent"> {
  const db = await admin();
  try {
    const outcome = await deleteDemoVerified(claim.storage_path, claim.user_id, claim.upload_id);
    const { data, error } = await db.rpc(
      "finish_demo_cleanup_verified" as never,
      {
        _job_id: claim.job_id,
        _claim_token: claim.claim_token,
        _outcome: outcome,
      } as never,
    );
    if (error || data !== true) {
      throw new PipelineError("CLEANUP_ERROR", error?.message ?? "CLEANUP_CLAIM_STALE");
    }
    return outcome === "ALREADY_ABSENT" ? "alreadyAbsent" : "verified";
  } catch (error) {
    const code = cleanupErrorCode(error);
    await db.rpc(
      "fail_demo_cleanup" as never,
      {
        _job_id: claim.job_id,
        _claim_token: claim.claim_token,
        _error_code: code,
      } as never,
    );
    console.error(`[demo-cleanup] job=${claim.job_id} code=${code}`);
    throw error;
  }
}

async function finishCancellation(jobId: string, _storagePath: string | null) {
  const db = await admin();
  await db.rpc("finish_demo_job_cancelled", { _job_id: jobId });
}

async function persistRawEvidence(args: {
  jobId: string;
  uploadId: string;
  userId: string;
  expectedSha256: string | null;
  attempt: number;
  raw: import("@/lib/pipeline/types").RawParserOutput;
}): Promise<RawAdmissionDecision> {
  const evidence = assertRawDemoEvidence(args.raw.raw_evidence);
  const manifest = evidence.manifest;
  if (!args.expectedSha256 || manifest.demo_sha256 !== args.expectedSha256.toLowerCase()) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "raw evidence demo identity mismatch");
  }
  if (
    manifest.parser_name !== args.raw.parser.name ||
    manifest.parser_version !== args.raw.parser.version ||
    manifest.parser_revision !== (args.raw.parser.revision ?? null) ||
    manifest.contract_version !== args.raw.contract_version
  ) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "raw evidence parser identity mismatch");
  }
  const db = await admin();
  const decision = await runRawForensicAudit(evidence);
  const approvedAt = decision.approved ? new Date().toISOString() : null;
  const { error } = await db.from("raw_demo_evidence_reports").insert({
    job_id: args.jobId,
    upload_id: args.uploadId,
    user_id: args.userId,
    demo_sha256: manifest.demo_sha256,
    evidence_version: evidence.evidence_version,
    parser_name: manifest.parser_name,
    parser_version: manifest.parser_version,
    parser_revision: manifest.parser_revision,
    contract_version: manifest.contract_version,
    manifest: evidence.manifest as unknown as Json,
    event_coverage: evidence.event_coverage as unknown as Json,
    raw_events: evidence.raw_events as unknown as Json,
    raw_player_info: evidence.raw_player_info as unknown as Json,
    player_coverage: evidence.player_coverage as unknown as Json,
    tick_coverage: evidence.tick_coverage as unknown as Json,
    tick_samples: evidence.tick_samples as unknown as Json,
    grenade_coverage: evidence.grenade_coverage as unknown as Json,
    grenade_samples: evidence.grenade_samples as unknown as Json,
    round_evidence: evidence.round_evidence as unknown as Json,
    economy_coverage: evidence.economy_coverage as unknown as Json,
    field_mappings: evidence.field_mappings as unknown as Json,
    gates: evidence.gates as unknown as Json,
    deterministic_digest: evidence.deterministic_digest,
    audited_evidence_digest: decision.evidenceDigest,
    forensic_inventory: decision.forensicInventory as unknown as Json,
    raw_status: decision.status,
    raw_block_reasons: decision.reasons as unknown as Json,
    approved_for_canonical: decision.approved,
    approved_at: approvedAt,
    approved_by: decision.approved ? `server:raw-audit-v${decision.auditVersion}` : null,
    audit_version: decision.auditVersion,
    attempt: args.attempt,
    raw_audit_status: decision.auditStatus,
  });
  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await db
      .from("raw_demo_evidence_reports")
      .select(
        "deterministic_digest, audited_evidence_digest, raw_status, raw_audit_status, audit_version, forensic_inventory, raw_block_reasons",
      )
      .eq("job_id", args.jobId)
      .eq("attempt", args.attempt)
      .eq("evidence_version", evidence.evidence_version)
      .maybeSingle();
    if (
      existingError ||
      !existing ||
      existing.deterministic_digest !== evidence.deterministic_digest ||
      existing.audited_evidence_digest !== evidence.deterministic_digest
    ) {
      throw new PipelineError("CANONICAL_PERSISTENCE_ERROR", "immutable raw evidence conflict");
    }
    return {
      status: existing.raw_status as RawAdmissionDecision["status"],
      auditStatus: existing.raw_audit_status as RawAdmissionDecision["auditStatus"],
      approved: existing.raw_audit_status === "APPROVED",
      auditVersion: existing.audit_version,
      reasons: Array.isArray(existing.raw_block_reasons)
        ? existing.raw_block_reasons.filter((item): item is string => typeof item === "string")
        : [],
      evidenceDigest: existing.deterministic_digest,
      forensicInventory: existing.forensic_inventory as Record<string, Json>,
    };
  }
  if (error)
    throw new PipelineError("CANONICAL_PERSISTENCE_ERROR", `raw evidence: ${error.message}`);
  return decision;
}

async function blockForRawAudit(
  jobId: string,
  uploadId: string,
  decision: RawAdmissionDecision,
  durableClaim?: DurableJobClaim,
): Promise<void> {
  const db = await admin();
  if (durableClaim) {
    const { data, error } = await db.rpc("block_demo_job_raw_audit", {
      _job_id: jobId,
      _message_id: durableClaim.messageId,
      _attempt: durableClaim.attempt,
      _worker_id: durableClaim.workerId,
      _reasons: decision.reasons,
    });
    if (error || !(data as { accepted?: boolean } | null)?.accepted) {
      throw new PipelineError("JOB_STALE", error?.message ?? "RAW block rejected");
    }
    return;
  }
  await db
    .from("demo_jobs")
    .update({
      status: "blocked_raw_audit",
      stage: "raw_audit",
      error_code: "RAW_AUDIT_BLOCKED",
      error_message: decision.reasons.join(",").slice(0, 500),
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "processing");
  await db
    .from("uploads")
    .update({
      status: "blocked_raw_audit",
      error_code: "RAW_AUDIT_BLOCKED",
      error_message: decision.reasons.join(",").slice(0, 500),
    })
    .eq("id", uploadId);
}

/** Re-queues jobs stuck in `processing` beyond the stale window. */
export async function recoverStaleJobs(): Promise<number> {
  const db = await admin();
  const { data, error } = await db.rpc("recover_stale_demo_jobs", {
    _stale_minutes: JOB_STALE_MINUTES,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return Number(data ?? 0);
}

/** Ensures pending durable jobs have exactly one queue message for their attempt. */
export async function reconcileDurableDemoQueue(limit = 25): Promise<number> {
  const db = await admin();
  const { data, error } = await db.rpc(
    "reconcile_demo_parse_queue" as never,
    {
      _limit: limit,
    } as never,
  );
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return Number(data ?? 0);
}

/** Fails old upload reservations only when no job or Storage object exists. */
export async function reconcileOrphanDemoUploads(
  olderThanMinutes = JOB_STALE_MINUTES,
  limit = 25,
): Promise<number> {
  const db = await admin();
  const { data, error } = await db.rpc(
    "reconcile_orphan_demo_uploads" as never,
    {
      _older_than_minutes: olderThanMinutes,
      _limit: limit,
    } as never,
  );
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return Number(data ?? 0);
}

/** Claims, deletes and physically verifies eligible temporary demo files. */
export async function cleanupExpiredDemos(limit = 25): Promise<DemoCleanupSummary> {
  if (!DEMO_CLEANUP_EXECUTION_ENABLED) {
    return {
      authority: DEMO_CLEANUP_AUTHORITY,
      executionEnabled: false,
      candidates: 0,
      verified: 0,
      alreadyAbsent: 0,
      failed: 0,
      metadataMismatches: 0,
    };
  }
  const db = await admin();
  const { data, error } = await db.rpc(
    "claim_demo_cleanup_jobs" as never,
    {
      _limit: limit,
      _claim_seconds: DEMO_CLEANUP_CLAIM_SECONDS,
    } as never,
  );
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  const payload = data as { items?: unknown[] } | null;
  const claims = (payload?.items ?? []).map(cleanupClaim).filter((claim) => claim !== null);
  const summary: DemoCleanupSummary = {
    authority: DEMO_CLEANUP_AUTHORITY,
    executionEnabled: true,
    candidates: claims.length,
    verified: 0,
    alreadyAbsent: 0,
    failed: 0,
    metadataMismatches: claims.filter((claim) => claim.metadata_mismatch).length,
  };
  for (const claim of claims) {
    try {
      const outcome = await executeCleanupClaim(claim);
      summary[outcome] += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
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
export async function processJob(
  jobId: string,
  suppliedRaw?: RawParserOutput | DurableDemoCompletionV1,
  durableClaim?: DurableJobClaim,
): Promise<JobProcessResult> {
  const db = await admin();
  const startedAt = Date.now();
  let canonicalPersisted = false;

  const { data: job } = await db
    .from("demo_jobs")
    .select(
      "id, upload_id, user_id, player_id, status, retry_count, max_retries, storage_path, demo_sha256, file_size, declared_participant_key, declared_nickname, attachment_confirmation_status, queue_message_id, attempt_number, dispatch_attempt, worker_id, lease_expires_at",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (!job) return { jobId, status: "skipped", errorCode: "DEMO_NOT_FOUND" };
  if (job.status === "processed") return { jobId, status: "skipped" };
  if (job.status === "cancel_requested" || job.status === "cancelled") {
    if (job.status === "cancel_requested") await finishCancellation(jobId, job.storage_path);
    return { jobId, status: "cancelled" };
  }

  if (suppliedRaw && !durableClaim) {
    return { jobId, status: "skipped", errorCode: "PARSER_INVALID_RESPONSE" };
  }
  if (durableClaim) {
    const currentClaim =
      job.status === "processing" &&
      Number(job.queue_message_id) === durableClaim.messageId &&
      job.dispatch_attempt === durableClaim.attempt &&
      job.worker_id === durableClaim.workerId &&
      Boolean(job.lease_expires_at) &&
      new Date(job.lease_expires_at ?? 0).getTime() > Date.now();
    if (!currentClaim) return { jobId, status: "skipped", errorCode: "JOB_STALE" };
  }

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

  // FASE 2.7.1C — REAL GLOBAL DEADLINE. One absolute budget for the WHOLE job,
  // derived from the stale threshold and starting at job entry, so no stage
  // (storage lookup, streamed hashing, signed URL, parser, normalization,
  // persistence, projection) can hold the single concurrency slot until the
  // stale sweeper has to rescue it. It is checked BEFORE each expensive step
  // and between stages. Neither the Storage SDK nor the parser contract exposes
  // an AbortSignal, so an already-started call is not cancelled mid-flight: the
  // budget is enforced at every boundary instead.
  const deadlineAt = startedAt + JOB_STALE_MINUTES * 60_000;
  const assertDeadline = () => {
    if (Date.now() > deadlineAt) throw new PipelineError("JOB_DEADLINE_EXCEEDED");
  };

  try {
    if (!job.storage_path) throw new PipelineError("DEMO_NOT_FOUND", "missing storage path");
    await assertNotCancelled(jobId);

    let raw: RawParserOutput;
    let artifactCompletion: DurableDemoCompletionV1 | null = null;
    if (suppliedRaw) {
      if ("hot" in suppliedRaw && "raw" in suppliedRaw) {
        const hot = assertHotDemoPayload(suppliedRaw.hot);
        const artifact = assertRawArtifactReference(suppliedRaw.raw);
        artifactCompletion = { hot, raw: artifact };
        raw = hotToRawParserOutput(hot);
      } else {
        raw = assertRawParserOutput(suppliedRaw);
      }
    } else {
      const adapter = resolveParserAdapter();
      if (!adapter.isAvailable()) throw new PipelineError("PARSER_UNAVAILABLE");
      assertDeadline();
      const workerIdentity = await assertParserWorkerReady();
      await assertNotCancelled(jobId);

      assertDeadline();
      const stored = await demoExists(job.storage_path);
      if (!stored) throw new PipelineError("DEMO_NOT_FOUND");
      validateDemoFile(job.storage_path, stored.size || (job.file_size ?? 0));
      if (job.demo_sha256) {
        assertDeadline();
        const actual = await computeStoredDemoSha256(job.storage_path);
        assertDeadline();
        assertDemoIntegrity(actual, job.demo_sha256);
      }

      await setStage(jobId, "parsing");
      assertDeadline();
      const signedUrl = await createDemoSignedUrl(job.storage_path);
      assertDeadline();
      // The Railway production image has not been independently matched to this
      // source. Never dispatch to an uninstrumented deployed parser.
      if (process.env["NODE_ENV"] === "production") {
        throw new PipelineError("PARSER_UNAVAILABLE", "H3E91_DEPLOYED_SOURCE_PARITY_UNVERIFIED");
      }
      const record = appExecutionRecorder({
        jobId, uploadId: job.upload_id, attemptNumber: job.attempt_number,
        demoSha256: job.demo_sha256, fileSize: stored.size || (job.file_size ?? 0),
        parserName: workerIdentity.name, parserVersion: workerIdentity.version,
        parserRevision: workerIdentity.revision,
      });
      await record("EXECUTION_INTENT");
      await record("EXECUTION_STARTED");
      try {
        raw = await adapter.parseDemo({
          storagePath: job.storage_path,
          signedUrl,
          uploadId: job.upload_id,
          fileSize: stored.size || (job.file_size ?? 0),
          demoSha256: job.demo_sha256,
          deadlineAt,
        });
        await record("EXECUTION_FINISHED", "PARSE_SUCCEEDED");
      } catch (parseError) {
        await record("EXECUTION_FAILED", "PARSE_FAILED");
        throw parseError;
      }
      assertParserIdentityConsistency(workerIdentity, raw.parser, raw.contract_version);
    }
    await assertNotCancelled(jobId);

    // RAW evidence is its own immutable audit layer. Persist it before the APP
    // contract is normalized or any canonical fact can be written.
    await setStage(jobId, "raw_audit");
    const rawAudit = artifactCompletion
      ? await verifyRawArtifact({
          ref: artifactCompletion.raw,
          hot: artifactCompletion.hot,
          jobId,
          uploadId: job.upload_id,
          userId: job.user_id,
          attemptNumber: job.attempt_number,
          expectedSha256: job.demo_sha256,
        })
      : await persistRawEvidence({
          jobId,
          uploadId: job.upload_id,
          userId: job.user_id,
          expectedSha256: job.demo_sha256,
          attempt: job.attempt_number,
          raw,
        });
    await assertNotCancelled(jobId);
    if (!rawAudit.approved) {
      await blockForRawAudit(jobId, job.upload_id, rawAudit, durableClaim);
      return { jobId, status: "blocked_raw_audit", errorCode: "RAW_AUDIT_BLOCKED" };
    }
    assertRawAdmissionApproved(rawAudit);
    const rawApproval: RawAdmissionApproval = artifactCompletion
      ? rawArtifactApproval(rawAudit, artifactCompletion.raw.artifact_id, job.upload_id)
      : {
          approved: true,
          auditStatus: "APPROVED",
          auditVersion: rawAudit.auditVersion,
          evidenceDigest: rawAudit.evidenceDigest,
        };

    await setStage(jobId, "normalizing");
    assertDeadline();

    const match = normalizeParserOutput(raw);
    validateCanonicalMatch(match);

    // FASE 2.7.2A — PLAYER ATTACHMENT IS A SEPARATE DIMENSION.
    // The CanonicalMatch is source-neutral and does NOT belong to a player, so
    // the absence of a proven Steam ID can never invalidate the match facts.
    // Identity is resolved here only to decide whether a per-player projection
    // is possible. A Steam ID proven on the profile wins; otherwise an EXPLICIT
    // declaration by the user may attach. Nothing is ever inferred.
    const { data: player } = await db
      .from("player_profiles")
      .select("id, steam_id")
      .eq("user_id", job.user_id)
      .maybeSingle();
    const declaration: PlayerDeclaration | null = job.declared_participant_key
      ? { kind: "participant", participantKey: job.declared_participant_key }
      : job.declared_nickname
        ? { kind: "nickname", nickname: job.declared_nickname }
        : null;
    const attachment = resolvePlayerAttachment({
      participants: match.players.flatMap((demoPlayer) => {
        const participantKey = demoPlayer.participantKey ?? demoPlayer.steamId;
        return participantKey
          ? [
              {
                participantKey,
                steamId: demoPlayer.steamId,
                nickname: demoPlayer.name,
                team: demoPlayer.team,
              },
            ]
          : [];
      }),
      hasProfile: Boolean(player),
      profileSteamId: player?.steam_id ?? null,
      declaration,
      automaticMatchRejected: job.attachment_confirmation_status === "user_rejected",
    });
    // Metrics target: the DEMO participant's own source-local key. Steam remains
    // optional evidence and is never substituted for the internal player id.
    const participantKey = attachment.state === "attached" ? attachment.participantKey : null;
    const steamId = attachment.state === "attached" ? attachment.steamId : null;

    // FASE 2.7 — after RAW evidence passes explicit admission, the canonical
    // engine is the ONLY writer of canonical facts. It resolves/attaches the observation transactionally and
    // returns the canonical match id; the demo no longer inserts a match of its
    // own, so a demo that converges with FACEIT cannot create a second row.
    await setStage(jobId, "persisting");
    assertDeadline();
    const bundle = demoToCanonicalBundle({
      parsed: match,
      // A demo's identity IS its file hash; it has no external match id.
      fingerprint: job.demo_sha256 ?? null,
      // Both optional: an unattached observation is still a complete match.
      targetParticipantKey: participantKey,
      internalPlayerId: participantKey ? (player?.id ?? null) : null,
    });
    validateCanonicalBundle(bundle.match, bundle.rounds, bundle.events);

    // FASE 2.7 — the DEMO path now uses the SAME Match Identity Resolver as
    // FACEIT instead of persisting blind. Discovery is source-neutral; only an
    // unambiguous EXACT_MATCH may attach (`canConvergeCrossSource`), and an
    // ambiguous/conflicting decision fails the job for human review rather than
    // fusing two histories.
    let attachMatchId: string | null = null;
    try {
      const candidates = await loadCanonicalCandidates(
        db,
        bundle.match.playedAt,
        bundle.participants.map((p) => p.participantKey),
      );
      const incoming: MatchIdentityCandidate = {
        canonicalMatchId: "",
        participantSteamIds: bundle.participants.map((p) => p.participantKey),
        source: "demo",
        externalMatchId: null,
        fingerprint: bundle.observation.fingerprint,
        map: bundle.match.map,
        playedAt: bundle.match.playedAt,
        startedAt: bundle.match.startedAt,
        finishedAt: bundle.match.finishedAt,
        roundCount: bundle.match.roundCount,
        scoreTeamA: bundle.match.scoreTeamA,
        scoreTeamB: bundle.match.scoreTeamB,
      };
      const resolved = resolveAgainstAll(incoming, candidates);
      if (resolved.decision.resolution === "CONFLICT") {
        throw new PipelineError(
          "CANONICAL_RESOLUTION_CONFLICT",
          resolved.decision.signals.join(","),
        );
      }
      if (resolved.candidate && canConvergeCrossSource(resolved.decision)) {
        attachMatchId = resolved.candidate.canonicalMatchId ?? null;
      }
    } catch (error) {
      if (error instanceof PipelineError) throw error;
      throw new PipelineError(
        "IDENTITY_RESOLUTION_ERROR",
        error instanceof Error ? error.message : undefined,
      );
    }

    let canonical;
    try {
      assertDeadline();
      canonical = await persistCanonicalObservation({
        bundle,
        // Visibility/RLS of the uploader is preserved even without a Steam link.
        ownerPlayerId: player?.id ?? null,
        uploadId: job.upload_id,
        attachMatchId,
        rawApproval,
      });
      // From this point on, Canonical has committed. A later finalization
      // failure must be reconciled/retried, not converted into a fresh failed
      // ingestion attempt that can fork the same evidence.
      canonicalPersisted = true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      throw new PipelineError(
        detail?.toLowerCase().includes("conflict")
          ? "CANONICAL_RESOLUTION_CONFLICT"
          : "CANONICAL_PERSISTENCE_ERROR",
        detail,
      );
    }

    if (
      attachment.state === "attached" &&
      attachment.source === "steam" &&
      attachment.method === "steam_id_confirmed"
    ) {
      const { error: identityEventError } = await db.rpc("record_demo_identity_event", {
        _job_id: jobId,
        _user_id: job.user_id,
        _event_key: `auto:steam:${attachment.participantKey}`,
        _decision: {
          status: "auto_resolved",
          confirmation_status: "pending_confirmation",
          participant_key: attachment.participantKey,
          nickname: attachment.observedNickname,
          method: attachment.method,
          source: attachment.source,
          confidence_label: attachment.confidence,
          confidence_score: confidenceScore(attachment.confidence),
          evidence: { identity_provider: "steam" },
        },
      });
      if (identityEventError) {
        throw new PipelineError("IDENTITY_RESOLUTION_ERROR", identityEventError.message);
      }
    }

    // PLAYER ATTACHMENT — metrics, features and the per-player projection only
    // exist when the user's Steam ID was PROVEN inside this demo. Without it the
    // job still ends successfully: the match is canonicalised and simply carries
    // no projection yet, with the real reason recorded.
    let projectedMatchId = canonical.matchId;
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;
    const finalResult = {
      finished_at: finishedAt,
      duration_ms: durationMs,
      match_id: canonical.matchId,
      player_id: participantKey ? (player?.id ?? null) : null,
      resolved_steam_id: steamId,
      identity_status: attachment.state === "attached" ? "resolved" : "unresolved",
      attachment_state: attachment.state,
      attachment_method: attachment.method,
      attachment_confidence: confidenceScore(attachment.confidence),
      attachment_confidence_label: attachment.confidence,
      attachment_source: attachment.source,
      attachment_confirmation_status:
        attachment.method === "steam_id_confirmed"
          ? "pending_confirmation"
          : attachment.state === "attached"
            ? "manual_selected"
            : "not_required",
      attachment_participant_key: attachment.participantKey,
      observed_nickname: attachment.observedNickname,
      attachment_reason: attachment.reason,
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
      retain_until: retainUntil(true),
    } satisfies Json;
    let finalized = false;
    if (participantKey && player) {
      await setStage(jobId, "metrics");
      assertDeadline();
      let metrics;
      let features;
      try {
        metrics = computeMetrics(match, participantKey);
      } catch (error) {
        throw new PipelineError(
          "METRICS_ERROR",
          error instanceof Error ? error.message : undefined,
        );
      }
      try {
        features = extractFeatures(match, metrics);
      } catch (error) {
        throw new PipelineError(
          "FEATURES_ERROR",
          error instanceof Error ? error.message : undefined,
        );
      }

      await setStage(jobId, "persisting");
      assertDeadline();
      const persisted = await persistDemoProjection({
        matchId: canonical.matchId,
        uploadId: job.upload_id,
        playerId: player.id,
        participantKey,
        steamId,
        match,
        metrics,
        features,
        jobId,
        jobResult: finalResult,
      });
      projectedMatchId = persisted.matchId;
      finalized = true;
    }

    if (!finalized) {
      const { data, error: finishError } = await db.rpc("finish_demo_job_processed", {
        _job_id: jobId,
        _result: { ...finalResult, match_id: projectedMatchId },
      });
      if (finishError) throw new PipelineError("PERSISTENCE_ERROR", finishError.message);
      finalized = data === true;
    }

    if (!finalized) {
      await finishCancellation(jobId, job.storage_path);
      return { jobId, status: "cancelled", matchId: projectedMatchId };
    }

    return {
      jobId,
      status: "processed",
      matchId: projectedMatchId,
      attachmentState: attachment.state,
      attachmentReason: attachment.reason,
    };
  } catch (error) {
    if (error instanceof JobCancelledError) {
      await finishCancellation(jobId, job.storage_path);
      return { jobId, status: "cancelled" };
    }
    const pipelineError = toPipelineError(error);
    if (durableClaim) {
      if (canonicalPersisted) {
        // Canonical and job finalization are separate database transactions.
        // If the second transaction fails, keep the durable claim alive and let
        // queue visibility/stale recovery retry the idempotent finalization.
        await db
          .from("demo_jobs")
          .update({ stage: "persisting", heartbeat_at: new Date().toISOString() })
          .eq("id", jobId)
          .eq("status", "processing");
        console.warn("[pipeline] canonical committed; durable finalization deferred", {
          jobId,
          code: pipelineError.code,
        });
        return { jobId, status: "failed", errorCode: pipelineError.code };
      }

      const { error: failError } = await db.rpc(
        "fail_demo_parse_message" as never,
        {
          _job_id: jobId,
          _message_id: durableClaim.messageId,
          _attempt: durableClaim.attempt,
          _worker_id: durableClaim.workerId,
          _error_code: pipelineError.code,
          _error_message: pipelineError.detail ?? null,
          _permanent: pipelineError.permanent,
        } as never,
      );
      if (failError) console.error("[pipeline] durable failure transition failed", { jobId });
      return { jobId, status: "failed", errorCode: pipelineError.code };
    }
    const canRetry =
      !pipelineError.permanent && job.retry_count < (job.max_retries ?? MAX_JOB_RETRIES);

    const { data: failedRows } = await db
      .from("demo_jobs")
      .update({
        status: canRetry ? "pending" : "failed",
        stage: canRetry ? "queued" : "failed",
        retry_count: job.retry_count + 1,
        error_code: pipelineError.code,
        error_message: pipelineError.detail ?? null,
        finished_at: canRetry ? null : new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        retain_until: canRetry ? null : retainUntil(false),
      })
      .eq("id", jobId)
      .eq("status", "processing")
      .select("id");

    if (!failedRows || failedRows.length === 0) {
      await finishCancellation(jobId, job.storage_path);
      return { jobId, status: "cancelled" };
    }

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
