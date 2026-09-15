import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  getDemoUploadFeedback,
  isParticipantConfirmationDisabled,
} from "@/components/pipeline/demoUploadFeedback";
import { dictionaries } from "@/i18n/config";
import type { SubmitDemoResult } from "@/lib/pipeline/client";

function result(overrides: Partial<SubmitDemoResult> = {}): SubmitDemoResult {
  return { jobId: "job-1", duplicate: false, duplicateStatus: null, ...overrides };
}

describe("FASE 2.7.2D-C — demo upload feedback", () => {
  it.each([
    [result(), "pipeline.upload.successBody", "success"],
    [
      result({ duplicate: true, duplicateStatus: "processed" }),
      "pipeline.upload.duplicateProcessedBody",
      "info",
    ],
    [
      result({ duplicate: true, duplicateStatus: "failed" }),
      "pipeline.upload.retryFailedBody",
      "info",
    ],
    [
      result({ duplicate: true, duplicateStatus: "cancelled" }),
      "pipeline.upload.retryCancelledBody",
      "info",
    ],
    [
      result({ duplicate: true, duplicateStatus: "pending" }),
      "pipeline.upload.duplicatePendingBody",
      "info",
    ],
  ] as const)(
    "maps each backend result to distinct visual feedback",
    (uploadResult, bodyKey, tone) => {
      const feedback = getDemoUploadFeedback(uploadResult);
      expect(feedback.bodyKey).toBe(bodyKey);
      expect(feedback.tone).toBe(tone);
    },
  );

  it("uses replacement feedback instead of the healthy duplicate message", () => {
    const feedback = getDemoUploadFeedback(
      result({ duplicate: true, duplicateStatus: "failed", newAttempt: true }),
    );
    expect(feedback.titleKey).toBe("pipeline.upload.replacementTitle");
    expect(feedback.bodyKey).toBe("pipeline.upload.replacementBody");
  });

  it("enables participant confirmation only after an explicit selection", () => {
    expect(isParticipantConfirmationDisabled(null, false)).toBe(true);
    expect(isParticipantConfirmationDisabled("participant-1", false)).toBe(false);
    expect(isParticipantConfirmationDisabled("participant-1", true)).toBe(true);
  });

  it("ships duplicate and empty-participant messages in all five locales", () => {
    const keys = [
      "pipeline.upload.duplicateProcessedBody",
      "pipeline.upload.retryFailedBody",
      "pipeline.upload.retryCancelledBody",
      "pipeline.upload.duplicatePendingBody",
      "pipeline.upload.replacementTitle",
      "pipeline.upload.replacementBody",
      "pipeline.history.attempt",
      "pipeline.history.replacement",
      "pipeline.history.superseded",
      "pipeline.identify.empty",
    ] as const;
    expect(Object.keys(dictionaries)).toHaveLength(5);
    for (const dictionary of Object.values(dictionaries)) {
      for (const key of keys) expect(dictionary[key]).toBeTruthy();
    }
  });

  it("renders real participants and an honest empty state without synthetic players", () => {
    const source = readFileSync("src/components/pipeline/DemoPlayerIdentity.tsx", "utf8");
    expect(source).toContain("participants.map((participant)");
    expect(source).toContain('t("pipeline.identify.empty")');
    expect(source).toContain("checked={selected === participant.participantKey}");
    expect(source).toContain("isParticipantConfirmationDisabled(selected, declare.isPending)");
  });
});
