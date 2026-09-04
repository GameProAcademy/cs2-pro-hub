import { describe, expect, it } from "vitest";

import {
  confidenceLabel,
  correlateIdentities,
  correlateIdentityGraph,
} from "../identity.correlation";
import { evidenceValueHash, normalizeNickname, normalizeSteamId64 } from "../identity.normalize";
import { EVIDENCE_WEIGHTS, OWNERSHIP_PROOF_ATTRIBUTES } from "../identity.types";

describe("identity normalization", () => {
  it("normalizes nicknames without treating equality as identity", () => {
    expect(normalizeNickname("[GP] zDr_1 ")).toBe("zdr1");
    expect(normalizeNickname("ZDR")).toBe(normalizeNickname("zdr"));
    expect(normalizeNickname("   ")).toBeNull();
    expect(normalizeNickname(42)).toBeNull();
  });

  it("only accepts a real SteamID64", () => {
    expect(normalizeSteamId64("76561198000000000")).toBe("76561198000000000");
    expect(normalizeSteamId64("1234")).toBeNull();
    expect(normalizeSteamId64("STEAM_0:1:12345")).toBeNull();
  });

  it("hashes evidence values deterministically and irreversibly", () => {
    const hash = evidenceValueHash("zdr");
    expect(hash).toBe(evidenceValueHash("zdr"));
    expect(hash).not.toContain("zdr");
  });
});

describe("identity correlation confidence model", () => {
  it("never verifies from nickname + avatar + country", () => {
    const result = correlateIdentities(
      { source: "faceit", username: "zdr", avatarFingerprint: "a1", country: "BR" },
      { source: "gamers_club", username: "zdr", avatarFingerprint: "a1", country: "br" },
    );
    expect(result.status).toBe("correlated");
    expect(result.status).not.toBe("verified");
    expect(result.confidence).toBeLessThan(0.85);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("treats a normalized nickname as very weak evidence", () => {
    const result = correlateIdentities(
      { source: "faceit", username: "[GP] zdr" },
      { source: "gamers_club", username: "zdr" },
    );
    expect(result.evidence[0]?.attribute).toBe("nickname_normalized");
    expect(result.evidence[0]?.matchType).toBe("normalized_exact");
    expect(result.status).toBe("unlinked");
  });

  it("raises confidence a lot with a shared SteamID64", () => {
    const result = correlateIdentities(
      { source: "faceit", steamId64: "76561198000000000", username: "zdr" },
      { source: "gamers_club", steamId64: "76561198000000000", username: "zdr" },
    );
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.status).toBe("strongly_correlated");
    expect(result.status).not.toBe("verified");
  });

  it("verifies only with an authenticated ownership proof", () => {
    const result = correlateIdentities(
      { source: "faceit", authenticatedLink: true, steamId64: "76561198000000000" },
      { source: "steam", authenticatedLink: true, steamId64: "76561198000000000" },
    );
    expect(result.status).toBe("verified");
    expect(OWNERSHIP_PROOF_ATTRIBUTES).toContain("authenticated_link");
  });

  it("flags a conflict on contradictory SteamIDs and never overwrites silently", () => {
    const result = correlateIdentities(
      { source: "faceit", username: "zdr", steamId64: "76561198000000000" },
      { source: "gamers_club", username: "zdr", steamId64: "76561198000000001" },
    );
    expect(result.status).toBe("conflict");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.matchType).toBe("conflict");
  });

  it("returns unlinked when there is no evidence at all", () => {
    const result = correlateIdentities({ source: "faceit" }, { source: "gamers_club" });
    expect(result.status).toBe("unlinked");
    expect(result.confidence).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });

  it("correlates the whole graph pairwise and explains itself", () => {
    const result = correlateIdentityGraph([
      { source: "faceit", username: "zdr", steamId64: "76561198000000000" },
      { source: "gamers_club", username: "zdr" },
      { source: "steam", steamId64: "76561198000000000" },
    ]);
    expect(result.evidence.length).toBeGreaterThan(1);
    expect(result.reasons.some((reason) => reason.includes("SteamID64"))).toBe(true);
  });

  it("keeps heuristic weights ordered from strong to weak", () => {
    expect(EVIDENCE_WEIGHTS.authenticated_link.weight).toBeGreaterThan(
      EVIDENCE_WEIGHTS.steam_id64.weight,
    );
    expect(EVIDENCE_WEIGHTS.steam_id64.weight).toBeGreaterThan(
      EVIDENCE_WEIGHTS.faceit_linked_identity.weight,
    );
    expect(EVIDENCE_WEIGHTS.faceit_linked_identity.weight).toBeGreaterThan(
      EVIDENCE_WEIGHTS.nickname_exact.weight,
    );
    expect(EVIDENCE_WEIGHTS.nickname_exact.weight).toBeGreaterThan(
      EVIDENCE_WEIGHTS.nickname_normalized.weight,
    );
    expect(EVIDENCE_WEIGHTS.nickname_normalized.weight).toBeGreaterThan(
      EVIDENCE_WEIGHTS.avatar.weight,
    );
  });

  it("labels confidence conservatively", () => {
    expect(confidenceLabel(0.05)).toBe("very_low");
    expect(confidenceLabel(0.2)).toBe("low");
    expect(confidenceLabel(0.6)).toBe("medium");
    expect(confidenceLabel(0.95)).toBe("high");
  });
});
