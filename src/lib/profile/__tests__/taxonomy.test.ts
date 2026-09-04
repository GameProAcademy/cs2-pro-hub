import { describe, expect, it } from "vitest";

import {
  COUNTRY_CODES,
  GOAL_CODES,
  PLATFORM_CODES,
  TEAM_ROLE_CODES,
  countryFromLocaleTag,
  countryFromTimeZone,
  detectCountryCode,
  isCountryCode,
  isPlatformCode,
  isTeamRoleCode,
} from "@/lib/profile/taxonomy";

describe("profile taxonomy", () => {
  it("uses stable codes, never localised labels", () => {
    expect(TEAM_ROLE_CODES).toContain("AWPER");
    expect(GOAL_CODES).toContain("GAMESENSE_DECISION");
    expect(TEAM_ROLE_CODES.every((code) => code === code.toUpperCase())).toBe(true);
    expect(GOAL_CODES.every((code) => code === code.toUpperCase())).toBe(true);
  });

  it("has no ESEA platform", () => {
    expect(PLATFORM_CODES).toEqual(["STEAM_PREMIER", "FACEIT", "GAMERS_CLUB", "OTHER"]);
    expect(isPlatformCode("ESEA")).toBe(false);
    expect(isTeamRoleCode("COACH")).toBe(false);
  });

  it("country codes are ISO 3166-1 alpha-2 and unique", () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    expect(COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
    expect(isCountryCode("BR")).toBe(true);
    expect(isCountryCode("br")).toBe(false);
    expect(isCountryCode("BRA")).toBe(false);
  });

  it("detects the country from the language tag first", () => {
    expect(countryFromLocaleTag("pt-BR")).toBe("BR");
    expect(countryFromLocaleTag("pt")).toBeNull();
    expect(detectCountryCode({ languages: ["pt-PT", "en-US"] })).toBe("PT");
  });

  it("falls back to the timezone, then to the app locale", () => {
    expect(countryFromTimeZone("America/Sao_Paulo")).toBe("BR");
    expect(countryFromTimeZone("Etc/UTC")).toBeNull();
    expect(detectCountryCode({ languages: ["pt"], timeZone: "Europe/Lisbon" })).toBe("PT");
    expect(detectCountryCode({ languages: [], timeZone: "Etc/UTC", fallbackLocale: "pt-BR" })).toBe(
      "BR",
    );
    expect(detectCountryCode({ languages: [], timeZone: "Etc/UTC" })).toBeNull();
  });
});
