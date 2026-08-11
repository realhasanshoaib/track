import { describe, expect, it } from 'vitest';

import enCommon from '@/i18n/locales/en/common.json';
import arCommon from '@/i18n/locales/ar/common.json';
import {
  canonicalizeLocale,
  getCatalogLeafPaths,
  getDirection,
  getFormatterLocale,
  getSelfName,
  RESERVED_LOCALES,
  type LocaleCatalog,
} from '@/i18n/registry';
import { formatDuration, formatFileSize, formatNumber, formatRelativeTime } from '@/i18n/formatters';

describe('mobile locale registry', () => {
  it('keeps the common catalogs structurally identical', () => {
    const englishPaths = getCatalogLeafPaths(enCommon as LocaleCatalog).sort();
    const arabicPaths = getCatalogLeafPaths(arCommon as LocaleCatalog).sort();

    expect(arabicPaths).toEqual(englishPaths);
    const arabicValues = getCatalogValues(arCommon as LocaleCatalog);
    expect(arabicValues.every((value) => value.length > 0)).toBe(true);
  });

  it('derives direction and formatter metadata from the canonical locale', () => {
    expect(getDirection('en')).toBe('ltr');
    expect(getDirection('ar')).toBe('rtl');
    expect(getFormatterLocale('ar')).toBe('ar-u-nu-latn');
    expect(getSelfName('ar')).toBe('العربية');
    expect(canonicalizeLocale('ar-SA')).toBe('ar');
    expect(RESERVED_LOCALES).toEqual(['ar-SA', 'ar-AE']);
  });
});

function getCatalogValues(catalog: LocaleCatalog): string[] {
  return Object.values(catalog).flatMap((value) => (
    typeof value === 'string' ? [value] : getCatalogValues(value)
  ));
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
