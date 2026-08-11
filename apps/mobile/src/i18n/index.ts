import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import {
  getDirection,
  getLocaleMetadata,
  getLocaleNamespaces,
  registerLocaleNamespace,
  type Direction,
  type Locale,
  type LocaleCatalog,
  type LocaleMetadata,
  type LocaleNamespace,
  DEFAULT_LOCALE,
  LOCALE_REGISTRY,
  LOCALES,
  LOCALE_STORAGE_KEY,
  RESERVED_LOCALES,
  SUPPORTED_LOCALES,
  canonicalizeLocale,
  getFormatterLocale,
  getSelfName,
  getRegisteredNamespaceNames,
  isLocale,
  matchLocale,
  parseStoredLocale,
  resolveLocale,
} from '@/i18n/registry';
import {
  formatDate,
  formatDuration,
  formatFileSize,
  formatNumber,
  formatRelativeTime,
  formatTime,
  getActiveFormatterLocale,
  getLocaleDirection,
  setFormatterLocale,
} from '@/i18n/formatters';
import { LanguageSwitcher } from '@/i18n/language-switcher';

export type {
  Direction,
  Locale,
  LocaleCatalog,
  LocaleMetadata,
  LocaleNamespace,
  ReservedLocale,
};
export {
  LOCALE_REGISTRY,
  DEFAULT_LOCALE,
  LOCALES,
  SUPPORTED_LOCALES,
  LOCALE_STORAGE_KEY,
  RESERVED_LOCALES,
  canonicalizeLocale,
  matchLocale,
  parseStoredLocale,
  resolveLocale,
  getDirection,
  getFormatterLocale,
  getLocaleDirection,
  getLocaleMetadata,
  getSelfName,
  getActiveFormatterLocale,
  isLocale,
  registerLocaleNamespace,
  formatDate,
  formatTime,
  formatNumber,
  formatRelativeTime,
  formatDuration,
  formatFileSize,
  setFormatterLocale,
  LanguageSwitcher,
  getLocaleNamespaces,
  getRegisteredNamespaceNames,
};

export const i18n: I18nInstance = i18next.createInstance();

let initialized = false;
let activeLocale: Locale = 'en';

const isDevelopment = typeof __DEV__ !== 'undefined'
  ? __DEV__
  : typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

i18n.on('languageChanged', (language) => {
  const nextLocale = canonicalizeLocale(language);
  if (!nextLocale) return;
  activeLocale = nextLocale;
  setFormatterLocale(nextLocale);
});

export function getActiveLocale() {
  return activeLocale;
}

export async function initializeI18n(locale: Locale) {
  if (!initialized) {
    await i18n.use(initReactI18next).init({
      compatibilityJSON: 'v4',
      debug: isDevelopment,
      fallbackLng: isDevelopment ? false : 'en',
      interpolation: { escapeValue: false },
      lng: locale,
      load: 'languageOnly',
      ns: Object.keys(getLocaleNamespaces()),
      defaultNS: 'common',
      resources: toI18nextResources(),
      supportedLngs: [...LOCALES],
      react: { useSuspense: false },
      returnNull: false,
      returnEmptyString: false,
      parseMissingKeyHandler: (key, defaultValue) => {
        if (isDevelopment) return `⟦missing:${activeLocale}:${key}⟧`;
        return defaultValue ?? key;
      },
    });
    initialized = true;
  } else if (i18n.language !== locale) {
    await i18n.changeLanguage(locale);
  }
  setFormatterLocale(locale);
}

function toI18nextResources() {
  const namespaces = getLocaleNamespaces();
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      Object.fromEntries(Object.entries(namespaces).map(([namespace, resources]) => [namespace, resources[locale]])),
    ]),
  );
}

export function addNamespaceToI18n(name: string, resources: LocaleNamespace) {
  registerLocaleNamespace(name, resources);
  if (!initialized) return;
  for (const locale of LOCALES) {
    i18n.addResourceBundle(locale, name, resources[locale], true, true);
  }
}
