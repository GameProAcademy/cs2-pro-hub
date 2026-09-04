import { describe, expect, it } from "vitest";

import {
  calculateIdentityConfidence,
  deriveIdentityStatus,
  evaluateVerification,
  profileCompleteness,
} from "@/lib/profile/verification";

describe("identity confidence", () => {
  it("is zero without evidence", () => {
    expect(calculateIdentityConfidence([])).toBe(0);
    expect(deriveIdentityStatus([])).toBe("unlinked");
  });

  it("never verifies from nickname + avatar + country", () => {
    const weak = [
      { attribute: "nickname_exact", matchType: "exact" },
      { attribute: "avatar", matchType: "visual_match" },
      { attribute: "country", matchType: "exact" },
    ] as const;
    const confidence = calculateIdentityConfidence(weak);
    expect(confidence).toBeLessThan(0.85);
    expect(deriveIdentityStatus(weak)).toBe("correlated");
  });

  it("a shared SteamID64 is strong but not verified", () => {
    const evidence = [{ attribute: "steam_id64", matchType: "exact" }] as const;
    expect(deriveIdentityStatus(evidence)).toBe("strongly_correlated");
  });

  it("only an authenticated link verifies", () => {
    const evidence = [{ attribute: "authenticated_link", matchType: "exact" }] as const;
    expect(deriveIdentityStatus(evidence)).toBe("verified");
  });

  it("conflict wins over everything", () => {
    expect(
      deriveIdentityStatus(
        [{ attribute: "authenticated_link", matchType: "exact" }],
        [{ attribute: "steam_id64", matchType: "conflict" }],
      ),
    ).toBe("conflict");
  });

  it("confidence stays inside [0,1]", () => {
    const many = Array.from({ length: 40 }, () => ({
      attribute: "nickname_exact" as const,
      matchType: "exact" as const,
    }));
    const confidence = calculateIdentityConfidence(many);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});

describe("profile completeness", () => {
  it("counts only real values", () => {
    const empty = profileCompleteness({});
    expect(empty.percent).toBe(0);
    expect(empty.missing).toHaveLength(6);

    const partial = profileCompleteness({ nickname: "  ", country: "BR" });
    expect(partial.satisfied).toEqual(["country"]);
  });

  it("reaches 100 only with every requirement", () => {
    const full = profileCompleteness({
      nickname: "thg",
      country: "BR",
      mainPlatform: "FACEIT",
      experience: "1_3Y",
      roleCodes: ["AWPER"],
      goalCodes: ["CLIMB_RATING"],
      primaryGoalCode: "CLIMB_RATING",
    });
    expect(full.percent).toBe(100);
    expect(full.missing).toEqual([]);
  });
});

describe("verification meter", () => {
  const fullProfile = {
    nickname: "thg",
    country: "BR",
    mainPlatform: "FACEIT" as const,
    experience: "1_3Y",
    roleCodes: ["AWPER"],
    goalCodes: ["CLIMB_RATING"],
    primaryGoalCode: "CLIMB_RATING",
  };

  it("gives no badge to a complete profile without proven ownership", () => {
    const result = evaluateVerification(fullProfile, []);
    expect(result.percent).toBe(50);
    expect(result.verifiedBadge).toBe(false);
    expect(result.identityStatus).toBe("unlinked");
    expect(result.recommendations).toContain("connect_faceit");
  });

  it("grants the badge only on proven ownership plus a complete profile", () => {
    const result = evaluateVerification(fullProfile, [
      {
        source: "faceit",
        connected: true,
        status: "verified",
        confidence: 1,
        ownershipProven: true,
      },
      {
        source: "steam",
        connected: true,
        status: "strongly_correlated",
        confidence: 0.95,
        ownershipProven: false,
      },
    ]);
    expect(result.percent).toBe(100);
    expect(result.verifiedBadge).toBe(true);
    expect(result.identityStatus).toBe("verified");
    expect(result.recommendations).toEqual(["nothing_pending"]);
  });

  it("an incomplete profile can never be badged", () => {
    const result = evaluateVerification(
      { nickname: "thg" },
      [{ source: "faceit", connected: true, status: "verified", confidence: 1, ownershipProven: true }],
    );
    expect(result.verifiedBadge).toBe(false);
    expect(result.recommendations).toContain("complete_profile");
  });

  it("surfaces a blocked external source and identity conflicts", () => {
    const result = evaluateVerification(fullProfile, [
      {
        source: "gamers_club",
        connected: true,
        status: "conflict",
        confidence: 0.2,
        ownershipProven: false,
        blockedExternalAccess: true,
      },
    ]);
    expect(result.identityStatus).toBe("conflict");
    expect(result.verifiedBadge).toBe(false);
    expect(result.recommendations).toContain("resolve_conflict");
    expect(result.recommendations).toContain("gamers_club_blocked");
  });
});
