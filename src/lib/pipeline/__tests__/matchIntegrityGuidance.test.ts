import { describe, expect, it } from "vitest";

import { classifyDemoJob, guidanceCopyKeys, type GuidanceJob } from "../errorGuidance";
import { guidanceEn as en } from "@/i18n/locales/guidance/en";

function job(matchIntegrityStatus: string | null): GuidanceJob {
  return {
    status: "blocked_raw_audit",
    stage: "raw_audit",
    errorCode: "RAW_AUDIT_BLOCKED",
    retryCount: 0,
    maxRetries: 2,
    matchId: null,
    demoAvailable: true,
    parserCurrent: true,
    supersededByJobId: null,
    matchIntegrityStatus,
  };
}

describe("PM6 C — guidance for match-integrity blocks", () => {
  it.each([
    ["MATCH_END_UNVERIFIED", "match_not_finished"],
    ["MATCH_FINAL_ROUND_INCOMPLETE", "match_not_finished"],
    ["MATCH_DEMO_TRUNCATED", "match_not_finished"],
    ["MATCH_LIFECYCLE_INCONSISTENT", "match_not_finished"],
    ["MATCH_INSUFFICIENT_ROUNDS", "match_insufficient_rounds"],
    ["MATCH_PLAYER_COVERAGE_INSUFFICIENT", "match_player_coverage"],
    ["MATCH_DEMO_CORRUPTED", "invalid_file"],
  ])("%s → %s, user can act, same demo useless", (status, category) => {
    const g = classifyDemoJob(job(status));
    expect(g.category).toBe(category);
    expect(g.resendSameDemoUseless).toBe(true);
    expect(g.requiresSupport).toBe(false);
  });

  it("a RAW block without an integrity decision keeps the existing review path", () => {
    expect(classifyDemoJob(job(null)).category).toBe("raw_audit_review");
  });

  it("every new category has its English copy", () => {
    for (const category of [
      "match_not_finished",
      "match_insufficient_rounds",
      "match_player_coverage",
    ] as const) {
      const keys = guidanceCopyKeys(category);
      for (const key of Object.values(keys))
        expect((en as Record<string, string>)[key], key).toBeTruthy();
    }
  });
});
