import { describe, expect, it } from 'vitest';

import arChat from '@/i18n/locales/ar/chat.json';
import enCommon from '@/i18n/locales/en/common.json';
import arCommon from '@/i18n/locales/ar/common.json';
import arWork from '@/i18n/locales/ar/work.json';
import enChat from '@/i18n/locales/en/chat.json';
import enWork from '@/i18n/locales/en/work.json';
import {
  canonicalizeLocale,
  getCatalogLeafPaths,
  getDirection,
  getFormatterLocale,
  getSelfName,
  LOCALE_STORAGE_KEY,
  parseStoredLocale,
  RESERVED_LOCALES,
  type LocaleCatalog,
} from '@/i18n/registry';
import { formatDuration, formatFileSize, formatNumber, formatRelativeTime } from '@/i18n/formatters';
import { i18n, initializeI18n } from '@/i18n/runtime';

describe('mobile locale registry', () => {
  it.each([
    ['common', enCommon, arCommon],
    ['work', enWork, arWork],
    ['chat', enChat, arChat],
  ])('keeps the %s catalogs structurally identical', (_namespace, english, arabic) => {
    const englishCatalog = english as LocaleCatalog;
    const arabicCatalog = arabic as LocaleCatalog;
    const englishPaths = getCatalogLeafPaths(englishCatalog).sort();
    const arabicPaths = getCatalogLeafPaths(arabicCatalog).sort();

    expect(arabicPaths).toEqual(englishPaths);
    const arabicValues = getCatalogValues(arabicCatalog);
    expect(arabicValues.every((value) => value.length > 0)).toBe(true);
    for (const path of englishPaths) {
      expect(interpolationVariables(readCatalogValue(arabicCatalog, path))).toEqual(
        interpolationVariables(readCatalogValue(englishCatalog, path)),
      );
    }
  });

  it('derives direction and formatter metadata from the canonical locale', () => {
    expect(getDirection('en')).toBe('ltr');
    expect(getDirection('ar')).toBe('rtl');
    expect(getFormatterLocale('ar')).toBe('ar-u-nu-latn');
    expect(getSelfName('ar')).toBe('العربية');
    expect(canonicalizeLocale('ar-SA')).toBe('ar');
    expect(parseStoredLocale('ar-SA')).toBeNull();
    expect(parseStoredLocale('ar')).toBe('ar');
    expect(RESERVED_LOCALES).toEqual(['ar-SA', 'ar-AE']);
  });

  it('uses a native SecureStore-safe preference key', () => {
    expect(LOCALE_STORAGE_KEY).toBe('track.locale.v1');
    expect(LOCALE_STORAGE_KEY).toMatch(/^[\w.-]+$/);
  });
});

function getCatalogValues(catalog: LocaleCatalog): string[] {
  return Object.values(catalog).flatMap((value) => (
    typeof value === 'string' ? [value] : getCatalogValues(value)
  ));
}

function readCatalogValue(catalog: LocaleCatalog, path: string) {
  let value: string | LocaleCatalog = catalog;
  for (const segment of path.split('.')) {
    value = (value as LocaleCatalog)[segment] as string | LocaleCatalog;
  }
  return value as string;
}

function interpolationVariables(value: string) {
  return [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)]
    .map((match) => match[1])
    .sort();
}

describe('mobile locale formatters', () => {
  it('uses Arabic language rules while retaining Latin digits', () => {
    const formatted = formatNumber('ar', 1234.5, { maximumFractionDigits: 1 });
    expect(formatted).not.toMatch(/[٠-٩]/);
    expect(formatRelativeTime('ar', -1, 'day')).toContain('أمس');
  });

  it('formats durations and file sizes for both supported locales', () => {
    expect(formatDuration('en', 3661)).toBe('1:01:01');
    expect(formatDuration('ar', 65)).toBe('1:05');
    expect(formatFileSize('en', 1024)).toBe('1 kB');
    expect(formatFileSize('ar', 1024)).toContain('1');
  });
});

describe('mobile Arabic messages', () => {
  it('selects Arabic plural categories from numeric counts', async () => {
    await initializeI18n('ar');

    expect(i18n.t('tasks.count', { count: 2, formattedCount: '2', ns: 'work' })).toBe('2 مهمتان');
    expect(i18n.t('tasks.count', { count: 11, formattedCount: '11', ns: 'work' })).toBe('11 مهمة');
    expect(i18n.t('task.comments', { count: 3, formattedCount: '3', ns: 'work' })).toBe('3 تعليقات');
    expect(i18n.t('voice.duration', { duration: '0:02', ns: 'chat' })).toBe('0:02 ملاحظة صوتية');

    await initializeI18n('en');
  });
});
