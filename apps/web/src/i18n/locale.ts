export type Locale = 'en' | 'ar'
export type Direction = 'ltr' | 'rtl'

export interface LocaleMetadata {
  readonly code: Locale
  readonly selfName: string
  readonly direction: Direction
  readonly formatterLocale: string
}

export const DEFAULT_LOCALE: Locale = 'en'
export const APP_LOCALE_STORAGE_KEY = 'track:locale:v1'

export const LOCALE_REGISTRY = {
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
} as const satisfies Record<Locale, LocaleMetadata>

export const SUPPORTED_LOCALES = Object.freeze(
  Object.keys(LOCALE_REGISTRY) as Locale[],
)

export interface LocaleStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function normalizeLocaleTag(value: string): string {
  return value.trim().replace(/_/g, '-').toLowerCase()
}

function isLocale(value: string): value is Locale {
  return value === 'en' || value === 'ar'
}

/** Stored values are accepted only when they are canonical switcher values. */
export function parseStoredLocale(value: string | null | undefined): Locale | undefined {
  return value === 'en' || value === 'ar' ? value : undefined
}

/** Browser language tags may be regional; this release maps all Arabic to `ar`. */
export function matchLocale(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined

  const normalized = normalizeLocaleTag(value)
  if (isLocale(normalized)) return normalized

  const base = normalized.split('-')[0]
  return base && isLocale(base) ? base : undefined
}

export function resolveBrowserLocale(
  browserLanguages: readonly string[] | undefined,
): Locale {
  for (const browserLanguage of browserLanguages ?? []) {
    const locale = matchLocale(browserLanguage)
    if (locale) return locale
  }

  return DEFAULT_LOCALE
}

export function resolveLocale(value: string | null | undefined): Locale {
  return matchLocale(value) ?? DEFAULT_LOCALE
}

export function resolveInitialLocale(
  storedLocale: string | null | undefined,
  browserLanguages: readonly string[] | undefined,
): Locale {
  return parseStoredLocale(storedLocale) ?? resolveBrowserLocale(browserLanguages)
}

export function getLocaleMetadata(locale: Locale): LocaleMetadata {
  return LOCALE_REGISTRY[locale]
}

export function readStoredLocale(
  storage: LocaleStorage | undefined,
): Locale | undefined {
  if (!storage) return undefined

  try {
    return parseStoredLocale(storage.getItem(APP_LOCALE_STORAGE_KEY))
  } catch {
    return undefined
  }
}

export function persistLocale(
  storage: LocaleStorage | undefined,
  locale: Locale,
): boolean {
  if (!storage) return false

  try {
    storage.setItem(APP_LOCALE_STORAGE_KEY, locale)
    return true
  } catch {
    return false
  }
}
