import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import { LanguageSwitcher } from './LanguageSwitcher'
import { APP_LOCALE_STORAGE_KEY } from './locale'
import {
  changeLocale,
  LocaleProvider,
  syncDocumentLocale,
} from './runtime'

describe('locale runtime', () => {
  const storage = new Map<string, string>()

  beforeEach(async () => {
    storage.clear()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    })
    await changeLocale('en', { persist: false })
    syncDocumentLocale('en')
  })

  afterEach(async () => {
    cleanup()
    await changeLocale('en', { persist: false })
    storage.clear()
  })

  it('syncs document language and direction from one locale value', () => {
    syncDocumentLocale('ar')
    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
    syncDocumentLocale('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('adopts a saved locale after mount without requiring a reload', async () => {
    storage.set(APP_LOCALE_STORAGE_KEY, 'ar')
    render(
      <LocaleProvider>
        <LanguageSwitcher />
      </LocaleProvider>,
    )

    await waitFor(() => expect((screen.getByTestId('language-switcher') as HTMLSelectElement).value).toBe('ar'))
    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('follows a canonical locale change from another tab', async () => {
    render(
      <LocaleProvider>
        <LanguageSwitcher />
      </LocaleProvider>,
    )
    window.dispatchEvent(new StorageEvent('storage', {
      key: APP_LOCALE_STORAGE_KEY,
      newValue: 'ar',
    }))

    await waitFor(() => expect((screen.getByTestId('language-switcher') as HTMLSelectElement).value).toBe('ar'))
    expect(document.documentElement.dir).toBe('rtl')
  })
})
