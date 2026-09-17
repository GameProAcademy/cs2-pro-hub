/**
 * FASE 2.7.2 — GATE 02-B — PROTECTED REAL `.dem` E2E RUNNER.
 *
 * WHAT THIS IS
 * ------------
 * A master-admin-only tool that requests the REAL durable lifecycle for one
 * already uploaded demo job and then reads the REAL database back as evidence.
 * There is no fake parser, synthetic payload or in-process bypass of the queue.
 *
 * WHY IT EXISTS
 * -------------
 * The cron path is asynchronous and swallows timing, so proving the gate needed
 * a synchronous, auditable run whose verdict cannot be softened. The verdict
 * rules live in `@/lib/pipeline/e2e` (pure, unit-tested); this module only
 * gathers real observations.
 *
 * SECURITY
 * --------
 * Every function re-verifies an active profile plus authoritative
 * `is_admin_master` server-side (fail-closed), writes an audit row for the run,
 * and never returns a token, a signed URL or the private parser endpoint beyond
 * its origin.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { RawDemoEvidence } from "@/lib/pipeline/rawEvidence";
import { waitForTerminalExecution } from "@/lib/pipeline/e2eWaiting";
import {
  EMPTY_EVIDENCE,
  evaluateE2ERun,
  evaluateIdempotency,
  type E2EEvaluation,
  type E2EEvidence,
  type E2EExpectation,
  type E2EJobState,
} from "@/lib/pipeline/e2e";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

const FORBIDDEN = "ADMIN_FORBIDDEN";
const UNAVAILABLE = "ADMIN_UNAVAILABLE";
const DEFAULT_E2E_WAIT_TIMEOUT_MS = 20 * 60 * 1_000;
const DEFAULT_E2E_POLL_INTERVAL_MS = 4_000;

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

export interface E2EPreflight {
  endpoint: string;
  healthy: boolean;
  healthStatus: number | null;
  identity: {
    name: string | null;
    version: string | null;
    revision: string | null;
    contractVersion: number | null;
  } | null;
  error: string | null;
  expected: {
    name: string;
    version: string;
    contractVersion: number;
    revision: string | null;
    revisionRequired: boolean;
  };
  versions: {
    ingestionSchema: number;
    canonicalSchema: number;
    metrics: string;
    features: string;
    analysis: string;
  };
  parserAvailable: boolean;
}

/** GATE 1E.1 preflight, reported exactly as the parse path would enforce it. */
export const getDemoE2EPreflight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<E2EPreflight> => {
    await requireMaster(context as Ctx);
    const { probeParserWorker, resolveParserAdapter } =
      await import("@/lib/pipeline/parser/remoteParser.server");
    const { expectedParserContract } = await import("@/lib/pipeline/parser/adapter");
    const {
      PARSER_CONTRACT_VERSION,
      SCHEMA_VERSION,
      METRICS_VERSION,
      FEATURES_VERSION,
      ANALYSIS_VERSION,
    } = await import("@/config/pipeline");
    const { CANONICAL_SCHEMA_VERSION } = await import("@/lib/canonical/canonical.versions");

    const probe = await probeParserWorker();
    const expected = expectedParserContract();

    return {
      endpoint: probe.endpoint,
      healthy: probe.healthy,
      healthStatus: probe.healthStatus,
      identity: probe.identity
        ? {
            name: probe.identity.name,
            version: probe.identity.version,
            revision: probe.identity.revision,
            contractVersion: probe.identity.contractVersion,
          }
        : null,
      error: probe.error,
      expected: {
        name: expected.name,
        version: expected.version,
        contractVersion: PARSER_CONTRACT_VERSION,
        revision: expected.revision ?? null,
        revisionRequired: expected.revisionRequired === true,
      },
      versions: {
        ingestionSchema: SCHEMA_VERSION,
        canonicalSchema: CANONICAL_SCHEMA_VERSION,
        metrics: METRICS_VERSION,
        features: FEATURES_VERSION,
        analysis: ANALYSIS_VERSION,
      },
      parserAvailable: resolveParserAdapter().isAvailable(),
    };
  });

interface AdminDb {
  db: SupabaseClient<Database>;
}

async function adminDb(): Promise<AdminDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as unknown as SupabaseClient<Database> };
}

async function countRows(
  db: SupabaseClient<Database>,
  table: "match_participants" | "match_rounds" | "round_players" | "round_events",
  matchIds: string[],
): Promise<number> {
  if (matchIds.length === 0) return 0;
  const { count } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .in("match_id", matchIds);
  return count ?? 0;
}

/**
 * Reads the REAL canonical + projection footprint of one demo.
 *
 * The demo's canonical identity is its SHA-256 fingerprint, so evidence is
 * reached through `match_sources` (fingerprint or upload id) instead of trusting
 * whatever the job row claims.
 */
async function collectEvidence(args: {
  db: SupabaseClient<Database>;
  uploadId: string;
  demoSha256: string | null;
  playerId: string | null;
}): Promise<E2EEvidence> {
  const { db, uploadId, demoSha256, playerId } = args;

  const byUpload = await db
    .from("match_sources")
    .select("id, match_id, fingerprint, upload_id")
    .eq("upload_id", uploadId);
  const byFingerprint = demoSha256
    ? await db
        .from("match_sources")
        .select("id, match_id, fingerprint, upload_id")
        .eq("fingerprint", demoSha256)
    : {
        data: [] as {
          id: string;
          match_id: string | null;
          fingerprint: string | null;
          upload_id: string | null;
        }[],
      };

  const sources = new Map<string, string | null>();
  const sourceFingerprints = new Set<string>();
  const sourceUploadIds = new Set<string>();
  for (const row of [...(byUpload.data ?? []), ...(byFingerprint.data ?? [])]) {
    sources.set(row.id, row.match_id);
    if (row.fingerprint) sourceFingerprints.add(row.fingerprint);
    if (row.upload_id) sourceUploadIds.add(row.upload_id);
  }
  const matchIds = [...new Set([...sources.values()].filter((id): id is string => !!id))];

  const [participants, rounds, roundPlayers, events] = await Promise.all([
    countRows(db, "match_participants", matchIds),
    countRows(db, "match_rounds", matchIds),
    countRows(db, "round_players", matchIds),
    countRows(db, "round_events", matchIds),
  ]);

  let metrics = 0;
  let features = 0;
  let metricIds: string[] = [];
  let featureIds: string[] = [];
  const projectedPlayerIds = new Set<string>();
  if (matchIds.length > 0) {
    const metricsQuery = db
      .from("match_metrics")
      .select("id, player_id")
      .in("match_id", matchIds);
    const featuresQuery = db
      .from("match_features")
      .select("id, player_id")
      .in("match_id", matchIds);
    const [m, f] = await Promise.all([
      playerId ? metricsQuery.eq("player_id", playerId) : metricsQuery,
      playerId ? featuresQuery.eq("player_id", playerId) : featuresQuery,
    ]);
    metricIds = (m.data ?? []).map((row) => row.id).sort();
    featureIds = (f.data ?? []).map((row) => row.id).sort();
    for (const row of [...(m.data ?? []), ...(f.data ?? [])]) {
      if (row.player_id) projectedPlayerIds.add(row.player_id);
    }
    metrics = metricIds.length;
    features = featureIds.length;
  }

  return {
    matchIds: matchIds.sort(),
    matchSourceCount: sources.size,
    sourceFingerprints: [...sourceFingerprints].sort(),
    sourceUploadIds: [...sourceUploadIds].sort(),
    participants,
    rounds,
    roundPlayers,
    events,
    metrics,
    features,
    metricIds,
    featureIds,
    projectedPlayerIds: [...projectedPlayerIds].sort(),
  };
}

async function readRawEvidence(
  db: SupabaseClient<Database>,
  jobId: string,
): Promise<RawDemoEvidence | null> {
  const { data } = await db
    .from("raw_demo_evidence_reports")
    .select(
      "evidence_version, manifest, event_coverage, raw_events, raw_player_info, player_coverage, tick_coverage, tick_samples, grenade_coverage, grenade_samples, round_evidence, economy_coverage, field_mappings, gates, deterministic_digest, forensic_inventory, raw_status, raw_block_reasons",
    )
    .eq("job_id", jobId)
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? (data as unknown as RawDemoEvidence) : null;
}

async function readJobState(
  db: SupabaseClient<Database>,
  jobId: string,
): Promise<
  | (E2EJobState & {
      uploadId: string;
      userId: string;
      playerId: string | null;
      demoSha256: string | null;
      fileName: string;
      durationMs: number | null;
      extractionConfidence: number | null;
      partialParse: boolean;
      errorMessage: string | null;
      attemptNumber: number;
      retryCount: number;
      heartbeatAt: string | null;
      leaseExpiresAt: string | null;
    })
  | null
> {
  const { data } = await db
    .from("demo_jobs")
    .select(
      "id, upload_id, user_id, player_id, status, stage, error_code, error_message, match_id, rounds_valid, players_detected, parser_name, parser_version, parser_revision, demo_sha256, duration_ms, extraction_confidence, partial_parse, attachment_state, attachment_reason, attempt_number, retry_count, heartbeat_at, lease_expires_at, uploads(file_name)",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status as E2EJobState["status"],
    errorCode: data.error_code,
    errorMessage: data.error_message,
    matchId: data.match_id,
    roundsValid: data.rounds_valid,
    playersDetected: data.players_detected,
    parserName: data.parser_name,
    parserVersion: data.parser_version,
    parserRevision: data.parser_revision,
    attachmentState: data.attachment_state as E2EJobState["attachmentState"],
    attachmentReason: data.attachment_reason,
    uploadId: data.upload_id,
    userId: data.user_id,
    playerId: data.player_id,
    demoSha256: data.demo_sha256,
    fileName: data.uploads?.file_name ?? "",
    durationMs: data.duration_ms,
    extractionConfidence: data.extraction_confidence,
    partialParse: data.partial_parse,
    attemptNumber: data.attempt_number,
    retryCount: data.retry_count,
    heartbeatAt: data.heartbeat_at,
    leaseExpiresAt: data.lease_expires_at,
  };
}

export interface E2ERunReport {
  jobId: string;
  uploadId: string;
  fileName: string;
  expectation: E2EExpectation;
  /** Sequence number of this synchronous run (1 = first, 2 = idempotency run). */
  run: number;
  job: E2EJobState & {
    errorMessage: string | null;
    durationMs: number | null;
    extractionConfidence: number | null;
    partialParse: boolean;
    attemptNumber: number;
    dispatchAttempt: number;
  };
  worker: {
    ready: boolean;
    endpoint: string;
    error: string | null;
    name: string | null;
    version: string | null;
    revision: string | null;
    contractVersion: number | null;
  };
  evidenceBefore: E2EEvidence;
  evidenceAfter: E2EEvidence;
  rawEvidence: RawDemoEvidence | null;
  evaluation: E2EEvaluation;
  /** Only present when this run reprocessed an already processed demo. */
  idempotency: E2EEvaluation | null;
  startedAt: string;
  elapsedMs: number;
  wait: {
    terminal: boolean;
    observedExecution: boolean;
    polls: number;
    startedAt: string;
    endedAt: string;
    observedAttemptNumber: number | null;
    observedRetryCount: number | null;
    reason: string | null;
  };
}

const runInput = z.object({
  jobId: z.string().uuid(),
  expectation: z.enum(["positive", "negative"]),
  /** Explicit opt-in to re-run an already terminal job (idempotency proof). */
  rerun: z.boolean().optional(),
});

/**
 * Runs the REAL pipeline for one job, synchronously, and returns the evidence.
 *
 * Order is deliberate: preflight -> evidence BEFORE -> official transactional
 * retry (when explicitly requested) -> job row re-read -> evidence AFTER ->
 * verdict. The durable worker performs parsing; this request never bypasses it.
 */
export const runDemoE2E = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => runInput.parse(input))
  .handler(async ({ data, context }): Promise<E2ERunReport> => {
    await requireMaster(context as Ctx);
    const { db } = await adminDb();

    const before = await readJobState(db, data.jobId);
    if (!before) throw new Error("JOB_NOT_FOUND");

    const { probeParserWorker } = await import("@/lib/pipeline/parser/remoteParser.server");
    const probe = await probeParserWorker();
    const workerReady = probe.healthy && !!probe.identity && !probe.error;

    const evidenceBefore = await collectEvidence({
      db,
      uploadId: before.uploadId,
      demoSha256: before.demoSha256,
      playerId: before.playerId,
    });

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const isRerun = before.status === "processed" || before.status === "failed";
    const hasProvenFirstRun = before.status === "processed" && evidenceBefore.matchIds.length === 1;

    let expectedRetryCount = before.retryCount;
    let requestedExecution = false;
    if (workerReady) {
      // A terminal job is only re-armed on an explicit rerun request; this is
      // what makes the idempotency proof a deliberate, audited action.
      if (isRerun && data.rerun !== true) {
        throw new Error("JOB_ALREADY_TERMINAL");
      }
      if (isRerun) {
        const { data: requeued, error: requeueError } = await db.rpc(
          "retry_demo_job" as never,
          {
            _job_id: data.jobId,
            _user_id: before.userId,
            _allow_permanent: true,
            _reason: "admin_e2e",
          } as never,
        );
        if (requeueError || (requeued as { queued?: boolean } | null)?.queued !== true) {
          throw new Error("JOB_REQUEUE_FAILED");
        }
        const dispatch = (requeued as { dispatch_attempt?: unknown }).dispatch_attempt;
        if (typeof dispatch !== "number" || dispatch <= before.retryCount) {
          throw new Error("JOB_REQUEUE_UNPROVEN");
        }
        expectedRetryCount = dispatch;
        requestedExecution = true;
      } else if (before.status === "pending" || before.status === "processing") {
        requestedExecution = true;
      }
    }

    const timeoutFromEnv = Number(process.env["DEMO_E2E_WAIT_TIMEOUT_MS"]);
    const timeoutMs =
      Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0
        ? timeoutFromEnv
        : DEFAULT_E2E_WAIT_TIMEOUT_MS;
    const wait = requestedExecution
      ? await waitForTerminalExecution({
          read: () => readJobState(db, data.jobId),
          expectedRetryCount,
          expectedAttemptNumber: before.attemptNumber,
          timeoutMs,
          pollIntervalMs: DEFAULT_E2E_POLL_INTERVAL_MS,
        })
      : {
          state: await readJobState(db, data.jobId),
          terminal: false,
          observedExecution: false,
          polls: 1,
          startedAt,
          endedAt: new Date().toISOString(),
          observedAttemptNumber: before.attemptNumber,
          observedRetryCount: before.retryCount,
          reason: workerReady ? "E2E_EXECUTION_NOT_REQUESTED" : "E2E_PREFLIGHT_BLOCKED",
        };
    const after = wait.state;
    if (!after) throw new Error("JOB_NOT_FOUND");
    const evidenceAfter = await collectEvidence({
      db,
      uploadId: after.uploadId,
      demoSha256: after.demoSha256,
      playerId: after.playerId,
    });
    const rawEvidence = await readRawEvidence(db, data.jobId);

    const jobState: E2EJobState = {
      status: after.status,
      errorCode: after.errorCode,
      matchId: after.matchId,
      roundsValid: after.roundsValid,
      playersDetected: after.playersDetected,
      parserName: after.parserName,
      parserVersion: after.parserVersion,
      parserRevision: after.parserRevision,
      attachmentState: after.attachmentState,
      attachmentReason: after.attachmentReason,
    };

    const evaluation = evaluateE2ERun({
      expectation: data.expectation,
      workerReady: workerReady && wait.terminal && wait.observedExecution,
      workerError: probe.error ?? wait.reason,
      job: jobState,
      evidence: evidenceAfter,
    });

    // A real idempotency comparison requires a successful terminal Run 1 before
    // this independently requeued and awaited Run 2. A historical failed row is
    // never treated as Run 1 evidence.
    const idempotency =
      hasProvenFirstRun && isRerun && workerReady && wait.terminal && wait.observedExecution
        ? evaluateIdempotency(evidenceBefore, evidenceAfter)
        : null;

    const { error: auditError } = await (context as Ctx).supabase.from("admin_audit_logs").insert({
      admin_user_id: (context as Ctx).userId,
      action: "DEMO_E2E_RUN",
      target_user_id: after.userId,
      metadata: {
        job_id: data.jobId,
        upload_id: after.uploadId,
        expectation: data.expectation,
        rerun: isRerun,
        verdict: evaluation.verdict,
        job_status: after.status,
        error_code: after.errorCode,
        parser_revision: after.parserRevision,
        attachment_state: after.attachmentState,
        attachment_reason: after.attachmentReason,
        projection: evaluation.projection ?? null,
        match_ids: evidenceAfter.matchIds,
        attempt_number: after.attemptNumber,
        dispatch_attempt: after.retryCount,
        wait_terminal: wait.terminal,
        wait_observed_execution: wait.observedExecution,
        wait_reason: wait.reason,
        wait_started_at: wait.startedAt,
        wait_ended_at: wait.endedAt,
        wait_polls: wait.polls,
        observed_attempt_number: wait.observedAttemptNumber,
        observed_dispatch_attempt: wait.observedRetryCount,
        worker_name: probe.identity?.name ?? null,
        worker_version: probe.identity?.version ?? null,
        worker_revision: probe.identity?.revision ?? null,
        worker_build_revision: probe.identity?.buildRevision ?? null,
        worker_contract_version: probe.identity?.contractVersion ?? null,
      },
    });
    if (auditError) throw new Error("AUDIT_FAILED");

    return {
      jobId: data.jobId,
      uploadId: after.uploadId,
      fileName: after.fileName,
      expectation: data.expectation,
      run: hasProvenFirstRun ? 2 : 1,
      job: {
        ...jobState,
        errorMessage: after.errorMessage,
        durationMs: after.durationMs,
        extractionConfidence: after.extractionConfidence,
        partialParse: after.partialParse,
        attemptNumber: after.attemptNumber,
        dispatchAttempt: after.retryCount,
      },
      worker: {
        ready: workerReady,
        endpoint: probe.endpoint,
        error: probe.error,
        name: probe.identity?.name ?? null,
        version: probe.identity?.version ?? null,
        revision: probe.identity?.revision ?? null,
        contractVersion: probe.identity?.contractVersion ?? null,
      },
      evidenceBefore,
      evidenceAfter,
      rawEvidence,
      evaluation,
      idempotency,
      startedAt,
      elapsedMs: Date.now() - startedMs,
      wait: {
        terminal: wait.terminal,
        observedExecution: wait.observedExecution,
        polls: wait.polls,
        startedAt: wait.startedAt,
        endedAt: wait.endedAt,
        observedAttemptNumber: wait.observedAttemptNumber,
        observedRetryCount: wait.observedRetryCount,
        reason: wait.reason,
      },
    };
  });

/** Read-only evidence for a job, without touching the pipeline. */
export const getDemoE2EEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireMaster(context as Ctx);
    const { db } = await adminDb();
    const job = await readJobState(db, data.jobId);
    if (!job) return { job: null, evidence: EMPTY_EVIDENCE, rawEvidence: null };
    const evidence = await collectEvidence({
      db,
      uploadId: job.uploadId,
      demoSha256: job.demoSha256,
      playerId: job.playerId,
    });
    return {
      job: {
        status: job.status,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        matchId: job.matchId,
        fileName: job.fileName,
        uploadId: job.uploadId,
        roundsValid: job.roundsValid,
        playersDetected: job.playersDetected,
        parserName: job.parserName,
        parserVersion: job.parserVersion,
        parserRevision: job.parserRevision,
        attachmentState: job.attachmentState,
        attachmentReason: job.attachmentReason,
        partialParse: job.partialParse,
        extractionConfidence: job.extractionConfidence,
        durationMs: job.durationMs,
      },
      evidence,
      rawEvidence: await readRawEvidence(db, data.jobId),
    };
  });
