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
  useSyncExternalStore,
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
const LOCALE_CHANGE_EVENT = "cs2pro:locale-change";

function browserLocaleSnapshot(): Locale {
  return readStoredLocale() ?? detectBrowserLocale();
}

function serverLocaleSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

function subscribeToLocale(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // useSyncExternalStore guarantees the server snapshot is reused for the
  // hydration render before React switches to the stored/browser preference.
  const locale = useSyncExternalStore(
    subscribeToLocale,
    browserLocaleSnapshot,
    serverLocaleSnapshot,
  );

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
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
