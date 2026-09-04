import { describe, expect, it } from "vitest";

import { sourceAvailability, isSourceCollectable } from "@/lib/sources/availability";
import { isSourceImplemented } from "@/lib/sources/sources";

import { GAMERS_CLUB_IDENTITY_VERIFIABLE } from "../gamersclub.constants";
import { GamersClubError } from "../gamersclub.errors";
import { parseGamersClubProfileUrl } from "../gamersclub.url";

describe("gamers club profile URL — accepted", () => {
  it("accepts a numeric profile", () => {
    const result = parseGamersClubProfileUrl("https://gamersclub.com.br/player/1879287");
    expect(result.ok).toBe(true);
    expect(result.profile?.externalId).toBe("1879287");
    expect(result.profile?.username).toBeNull();
    expect(result.profile?.canonicalProfileUrl).toBe("https://gamersclub.com.br/player/1879287");
  });

  it("accepts a slug profile and keeps it as the username snapshot", () => {
    const result = parseGamersClubProfileUrl("https://WWW.GamersClub.com.br/player/ZDR");
    expect(result.profile?.externalId).toBe("zdr");
    expect(result.profile?.username).toBe("zdr");
  });

  it("normalises trailing slash, query and fragment", () => {
    const result = parseGamersClubProfileUrl(
      "  https://gamersclub.com.br/player/1879287/?tab=stats&utm=x#matches  ",
    );
    expect(result.ok).toBe(true);
    expect(result.profile?.canonicalProfileUrl).toBe("https://gamersclub.com.br/player/1879287");
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

  it("treats every current gamers club error as non-retryable", () => {
    expect(new GamersClubError("GAMERS_CLUB_PROFILE_NOT_FOUND" as never).retryable).toBe(false);
    expect(new GamersClubError("GAMERS_CLUB_UNSUPPORTED_HOST").retryable).toBe(false);
  });
});
