/**
 * Upload modal — presentation layer over the REAL demo lifecycle (no authority of its own).
 *
 * Everything here is pure: it reads what the backend reported (upload progress from the
 * browser upload, the job row, the identity row) and decides only what to SHOW. It never
 * creates, retries or completes anything. The rules it reuses are the existing ones:
 *   - identity state: `deriveIdentityUiState` (the card's own rule);
 *   - failed-job recovery: `identityActionFor`;
 *   - a match is finished only when the job is `processed` AND the player is `attached`
 *     with `user_confirmed` or `manual_selected` — the same definition the backend uses
 *     for its identity hold (migration 20261014200000_g6_r4_identity_retention_hold).
 *
 * Real order of the backend (kept): the demo is analysed and its metrics computed FIRST;
 * the player is identified on the analysed match; a manual choice re-queues the SAME job
 * (retry_count + 1), which attaches the match and its metrics to the player.
 */
import { identityActionFor, type IdentityAction } from "@/lib/pipeline/identityRecovery";
import { safeProcessingStage, type ProcessingStage } from "@/lib/pipeline/processingProgress";

/** Minimal job snapshot (a subset of DemoJobView, so tests stay small). */
export interface FlowJob {
  jobId: string;
  fileName: string;
  status: string;
  stage: string;
  errorCode: string | null;
  retryCount: number;
  matchId: string | null;
  demoAvailable: boolean;
  parserCurrent: boolean;
  attachmentState: string;
  attachmentConfirmationStatus?: string | undefined;
  observedNickname?: string | null | undefined;
  map: string | null;
  supersededByJobId: string | null;
}

/** What the card's identity rule says (deriveIdentityUiState). */
export type FlowIdentityState =
  | "loading"
  | "automatic_review"
  | "manual_selection"
  | "confirmed"
  | "manual_selected"
  | "conflict"
  | "error";

export type UploadSubState = "hashing" | "registering" | "uploading" | "completed";

export interface FlowUpload {
  state: UploadSubState;
  /** Real percentage from the upload; null while no byte has a measurable share. */
  percent: number | null;
  fileName: string;
  fileSize: number;
  error: string | null;
}

export type DemoFlowPhase =
  | { kind: "uploading"; sub: UploadSubState; percent: number | null }
  | { kind: "upload_failed"; code: string }
  | { kind: "upload_interrupted" }
  | { kind: "waiting_job" }
  | { kind: "queued" }
  | { kind: "processing"; stage: ProcessingStage }
  /** The player was chosen; the same job is attaching the match and metrics to them. */
  | { kind: "attaching"; stage: ProcessingStage | "queued" }
  | { kind: "identity_loading" }
  | { kind: "identity_error" }
  | { kind: "confirm_automatic" }
  | { kind: "select_player"; recover: boolean }
  | { kind: "completed" }
  | { kind: "needs_card_action"; action: Exclude<IdentityAction, null> }
  | { kind: "failed"; code: string; action: IdentityAction; stage: ProcessingStage }
  | { kind: "blocked_raw_audit" }
  | { kind: "cancel_requested" }
  | { kind: "cancelled" }
  | { kind: "unknown" };

export const CONFIRMED_IDENTITY = new Set(["user_confirmed", "manual_selected"]);

/** True only for the backend's own definition of a finished, owned match. */
export function isDefinitivelyComplete(job: FlowJob | null | undefined): boolean {
  return Boolean(
    job &&
    job.status === "processed" &&
    job.attachmentState === "attached" &&
    CONFIRMED_IDENTITY.has(job.attachmentConfirmationStatus ?? ""),
  );
}

const KNOWN_STATUSES = new Set([
  "pending",
  "processing",
  "processed",
  "failed",
  "cancel_requested",
  "cancelled",
  "blocked_raw_audit",
]);

export function deriveDemoFlowPhase(input: {
  upload: FlowUpload | null;
  job: FlowJob | null;
  identity: FlowIdentityState | null;
  /** A local marker says an upload was running when the page went away. */
  uploadInterrupted?: boolean;
}): DemoFlowPhase {
  const { upload, job } = input;
  if (!job) {
    if (upload?.error) return { kind: "upload_failed", code: upload.error };
    if (upload && upload.state !== "completed") {
      return { kind: "uploading", sub: upload.state, percent: upload.percent };
    }
    if (input.uploadInterrupted) return { kind: "upload_interrupted" };
    // Upload finished (or a job id is known) but the job row has not been read yet.
    return { kind: "waiting_job" };
  }

  if (!KNOWN_STATUSES.has(job.status)) return { kind: "unknown" };
  const status = job.status as
    | "pending"
    | "processing"
    | "processed"
    | "failed"
    | "cancel_requested"
    | "cancelled"
    | "blocked_raw_audit";

  if (status === "cancel_requested") return { kind: "cancel_requested" };
  if (status === "cancelled") return { kind: "cancelled" };
  if (status === "blocked_raw_audit") return { kind: "blocked_raw_audit" };

  if (status === "pending" || status === "processing") {
    const chosen =
      job.attachmentState === "attached" &&
      CONFIRMED_IDENTITY.has(job.attachmentConfirmationStatus ?? "");
    const stage = safeProcessingStage(job.stage, status);
    if (chosen) return { kind: "attaching", stage: status === "pending" ? "queued" : stage };
    if (status === "pending") return { kind: "queued" };
    return { kind: "processing", stage };
  }

  const action = identityActionFor({
    status: job.status,
    errorCode: job.errorCode,
    matchId: job.matchId,
    retryCount: job.retryCount,
    demoAvailable: job.demoAvailable,
    supersededByJobId: job.supersededByJobId,
    parserCurrent: job.parserCurrent,
  });

  if (status === "failed") {
    return {
      kind: "failed",
      code: job.errorCode ?? "PROCESSING_ERROR",
      action,
      stage: safeProcessingStage(job.stage, "processing"),
    };
  }

  // processed
  if (action === "reprocess_current_parser" || action === "reupload_required") {
    return { kind: "needs_card_action", action };
  }
  if (isDefinitivelyComplete(job)) return { kind: "completed" };
  switch (input.identity) {
    case null:
    case "loading":
      return { kind: "identity_loading" };
    case "error":
      return { kind: "identity_error" };
    case "automatic_review":
      return { kind: "confirm_automatic" };
    case "manual_selection":
    case "conflict":
      return { kind: "select_player", recover: false };
    // The identity row says confirmed but the job row has not caught up yet: keep waiting
    // for the job (never declare completion from one side only).
    case "confirmed":
    case "manual_selected":
      return { kind: "identity_loading" };
    default:
      return { kind: "unknown" };
  }
}

// ---------------------------------------------------------------------------------------
// Steps shown in the modal (the six the product asked for, in the backend's real order).

export const FLOW_STEPS = ["upload", "validate", "read", "metrics", "identify", "done"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];
export type StepState = "done" | "active" | "pending" | "error";

/** Which step a phase belongs to (null = no step is active, e.g. terminal failures). */
export function activeStep(phase: DemoFlowPhase): FlowStep | null {
  switch (phase.kind) {
    case "uploading":
    case "upload_failed":
    case "upload_interrupted":
      return "upload";
    case "waiting_job":
    case "queued":
      return "validate";
    case "processing":
      if (phase.stage === "queued" || phase.stage === "validating") return "validate";
      if (phase.stage === "parsing" || phase.stage === "raw_audit" || phase.stage === "normalizing")
        return "read";
      return "metrics";
    case "identity_loading":
    case "identity_error":
    case "confirm_automatic":
    case "select_player":
      return "identify";
    // The player was chosen; the job is attaching the match/metrics: the metrics step runs
    // again AFTER identification (shown as the last open step before completion).
    case "attaching":
      return "metrics";
    case "completed":
      return "done";
    default:
      return null;
  }
}

/** Step where the backend stopped a job (its last real stage). */
function stepOfStage(stage: ProcessingStage): FlowStep {
  if (stage === "queued" || stage === "validating") return "validate";
  if (stage === "parsing" || stage === "raw_audit" || stage === "normalizing") return "read";
  return "metrics";
}

/** Step states. `attaching` marks identify as done and keeps metrics active. */
export function stepStates(phase: DemoFlowPhase): Record<FlowStep, StepState> {
  const result = Object.fromEntries(FLOW_STEPS.map((s) => [s, "pending"])) as Record<
    FlowStep,
    StepState
  >;
  if (phase.kind === "completed") {
    for (const s of FLOW_STEPS) result[s] = "done";
    return result;
  }
  if (phase.kind === "attaching") {
    for (const s of FLOW_STEPS) result[s] = "done";
    result.metrics = "active";
    result.done = "pending";
    return result;
  }
  // A stopped job shows how far it really got and where it stopped (the RAW evidence
  // audit belongs to reading the match).
  if (phase.kind === "failed" || phase.kind === "blocked_raw_audit") {
    const stopped = phase.kind === "failed" ? stepOfStage(phase.stage) : "read";
    const index = FLOW_STEPS.indexOf(stopped);
    FLOW_STEPS.forEach((s, i) => {
      if (i < index) result[s] = "done";
    });
    result[stopped] = "error";
    return result;
  }
  const current = activeStep(phase);
  if (!current) return result;
  const index = FLOW_STEPS.indexOf(current);
  FLOW_STEPS.forEach((s, i) => {
    if (i < index) result[s] = "done";
  });
  result[current] =
    phase.kind === "upload_failed" || phase.kind === "identity_error" ? "error" : "active";
  return result;
}

/** Phases during which the background must stay locked (nothing may navigate away). */
export function isLockedPhase(phase: DemoFlowPhase): boolean {
  return (
    phase.kind === "uploading" ||
    phase.kind === "waiting_job" ||
    phase.kind === "queued" ||
    phase.kind === "processing" ||
    phase.kind === "attaching" ||
    phase.kind === "identity_loading" ||
    phase.kind === "confirm_automatic" ||
    phase.kind === "select_player" ||
    phase.kind === "cancel_requested"
  );
}

/** Leaving the page would lose work only while the browser itself is sending bytes. */
export function warnBeforeUnload(phase: DemoFlowPhase): boolean {
  return phase.kind === "uploading";
}

/**
 * The player may move the analysis to the background only where the server keeps working
 * on its own (never while the browser is uploading, never during the identity choice,
 * which has its own explicit "decide later").
 */
export function canContinueInBackground(phase: DemoFlowPhase): boolean {
  return (
    phase.kind === "waiting_job" ||
    phase.kind === "queued" ||
    phase.kind === "processing" ||
    phase.kind === "attaching" ||
    phase.kind === "cancel_requested"
  );
}

/** Cancel is offered exactly where the card offers it today (pending / processing). */
export function canCancel(job: FlowJob | null): boolean {
  return Boolean(job && (job.status === "pending" || job.status === "processing"));
}

/** Upload percentage: only a real, measured value; never invented. */
export function uploadPercent(phase: DemoFlowPhase): number | null {
  if (phase.kind !== "uploading") return null;
  if (phase.sub !== "uploading") return null;
  return phase.percent;
}

// ---------------------------------------------------------------------------------------
// Out-of-order protection: a snapshot may never move the modal backwards.

const STAGE_RANK: Record<string, number> = {
  queued: 0,
  validating: 1,
  parsing: 2,
  raw_audit: 3,
  normalizing: 4,
  metrics: 5,
  persisting: 6,
  cleanup: 7,
};

function snapshotRank(job: FlowJob): number {
  switch (job.status) {
    case "pending":
      return 0;
    case "processing":
      return 1 + (STAGE_RANK[job.stage] ?? 0);
    case "cancel_requested":
      return 9;
    case "processed":
    case "failed":
    case "cancelled":
    case "blocked_raw_audit":
      return 10;
    default:
      return -1;
  }
}

/**
 * Accepts `next` unless it is older than `prev` for the same job: a lower retry_count
 * (every re-queue — retry, identity re-run — increments it) or, within the same
 * retry_count, an earlier lifecycle position. A terminal snapshot may be refined by
 * another terminal one (e.g. processed → processed with the player attached).
 */
export function acceptJobSnapshot(prev: FlowJob | null, next: FlowJob | null): FlowJob | null {
  if (!next) return prev;
  if (!prev || prev.jobId !== next.jobId) return next;
  if (next.retryCount > prev.retryCount) return next;
  if (next.retryCount < prev.retryCount) return prev;
  return snapshotRank(next) >= snapshotRank(prev) ? next : prev;
}

// ---------------------------------------------------------------------------------------
// Recovery after reload: which job to follow again. UI-only memory; the backend is truth.

export const FLOW_STORAGE_KEY = "cs2pro.demoFlow.v1";
const MAX_MARKER_AGE_MS = 24 * 60 * 60 * 1000;

export interface FlowMemory {
  trackedJobId: string | null;
  /** Set while the browser is uploading; cleared once a job exists or the upload failed. */
  upload: { fileName: string; fileSize: number; startedAt: number } | null;
  /** Jobs the player moved to the background: never reopened automatically. */
  dismissed: string[];
}

export const EMPTY_FLOW_MEMORY: FlowMemory = { trackedJobId: null, upload: null, dismissed: [] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses stored memory defensively (anything malformed is dropped). */
export function parseFlowMemory(raw: string | null, now: number): FlowMemory {
  if (!raw) return EMPTY_FLOW_MEMORY;
  try {
    const value = JSON.parse(raw) as Partial<FlowMemory>;
    const tracked =
      typeof value.trackedJobId === "string" && UUID.test(value.trackedJobId)
        ? value.trackedJobId
        : null;
    const upload =
      value.upload &&
      typeof value.upload.fileName === "string" &&
      typeof value.upload.fileSize === "number" &&
      typeof value.upload.startedAt === "number" &&
      now - value.upload.startedAt >= 0 &&
      now - value.upload.startedAt < MAX_MARKER_AGE_MS
        ? {
            fileName: value.upload.fileName.slice(0, 255),
            fileSize: value.upload.fileSize,
            startedAt: value.upload.startedAt,
          }
        : null;
    const dismissed = Array.isArray(value.dismissed)
      ? value.dismissed
          .filter((id): id is string => typeof id === "string" && UUID.test(id))
          .slice(-20)
      : [];
    return { trackedJobId: tracked, upload, dismissed };
  } catch {
    return EMPTY_FLOW_MEMORY;
  }
}

export type ResumeDecision =
  | { kind: "none" }
  | { kind: "job"; jobId: string }
  | { kind: "upload_interrupted"; fileName: string; fileSize: number };

/**
 * What to reopen after a reload. Never starts anything: it only points the modal at an
 * existing job (or tells the player an upload in this browser was interrupted).
 */
export function decideResume(memory: FlowMemory, jobs: FlowJob[]): ResumeDecision {
  const byId = new Map(jobs.map((job) => [job.jobId, job]));
  if (memory.trackedJobId) {
    const tracked = byId.get(memory.trackedJobId);
    if (tracked && !memory.dismissed.includes(tracked.jobId)) {
      // A replacement attempt took over: follow it.
      const current =
        tracked.supersededByJobId && byId.has(tracked.supersededByJobId)
          ? (byId.get(tracked.supersededByJobId) as FlowJob)
          : tracked;
      if (!isDefinitivelyComplete(current) && current.status !== "cancelled") {
        return { kind: "job", jobId: current.jobId };
      }
    }
  }
  if (memory.upload) {
    return {
      kind: "upload_interrupted",
      fileName: memory.upload.fileName,
      fileSize: memory.upload.fileSize,
    };
  }
  const active = jobs.find(
    (job) =>
      (job.status === "pending" ||
        job.status === "processing" ||
        job.status === "cancel_requested") &&
      !job.supersededByJobId &&
      !memory.dismissed.includes(job.jobId),
  );
  return active ? { kind: "job", jobId: active.jobId } : { kind: "none" };
}
