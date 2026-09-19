export const PROCESSING_STAGES = [
  "queued",
  "validating",
  "parsing",
  "raw_audit",
  "normalizing",
  "metrics",
  "persisting",
  "cleanup",
  "done",
] as const;

export type ProcessingStage = (typeof PROCESSING_STAGES)[number];
export type ProcessingStatus =
  | "pending"
  | "processing"
  | "processed"
  | "failed"
  | "cancel_requested"
  | "cancelled"
  | "blocked_raw_audit";

export const STAGE_PROGRESS: Record<ProcessingStage, number> = {
  queued: 5,
  validating: 15,
  parsing: 40,
  raw_audit: 52,
  normalizing: 60,
  metrics: 78,
  persisting: 90,
  cleanup: 96,
  done: 100,
};

const ACTIVE_STAGES = PROCESSING_STAGES.filter((stage) => stage !== "done");

export function isProcessingStage(stage: string): stage is ProcessingStage {
  return PROCESSING_STAGES.includes(stage as ProcessingStage);
}

export function safeProcessingStage(stage: string, status: ProcessingStatus): ProcessingStage {
  if (status === "processed") return "done";
  if (status === "cancelled" || status === "cancel_requested") return "cleanup";
  if (status === "blocked_raw_audit") return "raw_audit";
  if (isProcessingStage(stage) && stage !== "done") return stage;
  return status === "pending" ? "queued" : "validating";
}

export function stageProgressCeiling(stage: ProcessingStage): number {
  if (stage === "done") return 100;
  const index = ACTIVE_STAGES.indexOf(stage);
  const next = ACTIVE_STAGES[index + 1];
  return next ? STAGE_PROGRESS[next] - 1 : 99;
}

/**
 * A deterministic visual estimate derived only from the real stage.
 * `animationStep` may move within that stage's band, while `previousProgress`
 * guarantees polling, retries and out-of-order responses never move backwards.
 */
export function estimatedStageProgress(args: {
  stage: string;
  status: ProcessingStatus;
  previousProgress?: number;
  animationStep?: number;
}): number {
  const previous = Math.max(0, Math.min(100, Math.round(args.previousProgress ?? 0)));
  if (args.status === "processed" || args.stage === "done") return 100;
  if (args.status === "cancelled") return STAGE_PROGRESS.cleanup;
  if (args.status === "cancel_requested") return STAGE_PROGRESS.cleanup;
  if (args.status === "blocked_raw_audit") return Math.max(previous, STAGE_PROGRESS.raw_audit);
  if (args.status === "failed" || args.stage === "failed") return previous || STAGE_PROGRESS.queued;

  const stage = safeProcessingStage(args.stage, args.status);
  const estimate = Math.min(
    STAGE_PROGRESS[stage] + Math.max(0, Math.floor(args.animationStep ?? 0)),
    stageProgressCeiling(stage),
  );
  return Math.max(previous, estimate);
}

export function processingStageIndex(stage: string, status: ProcessingStatus): number {
  const safeStage = safeProcessingStage(stage, status);
  return safeStage === "done" ? ACTIVE_STAGES.length : ACTIVE_STAGES.indexOf(safeStage);
}

export const VISIBLE_PROCESSING_STAGES = ACTIVE_STAGES;
