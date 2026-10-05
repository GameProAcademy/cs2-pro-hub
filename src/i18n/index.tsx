/**
 * i18n provider + hooks. Components only ever call `useT()` / `useI18n()`;
 * no component contains language conditionals.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_LOCALE,
  detectBrowserLocale,
  dictionaries,
  intlTagFor,
  persistLocale,
  readStoredLocale,
  type Locale,
  type TranslationKey,
} from "./config";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  intlTag: string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const next = readStoredLocale() ?? detectBrowserLocale();
    // Keep the first client render deterministic for SSR hydration, then
    // apply the browser preference on the next task. Do not depend on
    // requestIdleCallback: it is not available in all production browsers.
    const timer = window.setTimeout(() => setLocaleState(next), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dict = dictionaries[locale];
    return {
      locale,
      setLocale,
      intlTag: intlTagFor(locale),
      t: (key) => dict[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key,
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function useT(): (key: TranslationKey) => string {
  return useI18n().t;
}

export type { Locale, TranslationKey };
