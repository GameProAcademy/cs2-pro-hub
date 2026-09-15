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
import { demoToCanonicalBundle } from "@/lib/canonical/adapters/demo.adapter";
import { loadCanonicalCandidates } from "@/lib/canonical/candidates.server";
import { persistCanonicalObservation } from "@/lib/canonical/canonical.persistence.server";
import {
  canConvergeCrossSource,
  resolveAgainstAll,
  type MatchIdentityCandidate,
} from "@/lib/canonical/canonical.resolver";

import { PipelineError, toPipelineError } from "@/lib/pipeline/errors";
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
import type { RawParserOutput } from "@/lib/pipeline/types";
import type { Json } from "@/integrations/supabase/types";
import {
  assertParserWorkerReady,
  resolveParserAdapter,
} from "@/lib/pipeline/parser/remoteParser.server";
import { persistDemoProjection } from "@/lib/pipeline/persistence.server";
import {
  assertDemoIntegrity,
  computeStoredDemoSha256,
  createDemoSignedUrl,
  deleteDemo,
  demoExists,
  retainUntil,
} from "@/lib/pipeline/storage.server";
import { validateCanonicalMatch, validateDemoFile } from "@/lib/pipeline/validator";

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

async function finishCancellation(jobId: string, storagePath: string | null) {
  const db = await admin();
  let cleanupError: string | null = null;
  if (storagePath) {
    try {
      await deleteDemo(storagePath);
      await db
        .from("demo_jobs")
        .update({ storage_deleted_at: new Date().toISOString() })
        .eq("id", jobId);
    } catch (error) {
      cleanupError = toPipelineError(error).code;
    }
  }
  await db.rpc(
    "finish_demo_job_cancelled",
    cleanupError ? { _job_id: jobId, _cleanup_error: cleanupError } : { _job_id: jobId },
  );
}

async function persistRawEvidence(args: {
  jobId: string;
  uploadId: string;
  userId: string;
  expectedSha256: string | null;
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
  const decision = runRawForensicAudit(evidence);
  const approvedAt = decision.approved ? new Date().toISOString() : null;
  const { error } = await db.from("raw_demo_evidence_reports").upsert(
    {
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
      forensic_inventory: decision.forensicInventory as unknown as Json,
      raw_status: decision.status,
      raw_block_reasons: decision.reasons as unknown as Json,
      approved_for_canonical: decision.approved,
      approved_at: approvedAt,
      approved_by: decision.approved ? `server:raw-audit-v${decision.auditVersion}` : null,
      audit_version: decision.auditVersion,
    },
    { onConflict: "job_id" },
  );
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
  await db.from("demo_jobs").update({
    status: "blocked_raw_audit",
    stage: "raw_audit",
    error_code: "RAW_AUDIT_BLOCKED",
    error_message: decision.reasons.join(",").slice(0, 500),
    finished_at: new Date().toISOString(),
  }).eq("id", jobId).eq("status", "processing");
  await db.from("uploads").update({
    status: "blocked_raw_audit",
    error_code: "RAW_AUDIT_BLOCKED",
    error_message: decision.reasons.join(",").slice(0, 500),
  }).eq("id", uploadId);
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
  const { data, error } = await db.rpc("reconcile_demo_parse_queue" as never, {
    _limit: limit,
  } as never);
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return Number(data ?? 0);
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
export async function processJob(
  jobId: string,
  suppliedRaw?: RawParserOutput,
  durableClaim?: DurableJobClaim,
): Promise<JobProcessResult> {
  const db = await admin();
  const startedAt = Date.now();

  const { data: job } = await db
    .from("demo_jobs")
    .select(
      "id, upload_id, user_id, player_id, status, retry_count, max_retries, storage_path, demo_sha256, file_size, declared_participant_key, declared_nickname, queue_message_id, dispatch_attempt, worker_id, lease_expires_at",
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
    if (suppliedRaw) {
      raw = assertRawParserOutput(suppliedRaw);
    } else {
      const adapter = resolveParserAdapter();
      if (!adapter.isAvailable()) throw new PipelineError("PARSER_UNAVAILABLE");
      assertDeadline();
      await assertParserWorkerReady();
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
      raw = await adapter.parseDemo({
        storagePath: job.storage_path,
        signedUrl,
        uploadId: job.upload_id,
        fileSize: stored.size || (job.file_size ?? 0),
        demoSha256: job.demo_sha256,
        deadlineAt,
      });
    }
    await assertNotCancelled(jobId);

    // RAW evidence is its own immutable audit layer. Persist it before the APP
    // contract is normalized or any canonical fact can be written.
    await setStage(jobId, "raw_audit");
    const rawAudit = await persistRawEvidence({
      jobId,
      uploadId: job.upload_id,
      userId: job.user_id,
      expectedSha256: job.demo_sha256,
      raw,
    });
    await assertNotCancelled(jobId);
    if (!rawAudit.approved) {
      await blockForRawAudit(jobId, job.upload_id, rawAudit, durableClaim);
      return { jobId, status: "blocked_raw_audit", errorCode: "RAW_AUDIT_BLOCKED" };
    }
    assertRawAdmissionApproved(rawAudit);
    const rawApproval: RawAdmissionApproval = {
      approved: true,
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
      participants: match.players.map((demoPlayer) => ({
        participantKey: demoPlayer.steamId,
        steamId: demoPlayer.steamId,
        nickname: demoPlayer.name,
        team: demoPlayer.team,
      })),
      hasProfile: Boolean(player),
      profileSteamId: player?.steam_id ?? null,
      declaration,
    });
    // Metrics target: the DEMO player's own identifier — never a fabricated one.
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
      targetSteamId: steamId,
      internalPlayerId: steamId ? (player?.id ?? null) : null,
    });

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
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      throw new PipelineError(
        detail?.toLowerCase().includes("conflict")
          ? "CANONICAL_RESOLUTION_CONFLICT"
          : "CANONICAL_PERSISTENCE_ERROR",
        detail,
      );
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
      player_id: player?.id ?? null,
      resolved_steam_id: steamId,
      identity_status: attachment.state === "attached" ? "resolved" : "unresolved",
      attachment_state: attachment.state,
      attachment_method: attachment.method,
      attachment_confidence: confidenceScore(attachment.confidence),
      attachment_confidence_label: attachment.confidence,
      attachment_source: attachment.source,
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
    if (steamId && player) {
      await setStage(jobId, "metrics");
      assertDeadline();
      let metrics;
      let features;
      try {
        metrics = computeMetrics(match, steamId);
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

    await cleanupExpiredDemos(5);
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
      const { error: failError } = await db.rpc("fail_demo_parse_message" as never, {
        _job_id: jobId,
        _message_id: durableClaim.messageId,
        _attempt: durableClaim.attempt,
        _worker_id: durableClaim.workerId,
        _error_code: pipelineError.code,
        _error_message: pipelineError.detail ?? null,
        _permanent: pipelineError.permanent,
      } as never);
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
        retain_until: retainUntil(false),
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
