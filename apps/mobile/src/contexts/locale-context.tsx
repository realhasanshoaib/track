import { reloadAppAsync } from 'expo';
import * as Localization from 'expo-localization';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, createContext } from 'react';
import { I18nManager, Platform } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import { platformStorage } from '@/lib/platform-storage';
import {
  canonicalizeLocale,
  getDirection,
  i18n,
  initializeI18n,
  LOCALE_STORAGE_KEY,
  type Direction,
  type Locale,
} from '@/i18n';

type LocaleContextValue = {
  locale: Locale;
  direction: Direction;
  isReady: boolean;
  setLocale: (locale: Locale) => Promise<void>;
};

const defaultContext: LocaleContextValue = {
  locale: 'en',
  direction: 'ltr',
  isReady: false,
  setLocale: async () => undefined,
};

const LocaleContext = createContext<LocaleContextValue>(defaultContext);

export function useLocale() {
  return useContext(LocaleContext);
}

export async function readStoredLocale() {
  try {
    return canonicalizeStoredLocale(await platformStorage.getItemAsync(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function canonicalizeStoredLocale(value: unknown): Locale | null {
  if (value !== 'en' && value !== 'ar') return null;
  return canonicalizeLocale(value);
}

export function resolveDeviceLocale(languageTags: readonly string[]) {
  for (const languageTag of languageTags) {
    const locale = canonicalizeLocale(languageTag);
    if (locale) return locale;
  }
  return 'en' as const;
}

export async function resolveInitialLocale() {
  const stored = await readStoredLocale();
  if (stored) return stored;

  try {
    return resolveDeviceLocale(Localization.getLocales().map((locale) => locale.languageTag));
  } catch {
    return 'en' as const;
  }
}

function applyDocumentLocale(locale: Locale) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = getDirection(locale);
}

async function persistLocale(locale: Locale) {
  try {
    await platformStorage.setItemAsync(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage is a preference, so a denied store must not block switching.
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [isReady, setIsReady] = useState(false);
  const reloadGuard = useRef(false);

  const reconcileNativeDirection = useCallback(async (nextLocale: Locale) => {
    if (Platform.OS === 'web') return;

    const shouldUseRtl = getDirection(nextLocale) === 'rtl';
    if (I18nManager.isRTL === shouldUseRtl || reloadGuard.current) return;

    reloadGuard.current = true;
    I18nManager.allowRTL(shouldUseRtl);
    I18nManager.forceRTL(shouldUseRtl);
    try {
      await reloadAppAsync();
    } catch {
      reloadGuard.current = false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const initialLocale = await resolveInitialLocale();
      await initializeI18n(initialLocale);
      if (!mounted) return;

      setLocaleState(initialLocale);
      applyDocumentLocale(initialLocale);
      await reconcileNativeDirection(initialLocale);
      if (mounted) setIsReady(true);
    }

    void bootstrap().catch(async () => {
      if (!mounted) return;
      await initializeI18n('en');
      setLocaleState('en');
      applyDocumentLocale('en');
      setIsReady(true);
    });

    return () => {
      mounted = false;
    };
  }, [reconcileNativeDirection]);

  const setLocale = useCallback(async (nextLocale: Locale) => {
    await persistLocale(nextLocale);
    await initializeI18n(nextLocale);
    setLocaleState(nextLocale);
    applyDocumentLocale(nextLocale);
    await reconcileNativeDirection(nextLocale);
  }, [reconcileNativeDirection]);

  const value = useMemo<LocaleContextValue>(() => ({
    direction: getDirection(locale),
    isReady,
    locale,
    setLocale,
  }), [isReady, locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>{isReady ? children : null}</I18nextProvider>
    </LocaleContext.Provider>
  );
}
