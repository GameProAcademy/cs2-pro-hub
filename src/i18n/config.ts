/**
 * Centralised i18n configuration.
 *
 * - Five supported locales, one dictionary per locale.
 * - Initial locale comes from the browser preference (navigator.languages).
 * - The manual choice is persisted in localStorage for now. When real auth
 *   exists, `persistLocale` is the single place to also write it to the user
 *   profile (the rest of the app never touches storage directly).
 */
import { en } from "./locales/en";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { ptBR, type Dictionary } from "./locales/pt-BR";
import { ptPT } from "./locales/pt-PT";

export type Locale = "pt-BR" | "en" | "es" | "fr" | "pt-PT";

export type TranslationKey = keyof typeof ptBR;

export const DEFAULT_LOCALE: Locale = "en";

export const dictionaries: Record<Locale, Dictionary> = {
  "pt-BR": ptBR,
  en,
  es,
  fr,
  "pt-PT": ptPT,
};

export interface LocaleOption {
  value: Locale;
  label: string;
  flag: string;
  /** BCP-47 tag used for Intl formatting. */
  intlTag: string;
}

export const LOCALE_OPTIONS: LocaleOption[] = [
  { value: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷", intlTag: "pt-BR" },
  { value: "en", label: "English", flag: "🇺🇸", intlTag: "en-US" },
  { value: "es", label: "Español", flag: "🇪🇸", intlTag: "es-ES" },
  { value: "fr", label: "Français", flag: "🇫🇷", intlTag: "fr-FR" },
  { value: "pt-PT", label: "Português (Portugal)", flag: "🇵🇹", intlTag: "pt-PT" },
];

export const STORAGE_KEY = "cs2pro.locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && value in dictionaries;
}

/**
 * Maps one browser tag to a supported locale.
 * pt-BR -> pt-BR | pt-PT (and bare pt) -> pt-PT | en-* -> en | es-* -> es |
 * fr-* -> fr | anything else -> null (caller falls back to English).
 */
export function matchLocale(tag: string): Locale | null {
  const normalized = tag.toLowerCase();
  if (normalized === "pt-br") return "pt-BR";
  if (normalized.startsWith("pt")) return "pt-PT";
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("fr")) return "fr";
  return null;
}

/** Browser-preference detection. No IP/geolocation is used by design. */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const match = tag ? matchLocale(tag) : null;
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

export function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function persistLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage unavailable (private mode): the in-memory choice still applies.
  }
  // TODO (real auth phase): also persist on the user profile from here.
}

export function intlTagFor(locale: Locale): string {
  return LOCALE_OPTIONS.find((o) => o.value === locale)?.intlTag ?? locale;
}
