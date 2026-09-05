import { describe, expect, it } from "vitest";

import { passwordStrength, validatePasswordChange } from "@/lib/password";
import { countryFlagEmoji, countryFromLocaleTag } from "@/lib/profile/taxonomy";

describe("password change validation", () => {
  it("requires the current password first", () => {
    expect(validatePasswordChange({ current: "", next: "abcdefgh", confirm: "abcdefgh" })).toBe(
      "currentRequired",
    );
  });

  it("rejects short, mismatched and unchanged passwords", () => {
    expect(validatePasswordChange({ current: "x", next: "abc", confirm: "abc" })).toBe("tooShort");
    expect(validatePasswordChange({ current: "x", next: "abcdefgh", confirm: "abcdefg" })).toBe(
      "mismatch",
    );
    expect(
      validatePasswordChange({ current: "abcdefgh", next: "abcdefgh", confirm: "abcdefgh" }),
    ).toBe("sameAsCurrent");
  });

  it("accepts a valid change", () => {
    expect(
      validatePasswordChange({ current: "old-pass1", next: "New-pass1", confirm: "New-pass1" }),
    ).toBeNull();
  });

  it("grades strength without ever storing the value", () => {
    expect(passwordStrength("abc")).toBe("weak");
    expect(passwordStrength("abcdefgh")).toBe("fair");
    expect(passwordStrength("Abcdefgh1!x2")).toBe("strong");
  });
});

describe("country helpers", () => {
  it("derives flags from the ISO code, never a hand-kept list", () => {
    expect(countryFlagEmoji("BR")).toBe("🇧🇷");
    expect(countryFlagEmoji("us")).toBe("🇺🇸");
    expect(countryFlagEmoji("XYZ")).toBe("");
  });

  it("reads the region subtag, skipping script subtags", () => {
    expect(countryFromLocaleTag("pt-BR")).toBe("BR");
    expect(countryFromLocaleTag("zh-Hant-TW")).toBe("TW");
    expect(countryFromLocaleTag("en")).toBeNull();
    expect(countryFromLocaleTag(null)).toBeNull();
  });
});
