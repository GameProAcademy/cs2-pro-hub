/**
 * FASE 2.5.2 — the ONE place that decides which language a transactional email
 * is written in.
 *
 * Language is not nationality. A player in Brazil who chose English gets
 * English; the country is only ever a last-resort hint when the person never
 * expressed a preference. Priority, top to bottom:
 *
 *   1. the locale the user SAVED in the app;
 *   2. the locale their browser reported (persisted at signup/login);
 *   3. the country on their profile;
 *   4. pt-BR.
 *
 * No component may re-implement this. Every email goes through
 * `resolveEmailLocale`.
 */

export const EMAIL_LOCALES = ["pt-BR", "pt-PT", "en", "es", "fr"] as const;

export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export const DEFAULT_EMAIL_LOCALE: EmailLocale = "pt-BR";

function isEmailLocale(value: string): value is EmailLocale {
  return (EMAIL_LOCALES as readonly string[]).includes(value);
}

/** Maps any BCP-47-ish tag onto a supported locale. Returns null when unknown. */
export function normalizeEmailLocale(value: string | null | undefined): EmailLocale | null {
  if (!value) return null;
  const tag = value.trim().replace("_", "-");
  if (tag.length === 0) return null;
  if (isEmailLocale(tag)) return tag;

  const lower = tag.toLowerCase();
  const [language, region] = lower.split("-");

  if (language === "pt") return region === "pt" ? "pt-PT" : "pt-BR";
  if (language === "en") return "en";
  if (language === "es") return "es";
  if (language === "fr") return "fr";
  return null;
}

/**
 * Country -> language, used ONLY as a fallback when no preference exists.
 * Deliberately small: guessing wrong is worse than defaulting.
 */
const COUNTRY_LANGUAGE: Record<string, EmailLocale> = {
  BR: "pt-BR",
  PT: "pt-PT",
  AO: "pt-PT",
  MZ: "pt-PT",
  US: "en",
  GB: "en",
  CA: "en",
  AU: "en",
  IE: "en",
  NZ: "en",
  ES: "es",
  MX: "es",
  AR: "es",
  CL: "es",
  CO: "es",
  PE: "es",
  UY: "es",
  PY: "es",
  BO: "es",
  EC: "es",
  VE: "es",
  FR: "fr",
  BE: "fr",
  LU: "fr",
  MC: "fr",
};

export interface EmailLocaleSignals {
  /** Explicit preference saved by the user. Highest priority. */
  preferredLocale?: string | null;
  /** Locale reported by the browser, if the app persisted one. */
  browserLocale?: string | null;
  /** ISO-3166 alpha-2 country from the profile. Fallback only. */
  country?: string | null;
}

export function resolveEmailLocale(signals: EmailLocaleSignals = {}): EmailLocale {
  const explicit =
    normalizeEmailLocale(signals.preferredLocale) ?? normalizeEmailLocale(signals.browserLocale);
  if (explicit) return explicit;

  // Country is a WEAK signal and only ever a fallback: a country is not a
  // language, so it never overrides a stated preference.
  const country = signals.country?.trim().toUpperCase();
  const fromCountry = country ? COUNTRY_LANGUAGE[country] : undefined;
  return fromCountry ?? DEFAULT_EMAIL_LOCALE;
}
