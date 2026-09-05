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

/**
 * ISO 3166-1 alpha-2 — mirrors public.iso_alpha2_codes() in the database, which
 * is the server-side source of truth. Only codes are stored; the visible name is
 * always produced by Intl for the active locale.
 */
export const COUNTRY_CODES = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
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

/**
 * ISO alpha-2 -> regional indicator flag emoji. Deterministic, so no emoji is
 * ever maintained by hand. Invalid input yields an empty string, never a wrong
 * flag.
 */
export function countryFlagEmoji(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  return String.fromCodePoint(
    ...[...upper].map((char) => 0x1f1e6 + (char.codePointAt(0)! - 65)),
  );
}

export interface CountryOption {
  code: CountryCode;
  name: string;
  flag: string;
}

/** Sorted by the LOCALISED country name, never by the ISO code. */
export function sortedCountries(intlTag: string): CountryOption[] {
  return COUNTRY_CODES.map((code) => ({
    code,
    name: countryName(code, intlTag),
    flag: countryFlagEmoji(code),
  })).sort((a, b) => a.name.localeCompare(b.name, intlTag));
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

/**
 * Region subtag of a BCP-47 tag: "pt-BR" -> "BR", "zh-Hant-TW" -> "TW".
 * The second subtag is NOT assumed to be the region — script subtags such as
 * "Hant" are skipped, and only a real ISO alpha-2 region is accepted.
 */
export function countryFromLocaleTag(tag: string | null | undefined): CountryCode | null {
  if (!tag) return null;
  const parts = tag.split(/[-_]/).slice(1);
  for (const part of parts) {
    if (part.length !== 2) continue; // language/script/variant subtags
    const region = part.toUpperCase();
    if (isCountryCode(region)) return region;
  }
  return null;
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

/* ------------------------------------------------------------------ *
 * Declared current level (DECLARED data, never an external rating)     *
 * ------------------------------------------------------------------ */

/**
 * The level the PLAYER declares about themself. It is deliberately unrelated to
 * FACEIT level/ELO, Premier rating or Gamers Club level: those are OBSERVED
 * external data and will live in their own fields.
 */
export const LEVEL_CODES = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "SEMI_PRO"] as const;
export type LevelCode = (typeof LEVEL_CODES)[number];

export const levelLabelKey = (code: string) => `level.${code}` as TranslationKey;

export function isLevelCode(value: unknown): value is LevelCode {
  return typeof value === "string" && (LEVEL_CODES as readonly string[]).includes(value);
}
