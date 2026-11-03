/** Copy and formatting for the upload modal (kept apart so the view file only exports components). */
import type { TranslationKey } from "@/i18n/config";
import type { DemoFlowPhase } from "@/lib/pipeline/demoFlow";

export function formatBytes(bytes: number | null): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Title and body for each phase. */
export function phaseCopy(phase: DemoFlowPhase): { title: TranslationKey; body: TranslationKey } {
  switch (phase.kind) {
    case "uploading":
      return { title: "demoFlow.upload.title", body: "demoFlow.upload.body" };
    case "upload_failed":
      return { title: "demoFlow.upload.failedTitle", body: "demoFlow.upload.body" };
    case "upload_interrupted":
      return { title: "demoFlow.upload.interruptedTitle", body: "demoFlow.upload.interruptedBody" };
    case "waiting_job":
    case "queued":
      return { title: "demoFlow.validate.title", body: "demoFlow.validate.body" };
    case "processing":
      if (phase.stage === "queued" || phase.stage === "validating")
        return { title: "demoFlow.validate.title", body: "demoFlow.validate.body" };
      if (phase.stage === "parsing" || phase.stage === "raw_audit" || phase.stage === "normalizing")
        return { title: "demoFlow.read.title", body: "demoFlow.read.body" };
      return { title: "demoFlow.metrics.title", body: "demoFlow.metrics.body" };
    case "attaching":
      return { title: "demoFlow.attaching.title", body: "demoFlow.attaching.body" };
    case "identity_loading":
    case "identity_error":
      return { title: "demoFlow.identify.title", body: "demoFlow.identify.body" };
    case "confirm_automatic":
      return { title: "demoFlow.identify.automaticTitle", body: "demoFlow.identify.automaticBody" };
    case "select_player":
      return {
        title: "demoFlow.select.title",
        body: phase.recover ? "demoFlow.failed.selectAndRetry" : "demoFlow.select.body",
      };
    case "completed":
      return { title: "demoFlow.done.title", body: "demoFlow.done.body" };
    case "needs_card_action":
      return {
        title: "demoFlow.cardAction.title",
        body:
          phase.action === "reupload_required"
            ? "demoFlow.cardAction.reupload"
            : "demoFlow.cardAction.reprocess",
      };
    case "failed":
      return {
        title: "demoFlow.failed.title",
        body:
          phase.action === "select_and_retry"
            ? "demoFlow.failed.selectAndRetry"
            : "demoFlow.failed.retryHint",
      };
    case "blocked_raw_audit":
      return {
        title: "demoFlow.blocked.title",
        body: "pipeline.processing.rawAuditBlocked.body",
      };
    case "cancel_requested":
      return {
        title: "demoFlow.cancelRequested.title",
        body: "pipeline.processing.cancelRequested.body",
      };
    case "cancelled":
      return { title: "demoFlow.cancelled.title", body: "pipeline.processing.cancelled.body" };
    case "unknown":
      return { title: "demoFlow.unknown.title", body: "demoFlow.unknown.body" };
  }
}
