import i18n from 'i18next'
import {
  I18nextProvider,
  initReactI18next,
} from 'react-i18next'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  APP_LOCALE_STORAGE_KEY,
  DEFAULT_LOCALE,
  getLocaleMetadata,
  matchLocale,
  parseStoredLocale,
  persistLocale,
  readStoredLocale,
  resolveInitialLocale,
  SUPPORTED_LOCALES,
  type Direction,
  type Locale,
  type LocaleStorage,
} from './locale'
import { bundledNamespaces, bundledResources } from './resources'

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'test'

function browserStorage(): LocaleStorage | undefined {
  if (typeof window === 'undefined') return undefined

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? navigator.languages : [navigator.language]
}

let activeLocale: Locale = DEFAULT_LOCALE

export const i18nReady = i18n
  .use(initReactI18next)
  .init({
    debug: isDevelopment,
    lng: DEFAULT_LOCALE,
    fallbackLng: isDevelopment ? false : DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    load: 'languageOnly',
    resources: bundledResources,
    ns: [...bundledNamespaces],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    returnEmptyString: false,
    parseMissingKeyHandler: (key, defaultValue) => {
      if (isDevelopment) return `⟦missing:${activeLocale}:${key}⟧`
      return defaultValue ?? key
    },
  })

export function syncDocumentLocale(locale: Locale): void {
  if (typeof document === 'undefined') return

  const { direction } = getLocaleMetadata(locale)
  document.documentElement.lang = locale
  document.documentElement.dir = direction
}

i18n.on('languageChanged', (language) => {
  const locale = matchLocale(language)
  if (!locale) return

  activeLocale = locale
  syncDocumentLocale(locale)
})

export function getActiveLocale(): Locale {
  return activeLocale
}

export function resolveClientLocale(): Locale {
  return resolveInitialLocale(
    readStoredLocale(browserStorage()),
    browserLanguages(),
  )
}

export async function changeLocale(
  value: string,
  options: { persist?: boolean } = {},
): Promise<Locale> {
  await i18nReady

  const locale = matchLocale(value)
  if (!locale) return activeLocale

  const previousLocale = activeLocale
  try {
    await i18n.changeLanguage(locale)
  } catch {
    activeLocale = previousLocale
    syncDocumentLocale(previousLocale)
    return previousLocale
  }

  activeLocale = locale
  syncDocumentLocale(locale)
  if (options.persist !== false) persistLocale(browserStorage(), locale)
  return locale
}

export async function adoptBrowserLocale(): Promise<Locale> {
  const locale = resolveClientLocale()
  if (locale === activeLocale) {
    syncDocumentLocale(locale)
    return locale
  }
  return changeLocale(locale, { persist: false })
}

function applyStoredLocale(value: string | null): void {
  const locale = parseStoredLocale(value)
  if (!locale || locale === activeLocale) return
  void changeLocale(locale, { persist: false })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === APP_LOCALE_STORAGE_KEY) applyStoredLocale(event.newValue)
  })
}

export interface LocaleContextValue {
  readonly locale: Locale
  readonly direction: Direction
  readonly setLocale: (locale: Locale) => Promise<void>
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getActiveLocale())

  useEffect(() => {
    const handleLanguageChanged = (language: string) => {
      const nextLocale = matchLocale(language)
      if (nextLocale) setLocaleState(nextLocale)
    }
    i18n.on('languageChanged', handleLanguageChanged)
    void adoptBrowserLocale()

    return () => {
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [])

  const setLocale = useCallback(async (nextLocale: Locale): Promise<void> => {
    await changeLocale(nextLocale)
  }, [])
  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    direction: getLocaleMetadata(locale).direction,
    setLocale,
  }), [locale, setLocale])

  return (
    <I18nextProvider i18n={i18n}>
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    </I18nextProvider>
  )
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used inside LocaleProvider')
  }
  return context
}
