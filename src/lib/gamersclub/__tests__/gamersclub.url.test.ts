import { describe, expect, it } from "vitest";

import { sourceAvailability, isSourceCollectable } from "@/lib/sources/availability";
import { isSourceImplemented } from "@/lib/sources/sources";
import {
  operationBlockedExternally,
  sourceOperationalProfile,
  supportsOperation,
} from "@/lib/sources/sourceCapabilities";

import { GAMERS_CLUB_IDENTITY_VERIFIABLE } from "../gamersclub.constants";
import { GamersClubError } from "../gamersclub.errors";
import { parseGamersClubProfileUrl, withConfirmedGamersClubId } from "../gamersclub.url";

describe("gamers club profile URL — accepted", () => {
  it("treats a numeric profile as a numeric_id locator", () => {
    const result = parseGamersClubProfileUrl("https://gamersclub.com.br/player/1879287");
    expect(result.ok).toBe(true);
    expect(result.profile?.profileLocatorType).toBe("numeric_id");
    expect(result.profile?.externalId).toBe("1879287");
    expect(result.profile?.profileSlug).toBeNull();
    expect(result.profile?.externalIdConfirmed).toBe(false);
    expect(result.profile?.canonicalProfileUrl).toBe("https://gamersclub.com.br/player/1879287");
  });

  it("NEVER stores a slug as externalId", () => {
    const result = parseGamersClubProfileUrl("https://WWW.GamersClub.com.br/player/ZDR");
    expect(result.profile?.profileLocatorType).toBe("slug");
    expect(result.profile?.externalId).toBeNull();
    expect(result.profile?.profileSlug).toBe("zdr");
  });

  it("accepts valid slug characters", () => {
    const result = parseGamersClubProfileUrl("https://gamersclub.com.br/player/pro_player.1-x");
    expect(result.ok).toBe(true);
    expect(result.profile?.profileSlug).toBe("pro_player.1-x");
  });

  it("normalises trailing slash, query and fragment", () => {
    const result = parseGamersClubProfileUrl(
      "  https://gamersclub.com.br/player/1879287/?tab=stats&utm=x#matches  ",
    );
    expect(result.ok).toBe(true);
    expect(result.profile?.canonicalProfileUrl).toBe("https://gamersclub.com.br/player/1879287");
  });

  it("decodes an encoded slug", () => {
    const result = parseGamersClubProfileUrl("https://gamersclub.com.br/player/z%64r");
    expect(result.profile?.profileSlug).toBe("zdr");
  });

  it("keeps a canonical URL even when the GCID is unknown", () => {
    const result = parseGamersClubProfileUrl("https://gamersclub.com.br/player/zdr");
    expect(result.profile?.canonicalProfileUrl).toBe("https://gamersclub.com.br/player/zdr");
    expect(result.profile?.externalId).toBeNull();
  });

  it("only sets a confirmed GCID through explicit promotion", () => {
    const parsed = parseGamersClubProfileUrl("https://gamersclub.com.br/player/zdr");
    const promoted = withConfirmedGamersClubId(parsed.profile!, "1879287");
    expect(promoted.externalId).toBe("1879287");
    expect(promoted.externalIdConfirmed).toBe(true);
    expect(promoted.profileSlug).toBe("zdr");
    expect(() => withConfirmedGamersClubId(parsed.profile!, "zdr")).toThrow();
  });
});

describe("gamers club profile URL — rejected", () => {
  const cases: [string, string][] = [
    ["", "GAMERS_CLUB_INVALID_URL"],
    ["not a url", "GAMERS_CLUB_INVALID_URL"],
    ["/player/1879287", "GAMERS_CLUB_INVALID_URL"],
    ["http://gamersclub.com.br/player/1879287", "GAMERS_CLUB_INSECURE_URL"],
    ["javascript:alert(1)", "GAMERS_CLUB_INSECURE_URL"],
    ["data:text/html,<b>x", "GAMERS_CLUB_INSECURE_URL"],
    ["https://user:pw@gamersclub.com.br/player/1879287", "GAMERS_CLUB_URL_CREDENTIALS"],
    ["https://gamersclub.com.br:8443/player/1879287", "GAMERS_CLUB_UNSUPPORTED_HOST"],
    ["https://evil.com/player/1879287", "GAMERS_CLUB_UNSUPPORTED_HOST"],
    ["https://gamersclub.com.br.evil.com/player/1", "GAMERS_CLUB_UNSUPPORTED_HOST"],
    ["https://faceit.com/player/1879287", "GAMERS_CLUB_UNSUPPORTED_HOST"],
    ["https://gamersclub.com.br/", "GAMERS_CLUB_INVALID_PROFILE_PATH"],
    ["https://gamersclub.com.br/team/1879287", "GAMERS_CLUB_INVALID_PROFILE_PATH"],
    ["https://gamersclub.com.br/player/1879287/matches", "GAMERS_CLUB_INVALID_PROFILE_PATH"],
    ["https://gamersclub.com.br/player/..%2Fetc", "GAMERS_CLUB_INVALID_PROFILE_PATH"],
    ["https://gamersclub.com.br/player/%2e%2e%2f%2e%2e", "GAMERS_CLUB_INVALID_PROFILE_PATH"],
    ["https://gamersclub.com.br/player/-bad", "GAMERS_CLUB_INVALID_PROFILE_PATH"],
  ];

  for (const [input, code] of cases) {
    it(`rejects ${JSON.stringify(input)} with ${code}`, () => {
      const result = parseGamersClubProfileUrl(input);
      expect(result.ok).toBe(false);
      expect(result.profile).toBeNull();
      expect(result.error).toBe(code);
    });
  }
});

describe("gamers club honesty invariants", () => {
  it("never claims a verified identity from a player-supplied URL", () => {
    expect(GAMERS_CLUB_IDENTITY_VERIFIABLE).toBe(false);
  });

  it("is not collectable: the public site answers with an anti-bot challenge", () => {
    const availability = sourceAvailability("gamers_club");
    expect(availability.state).toBe("unavailable");
    expect(availability.reason).toBe("anti_bot_challenge");
    expect(availability.collectable).toBe(false);
    expect(isSourceImplemented("gamers_club")).toBe(false);
  });

  it("keeps demo and faceit as the only collectable sources", () => {
    expect(isSourceCollectable("demo")).toBe(true);
    expect(isSourceCollectable("faceit")).toBe(true);
    expect(isSourceCollectable("steam")).toBe(false);
    expect(isSourceCollectable("public_profile")).toBe(false);
  });

  it("reports architecture_ready + blocked external access, not fully implemented", () => {
    const profile = sourceOperationalProfile("gamers_club");
    expect(profile.architecture).toBe("architecture_ready");
    expect(profile.externalAccess).toBe("blocked_external_access");
    expect(supportsOperation("gamers_club", "match_history")).toBe(false);
    expect(operationBlockedExternally("gamers_club", "match_history")).toBe(true);
    // Identity handling needs no external access.
    expect(supportsOperation("gamers_club", "identity")).toBe(true);
    expect(sourceOperationalProfile("faceit").externalAccess).toBe("available");
  });

  it("marks non-transient gamers club errors correctly", () => {
    expect(new GamersClubError("GAMERS_CLUB_UNSUPPORTED_HOST").retryable).toBe(false);
    expect(new GamersClubError("GC_BLOCKED_EXTERNAL_ACCESS").retryable).toBe(false);
    expect(new GamersClubError("GC_RATE_LIMITED").retryable).toBe(true);
    expect(new GamersClubError("GC_WORKER_DEADLINE_EXCEEDED").control).toBe(true);
  });
});
