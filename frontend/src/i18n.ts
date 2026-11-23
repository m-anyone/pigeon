import { messages } from './messages.ts';
import type { MessageKey } from './messages.ts';

export type { MessageKey };
export type Locale = keyof typeof messages;
export type MessageValues = Readonly<Record<string, string | number>>;

export function isLocale(value: string | null): value is Locale {
  return value !== null && Object.hasOwn(messages, value);
}

export function detectLocale(preferences: readonly string[]): Locale {
  for (const preference of preferences) {
    let locale: Intl.Locale;
    try {
      locale = new Intl.Locale(preference.trim().replaceAll('_', '-'));
    } catch {
      continue;
    }

    if (locale.language === 'en') return 'en';
    if (locale.language !== 'zh') continue;

    // An explicit Chinese script overrides the regional default.
    if (locale.script === 'Hant') return 'zh-Hant';
    if (locale.script === 'Hans') return 'zh-Hans';
    const region = locale.region;
    return region === 'TW' || region === 'HK' || region === 'MO' ? 'zh-Hant' : 'zh-Hans';
  }

  return 'en';
}

export function translate(locale: Locale, key: MessageKey, values?: MessageValues): string {
  return messages[locale][key].replace(/\{([a-zA-Z]+)\}/g, (placeholder, name: string) =>
    String(values?.[name] ?? placeholder),
  );
}
