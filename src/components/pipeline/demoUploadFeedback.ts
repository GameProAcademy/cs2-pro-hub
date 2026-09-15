import type { TranslationKey } from "@/i18n/config";
import type { SubmitDemoResult } from "@/lib/pipeline/client";

export interface DemoUploadFeedback {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  tone: "success" | "info";
  showContinueBrowsing: boolean;
}

export function getDemoUploadFeedback(result: SubmitDemoResult): DemoUploadFeedback {
  if (result.newAttempt) {
    return {
      titleKey: "pipeline.upload.replacementTitle",
      bodyKey: "pipeline.upload.replacementBody",
      tone: "info",
      showContinueBrowsing: true,
    };
  }

  if (!result.duplicate) {
    return {
      titleKey: "pipeline.upload.successTitle",
      bodyKey: "pipeline.upload.successBody",
      tone: "success",
      showContinueBrowsing: true,
    };
  }

  switch (result.duplicateStatus) {
    case "processed":
      return {
        titleKey: "pipeline.upload.duplicateProcessedTitle",
        bodyKey: "pipeline.upload.duplicateProcessedBody",
        tone: "info",
        showContinueBrowsing: false,
      };
    case "failed":
      return {
        titleKey: "pipeline.upload.retryFailedTitle",
        bodyKey: "pipeline.upload.retryFailedBody",
        tone: "info",
        showContinueBrowsing: true,
      };
    case "cancelled":
      return {
        titleKey: "pipeline.upload.retryCancelledTitle",
        bodyKey: "pipeline.upload.retryCancelledBody",
        tone: "info",
        showContinueBrowsing: true,
      };
    case "pending":
    default:
      return {
        titleKey: "pipeline.upload.duplicatePendingTitle",
        bodyKey: "pipeline.upload.duplicatePendingBody",
        tone: "info",
        showContinueBrowsing: true,
      };
  }
}

export function isParticipantConfirmationDisabled(
  selectedParticipantKey: string | null,
  isPending: boolean,
): boolean {
  return selectedParticipantKey === null || isPending;
}
