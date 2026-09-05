/**
 * FASE 2.4.1 — the thermometer, the badge and conflict severity must agree.
 */
import { describe, expect, it } from "vitest";

import {
  classifyConflict,
  evaluateVerification,
  hasStrongConflict,
  type IdentitySummary,
} from "@/lib/profile/verification";

const completeProfile = {
  nickname: "thg",
  country: "BR",
  mainPlatform: "FACEIT",
  experience: "1_3Y",
  roleCodes: ["AWPER"],
  goalCodes: ["CLIMB_RATING"],
  primaryGoalCode: "CLIMB_RATING",
};

const provenFaceit: IdentitySummary = {
  source: "faceit",
  connected: true,
  status: "verified",
  confidence: 1,
  ownershipProven: true,
};

describe("verification thermometer", () => {
  it("a complete profile alone never reads 100%", () => {
    const result = evaluateVerification(completeProfile, []);
    expect(result.percent).toBeLessThan(100);
    expect(result.verifiedBadge).toBe(false);
    expect(result.identityStatus).toBe("unlinked");
  });

  it("proven ownership with an incomplete profile never reads 100%", () => {
    const result = evaluateVerification({ nickname: "thg" }, [provenFaceit]);
    expect(result.percent).toBeLessThan(100);
    expect(result.verifiedBadge).toBe(false);
    expect(result.identityStatus).toBe("verified");
  });

  it("the badge always implies a full bar", () => {
    const result = evaluateVerification(completeProfile, [provenFaceit]);
    expect(result.verifiedBadge).toBe(true);
    expect(result.percent).toBe(100);
  });

  it("strong correlation without ownership stays below the bar cap", () => {
    const result = evaluateVerification(completeProfile, [
      {
        source: "faceit",
        connected: true,
        status: "strongly_correlated",
        confidence: 1,
        ownershipProven: false,
      },
    ]);
    expect(result.percent).toBeLessThan(100);
    expect(result.verifiedBadge).toBe(false);
  });

  it("does not ask to connect an identity that is already verified", () => {
    const result = evaluateVerification(completeProfile, [provenFaceit]);
    expect(result.recommendations).not.toContain("connect_faceit");
    expect(result.recommendations).not.toContain("connect_steam");
    expect(result.recommendations).toContain("nothing_pending");
  });

  it("reports the blocked external source honestly", () => {
    const result = evaluateVerification(completeProfile, [
      {
        source: "gamers_club",
        connected: false,
        status: "unlinked",
        confidence: 0,
        ownershipProven: false,
        blockedExternalAccess: true,
      },
    ]);
    expect(result.recommendations).toContain("gamers_club_blocked");
  });
});

describe("conflict severity", () => {
  it("nickname, avatar, team and country differences are weak", () => {
    for (const attribute of [
      "nickname_exact",
      "nickname_normalized",
      "avatar",
      "team",
      "country",
    ] as const) {
      expect(classifyConflict(attribute)).toBe("weak_difference");
    }
    expect(hasStrongConflict([{ attribute: "avatar", matchType: "conflict" }])).toBe(false);
  });

  it("incompatible SteamID64 or external account ids are strong conflicts", () => {
    expect(classifyConflict("steam_id64")).toBe("strong_conflict");
    expect(classifyConflict("external_account_id")).toBe("strong_conflict");
    expect(hasStrongConflict([{ attribute: "steam_id64", matchType: "conflict" }])).toBe(true);
  });

  it("a weak difference never blocks the badge", () => {
    const result = evaluateVerification(completeProfile, [
      { ...provenFaceit, status: "conflict", conflictSeverity: "weak_difference" },
    ]);
    expect(result.verifiedBadge).toBe(true);
    expect(result.recommendations).not.toContain("resolve_conflict");
  });

  it("a strong conflict blocks the badge and asks for resolution", () => {
    const result = evaluateVerification(completeProfile, [
      { ...provenFaceit, status: "conflict", conflictSeverity: "strong_conflict" },
    ]);
    expect(result.verifiedBadge).toBe(false);
    expect(result.identityStatus).toBe("conflict");
    expect(result.recommendations).toContain("resolve_conflict");
  });
});
