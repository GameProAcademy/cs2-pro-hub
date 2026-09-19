import { describe, expect, it } from "vitest";

import { deriveIdentityUiState } from "@/components/pipeline/DemoPlayerIdentity";
import type { DemoIdentityView } from "@/lib/pipeline-identity.functions";

const base: DemoIdentityView = {
  jobId: "job",
  matchId: "match",
  attachmentState: "unattached",
  attachmentReason: null,
  attachmentMethod: null,
  attachmentConfidence: null,
  attachmentSource: null,
  attachmentParticipantKey: null,
  declaredNickname: null,
  declaredParticipantKey: null,
  observedNickname: null,
  latestDecisionStatus: null,
  confirmationStatus: "not_required",
  latestDecisionEventKey: null,
  participants: [],
};

describe("identity UX state machine", () => {
  it("keeps loading and errors explicit", () => {
    expect(
      deriveIdentityUiState(undefined, { loading: true, error: false, manualMode: false }),
    ).toBe("loading");
    expect(
      deriveIdentityUiState(undefined, { loading: false, error: true, manualMode: false }),
    ).toBe("error");
  });

  it("requires review for a strong automatic Steam match", () => {
    expect(
      deriveIdentityUiState(
        {
          ...base,
          attachmentState: "attached",
          attachmentMethod: "steam_id_confirmed",
          attachmentSource: "steam",
          confirmationStatus: "pending_confirmation",
        },
        { loading: false, error: false, manualMode: false },
      ),
    ).toBe("automatic_review");
  });

  it("separates confirmed, rejected, manual and conflict states", () => {
    expect(
      deriveIdentityUiState(
        { ...base, attachmentState: "attached", confirmationStatus: "user_confirmed" },
        { loading: false, error: false, manualMode: false },
      ),
    ).toBe("confirmed");
    expect(
      deriveIdentityUiState(
        { ...base, confirmationStatus: "user_rejected" },
        { loading: false, error: false, manualMode: false },
      ),
    ).toBe("manual_selection");
    expect(
      deriveIdentityUiState(
        { ...base, attachmentState: "attached", confirmationStatus: "manual_selected" },
        { loading: false, error: false, manualMode: false },
      ),
    ).toBe("manual_selected");
    expect(
      deriveIdentityUiState(
        { ...base, attachmentState: "conflict" },
        { loading: false, error: false, manualMode: false },
      ),
    ).toBe("conflict");
  });
});
