import {
  getFormatterLocale,
  getLocaleMetadata,
  isLocale,
  type Locale,
} from '@/i18n/registry';

type DateInput = Date | number | string;
type NumberOptions = Intl.NumberFormatOptions;
type DateOptions = Intl.DateTimeFormatOptions;
type RelativeUnit = Intl.RelativeTimeFormatUnit;

function activeLocale(): Locale {
  return isLocale(globalThis.__trackLocale) ? globalThis.__trackLocale : 'en';
}

function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : activeLocale();
}

declare global {
  // Kept as a tiny bridge for non-React callers that use formatters before the
  // provider mounts. The provider updates it whenever the locale changes.
  var __trackLocale: Locale | undefined;
}

function toDate(value: DateInput) {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(locale: Locale, value: DateInput, options?: DateOptions): string;
export function formatDate(value: DateInput, options?: DateOptions): string;
export function formatDate(value: DateInput, locale: Locale, options?: DateOptions): string;
export function formatDate(
  localeOrValue: Locale | DateInput,
  valueOrLocale?: DateInput | Locale | DateOptions,
  options?: DateOptions,
) {
  const locale = isLocale(localeOrValue)
    ? localeOrValue
    : resolveLocale(valueOrLocale);
  const value = isLocale(localeOrValue) ? valueOrLocale as DateInput : localeOrValue;
  const dateOptions = isLocale(localeOrValue)
    ? options
    : isLocale(valueOrLocale) ? options
      : valueOrLocale && typeof valueOrLocale === 'object' ? valueOrLocale as DateOptions : undefined;
  return new Intl.DateTimeFormat(getFormatterLocale(locale), dateOptions).format(toDate(value));
}

export function formatTime(locale: Locale, value: DateInput, options?: DateOptions): string;
export function formatTime(value: DateInput, options?: DateOptions): string;
export function formatTime(value: DateInput, locale: Locale, options?: DateOptions): string;
export function formatTime(
  localeOrValue: Locale | DateInput,
  valueOrLocale?: DateInput | Locale | DateOptions,
  options?: DateOptions,
) {
  const locale = isLocale(localeOrValue) ? localeOrValue : resolveLocale(valueOrLocale);
  const value = isLocale(localeOrValue) ? valueOrLocale as DateInput : localeOrValue;
  const timeOptions: DateOptions = {
    hour: 'numeric',
    minute: '2-digit',
    ...(!isLocale(localeOrValue)
      ? isLocale(valueOrLocale)
        ? options
        : valueOrLocale && typeof valueOrLocale === 'object' ? valueOrLocale as DateOptions : undefined
      : options),
  };
  return new Intl.DateTimeFormat(getFormatterLocale(locale), timeOptions).format(toDate(value));
}

export function formatNumber(locale: Locale, value: number, options?: NumberOptions): string;
export function formatNumber(value: number, options?: NumberOptions): string;
export function formatNumber(value: number, locale: Locale, options?: NumberOptions): string;
export function formatNumber(
  localeOrValue: Locale | number,
  valueOrLocale?: number | Locale | NumberOptions,
  options?: NumberOptions,
) {
  const locale = isLocale(localeOrValue) ? localeOrValue : resolveLocale(valueOrLocale);
  const value = isLocale(localeOrValue) ? valueOrLocale as number : localeOrValue;
  const numberOptions = isLocale(localeOrValue)
    ? options
    : isLocale(valueOrLocale) ? options
      : valueOrLocale && typeof valueOrLocale === 'object' ? valueOrLocale as NumberOptions : undefined;
  return new Intl.NumberFormat(getFormatterLocale(locale), numberOptions).format(value);
}

export function formatRelativeTime(
  locale: Locale,
  value: number,
  unit: RelativeUnit,
  options?: Intl.RelativeTimeFormatOptions,
): string;
export function formatRelativeTime(
  value: number,
  unit: RelativeUnit,
  options?: Intl.RelativeTimeFormatOptions,
): string;
export function formatRelativeTime(
  value: number,
  unit: RelativeUnit,
  locale: Locale,
  options?: Intl.RelativeTimeFormatOptions,
): string;
export function formatRelativeTime(
  localeOrValue: Locale | number,
  valueOrUnit: number | RelativeUnit,
  unitOrLocale?: RelativeUnit | Locale | Intl.RelativeTimeFormatOptions,
  options?: Intl.RelativeTimeFormatOptions,
) {
  const locale = isLocale(localeOrValue)
    ? localeOrValue
    : resolveLocale(isLocale(unitOrLocale) ? unitOrLocale : undefined);
  const value = isLocale(localeOrValue) ? valueOrUnit as number : localeOrValue;
  const unit = isLocale(localeOrValue) ? unitOrLocale as RelativeUnit : valueOrUnit as RelativeUnit;
  const relativeOptions = isLocale(localeOrValue)
    ? options
    : isLocale(unitOrLocale) ? options : unitOrLocale as Intl.RelativeTimeFormatOptions | undefined;
  return new Intl.RelativeTimeFormat(getFormatterLocale(locale), {
    numeric: 'auto',
    ...relativeOptions,
  }).format(value, unit);
}

export function formatDuration(locale: Locale, seconds: number): string;
export function formatDuration(seconds: number): string;
export function formatDuration(seconds: number, locale: Locale): string;
export function formatDuration(localeOrSeconds: Locale | number, secondsOrLocale?: number | Locale) {
  const locale = isLocale(localeOrSeconds) ? localeOrSeconds : resolveLocale(secondsOrLocale);
  const totalSeconds = Math.max(0, Math.round(isLocale(localeOrSeconds) ? secondsOrLocale as number : localeOrSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const formatPart = (value: number) => formatNumber(locale, value, { useGrouping: false });
  if (hours > 0) return `${formatPart(hours)}:${formatPart(minutes).padStart(2, '0')}:${formatPart(remainingSeconds).padStart(2, '0')}`;
  return `${formatPart(minutes)}:${formatPart(remainingSeconds).padStart(2, '0')}`;
}

export function formatFileSize(locale: Locale, bytes: number, options?: NumberOptions): string;
export function formatFileSize(bytes: number, options?: NumberOptions): string;
export function formatFileSize(bytes: number, locale: Locale, options?: NumberOptions): string;
export function formatFileSize(
  localeOrBytes: Locale | number,
  bytesOrLocale?: number | Locale | NumberOptions,
  options?: NumberOptions,
) {
  const locale = isLocale(localeOrBytes) ? localeOrBytes : resolveLocale(bytesOrLocale);
  const bytes = Math.max(0, isLocale(localeOrBytes) ? bytesOrLocale as number : localeOrBytes);
  const numberOptions = isLocale(localeOrBytes)
    ? options
    : isLocale(bytesOrLocale) ? options
      : bytesOrLocale && typeof bytesOrLocale === 'object' ? bytesOrLocale as NumberOptions : undefined;
  const units = [
    { threshold: 1024 ** 3, unit: 'gigabyte' as const },
    { threshold: 1024 ** 2, unit: 'megabyte' as const },
    { threshold: 1024, unit: 'kilobyte' as const },
    { threshold: 1, unit: 'byte' as const },
  ];
  const selected = units.find(({ threshold }) => bytes >= threshold) ?? units[units.length - 1];
  const value = bytes / selected.threshold;
  return new Intl.NumberFormat(getFormatterLocale(locale), {
    style: 'unit',
    unit: selected.unit,
    unitDisplay: 'short',
    maximumFractionDigits: value >= 100 ? 0 : 1,
    ...numberOptions,
  }).format(value);
}

export function setFormatterLocale(locale: Locale) {
  globalThis.__trackLocale = locale;
}

export function getActiveFormatterLocale() {
  return activeLocale();
}

export function getLocaleDirection(locale: Locale) {
  return getLocaleMetadata(locale).direction;
}
