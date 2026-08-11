import { describe, expect, it } from 'vitest'

import {
  APP_LOCALE_STORAGE_KEY,
  getLocaleMetadata,
  matchLocale,
  parseStoredLocale,
  persistLocale,
  readStoredLocale,
  resolveBrowserLocale,
  resolveInitialLocale,
  type LocaleStorage,
} from './locale'

class MemoryStorage implements LocaleStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

class FailingStorage implements LocaleStorage {
  getItem(): string {
    throw new Error('storage denied')
  }

  setItem(): void {
    throw new Error('storage denied')
  }
}

describe('locale resolution', () => {
  it('maps regional browser Arabic to generic Arabic and prefers supported languages', () => {
    expect(matchLocale('ar-SA')).toBe('ar')
    expect(matchLocale('AR_u_nu_latn')).toBe('ar')
    expect(resolveBrowserLocale(['fr-FR', 'ar-AE'])).toBe('ar')
    expect(resolveBrowserLocale(['fr-FR'])).toBe('en')
  })

  it('accepts canonical stored values only and prioritizes them', () => {
    expect(parseStoredLocale('ar')).toBe('ar')
    expect(parseStoredLocale('AR')).toBeUndefined()
    expect(parseStoredLocale('ar-SA')).toBeUndefined()
    expect(resolveInitialLocale('ar', ['en-US'])).toBe('ar')
    expect(resolveInitialLocale('ar-SA', ['ar-EG'])).toBe('ar')
  })

  it('derives direction and formatter locale from the registry', () => {
    expect(getLocaleMetadata('en')).toMatchObject({ direction: 'ltr', formatterLocale: 'en-US' })
    expect(getLocaleMetadata('ar')).toMatchObject({ direction: 'rtl', formatterLocale: 'ar-u-nu-latn' })
  })
})

describe('safe locale storage', () => {
  it('persists the canonical key and degrades when storage is denied', () => {
    const storage = new MemoryStorage()
    expect(readStoredLocale(storage)).toBeUndefined()
    expect(persistLocale(storage, 'ar')).toBe(true)
    expect(storage.getItem(APP_LOCALE_STORAGE_KEY)).toBe('ar')
    expect(readStoredLocale(storage)).toBe('ar')

    const failingStorage = new FailingStorage()
    expect(readStoredLocale(failingStorage)).toBeUndefined()
    expect(persistLocale(failingStorage, 'ar')).toBe(false)
  })
})
