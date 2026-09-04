/**
 * PLAYER PROFILE TAXONOMY.
 *
 * Every user-selectable competitive attribute is a STABLE CODE stored in the
 * database and translated in the UI. The stored value never depends on the
 * language the user had selected when saving.
 */
import type { TranslationKey } from "@/i18n/config";

export const TEAM_ROLE_CODES = [
  "IGL",
  "ENTRY",
  "TRADE",
  "RIFLER",
  "AWPER",
  "SUPPORT",
  "LURKER",
  "ANCHOR",
  "FLEX",
] as const;
export type TeamRoleCode = (typeof TEAM_ROLE_CODES)[number];

export const GOAL_CODES = [
  "CLIMB_RATING",
  "AIM_MECHANICS",
  "GAMESENSE_DECISION",
  "CONSISTENCY",
  "COMPETITIVE_TEAM",
  "PRO_CAREER",
] as const;
export type GoalCode = (typeof GOAL_CODES)[number];

/** Platforms the product can actually reason about. ESEA is intentionally absent. */
export const PLATFORM_CODES = ["STEAM_PREMIER", "FACEIT", "GAMERS_CLUB", "OTHER"] as const;
export type PlatformCode = (typeof PLATFORM_CODES)[number];

export const EXPERIENCE_CODES = ["LESS_1Y", "1_3Y", "3_5Y", "MORE_5Y"] as const;
export type ExperienceCode = (typeof EXPERIENCE_CODES)[number];

export const roleLabelKey = (code: string) => `role.${code}` as TranslationKey;
export const goalLabelKey = (code: string) => `goal.${code}` as TranslationKey;
export const platformLabelKey = (code: string) => `platform.${code}` as TranslationKey;
export const experienceLabelKey = (code: string) => `experience.${code}` as TranslationKey;

export function isTeamRoleCode(value: unknown): value is TeamRoleCode {
  return typeof value === "string" && (TEAM_ROLE_CODES as readonly string[]).includes(value);
}
export function isGoalCode(value: unknown): value is GoalCode {
  return typeof value === "string" && (GOAL_CODES as readonly string[]).includes(value);
}
export function isPlatformCode(value: unknown): value is PlatformCode {
  return typeof value === "string" && (PLATFORM_CODES as readonly string[]).includes(value);
}
export function isExperienceCode(value: unknown): value is ExperienceCode {
  return typeof value === "string" && (EXPERIENCE_CODES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ *
 * Countries (ISO 3166-1 alpha-2)                                      *
 * ------------------------------------------------------------------ */

export const COUNTRY_CODES = [
  "AR", "AT", "AU", "BE", "BG", "BO", "BR", "CA", "CH", "CL", "CN", "CO", "CR", "CZ", "DE", "DK",
  "DO", "EC", "EE", "EG", "ES", "FI", "FR", "GB", "GR", "GT", "HK", "HN", "HR", "HU", "ID", "IE",
  "IL", "IN", "IS", "IT", "JP", "KR", "KZ", "LT", "LU", "LV", "MA", "MX", "MY", "NG", "NI", "NL",
  "NO", "NZ", "PA", "PE", "PH", "PL", "PT", "PY", "RO", "RS", "SA", "SE", "SG", "SI", "SK", "SV",
  "TH", "TR", "TW", "UA", "US", "UY", "VE", "VN", "ZA",
] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && (COUNTRY_CODES as readonly string[]).includes(value);
}

/** Localised country name; falls back to the raw code when Intl has no name. */
export function countryName(code: string, intlTag: string): string {
  try {
    const display = new Intl.DisplayNames([intlTag], { type: "region" });
    return display.of(code) ?? code;
  } catch {
    return code;
  }
}

export function sortedCountries(intlTag: string): Array<{ code: CountryCode; name: string }> {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, intlTag) })).sort((a, b) =>
    a.name.localeCompare(b.name, intlTag),
  );
}

/** Timezone -> country, only for zones that map to exactly one country. */
const TIMEZONE_COUNTRY: Record<string, CountryCode> = {
  "America/Sao_Paulo": "BR",
  "America/Bahia": "BR",
  "America/Fortaleza": "BR",
  "America/Recife": "BR",
  "America/Manaus": "BR",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Santiago": "CL",
  "America/Bogota": "CO",
  "America/Lima": "PE",
  "America/Mexico_City": "MX",
  "America/Montevideo": "UY",
  "America/Caracas": "VE",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "Europe/Lisbon": "PT",
  "Europe/Madrid": "ES",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Rome": "IT",
  "Europe/London": "GB",
  "Europe/Amsterdam": "NL",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK",
  "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL",
  "Europe/Prague": "CZ",
  "Europe/Kiev": "UA",
  "Europe/Kyiv": "UA",
  "Europe/Bucharest": "RO",
  "Europe/Belgrade": "RS",
  "Europe/Istanbul": "TR",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Singapore": "SG",
  "Asia/Jakarta": "ID",
  "Asia/Bangkok": "TH",
  "Asia/Kolkata": "IN",
  "Australia/Sydney": "AU",
  "Pacific/Auckland": "NZ",
  "Africa/Johannesburg": "ZA",
};

/** Region subtag of a BCP-47 tag, e.g. "pt-BR" -> "BR". */
export function countryFromLocaleTag(tag: string | null | undefined): CountryCode | null {
  if (!tag) return null;
  const region = tag.split(/[-_]/)[1]?.toUpperCase();
  return isCountryCode(region) ? region : null;
}

export function countryFromTimeZone(timeZone: string | null | undefined): CountryCode | null {
  if (!timeZone) return null;
  return TIMEZONE_COUNTRY[timeZone] ?? null;
}

/**
 * Best-effort initial country suggestion. It is only ever a DEFAULT for an
 * empty field — the user's saved value always wins.
 */
export function detectCountryCode(input?: {
  languages?: readonly string[];
  timeZone?: string | null;
  fallbackLocale?: string | null;
}): CountryCode | null {
  const languages =
    input?.languages ??
    (typeof navigator !== "undefined"
      ? ((navigator.languages as readonly string[] | undefined) ??
        (navigator.language ? [navigator.language] : []))
      : []);

  for (const tag of languages) {
    const fromLanguage = countryFromLocaleTag(tag);
    if (fromLanguage) return fromLanguage;
  }

  let timeZone = input?.timeZone ?? null;
  if (timeZone === null && typeof Intl !== "undefined") {
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      timeZone = null;
    }
  }
  const fromTimeZone = countryFromTimeZone(timeZone);
  if (fromTimeZone) return fromTimeZone;

  return countryFromLocaleTag(input?.fallbackLocale ?? null);
}
