import enCommon from '@/i18n/locales/en/common.json';
import arCommon from '@/i18n/locales/ar/common.json';

export const LOCALE_STORAGE_KEY = 'track:locale:v1';

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const SUPPORTED_LOCALES = LOCALES;
export const DEFAULT_LOCALE: Locale = 'en';

export const RESERVED_LOCALES = ['ar-SA', 'ar-AE'] as const;
export type ReservedLocale = (typeof RESERVED_LOCALES)[number];

export type Direction = 'ltr' | 'rtl';

export type LocaleMetadata = {
  code: Locale;
  selfName: string;
  direction: Direction;
  formatterLocale: string;
};

export const LOCALE_REGISTRY: Record<Locale, LocaleMetadata> = {
  en: {
    code: 'en',
    selfName: 'English',
    direction: 'ltr',
    formatterLocale: 'en-US',
  },
  ar: {
    code: 'ar',
    selfName: 'العربية',
    direction: 'rtl',
    formatterLocale: 'ar-u-nu-latn',
  },
};

export type CatalogValue = string | { [key: string]: CatalogValue };
export type LocaleCatalog = { [key: string]: CatalogValue };

export type LocaleNamespace = {
  en: LocaleCatalog;
  ar: LocaleCatalog;
};

const registeredNamespaces: Record<string, LocaleNamespace> = {
  common: {
    en: enCommon as LocaleCatalog,
    ar: arCommon as LocaleCatalog,
  },
};

export function registerLocaleNamespace(name: string, resources: LocaleNamespace) {
  registeredNamespaces[name] = resources;
}

export function getLocaleNamespaces() {
  return { ...registeredNamespaces };
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function canonicalizeLocale(value: unknown): Locale | null {
  if (isLocale(value)) return value;
  if (typeof value !== 'string') return null;

  const language = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return language === 'ar' ? 'ar' : language === 'en' ? 'en' : null;
}

export function parseStoredLocale(value: unknown): Locale | null {
  return value === 'en' || value === 'ar' ? value : null;
}

export function matchLocale(value: unknown): Locale | null {
  return canonicalizeLocale(value);
}

export function resolveLocale(value: unknown): Locale {
  return canonicalizeLocale(value) ?? DEFAULT_LOCALE;
}

export function getLocaleMetadata(locale: Locale) {
  return LOCALE_REGISTRY[locale];
}

export function getFormatterLocale(locale: Locale) {
  return getLocaleMetadata(locale).formatterLocale;
}

export function getDirection(locale: Locale): Direction {
  return getLocaleMetadata(locale).direction;
}

export function getSelfName(locale: Locale) {
  return getLocaleMetadata(locale).selfName;
}

export function getRegisteredNamespaceNames() {
  return Object.keys(registeredNamespaces);
}

export function getCatalogLeafPaths(catalog: LocaleCatalog, prefix = ''): string[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [path] : getCatalogLeafPaths(value, path);
  });
}
