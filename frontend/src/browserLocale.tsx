import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { detectLocale, isLocale, translate } from './i18n.ts';
import type { Locale, MessageKey, MessageValues } from './i18n.ts';

type LocaleContextValue = {
  locale: Locale;
  t: (key: MessageKey, values?: MessageValues) => string;
  setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ basePath, children }: { basePath: string; children: ReactNode }) {
  const storageKey = `pigeon:locale:${basePath}`;
  const [locale, updateLocale] = useState(() => {
    try {
      const preference = window.localStorage.getItem(storageKey);
      if (isLocale(preference)) return preference;
    } catch {
      // Browser storage can be unavailable in privacy modes.
    }
    return detectLocale([...navigator.languages, navigator.language]);
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, 'brand');
  }, [locale]);

  function setLocale(next: Locale) {
    updateLocale(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Keep the selected language for the current page.
    }
  }

  const t = (key: MessageKey, values?: MessageValues) => translate(locale, key, values);
  return <LocaleContext.Provider value={{ locale, t, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useBrowserLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('Missing Pigeon locale provider');
  return context;
}
