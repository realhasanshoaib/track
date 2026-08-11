import { getActiveLocale } from './runtime'
import { getLocaleMetadata, type Locale } from './locale'

export type DateInput = Date | number | string

function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ar'
}

function formatterLocale(locale: Locale): string {
  return getLocaleMetadata(locale).formatterLocale
}

function asDate(value: DateInput): Date | number {
  return typeof value === 'string' ? new Date(value) : value
}

export function formatDate(
  locale: Locale,
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
): string
export function formatDate(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
): string
export function formatDate(
  first: Locale | DateInput,
  second?: DateInput | Intl.DateTimeFormatOptions,
  third?: Intl.DateTimeFormatOptions,
): string {
  const locale = isLocale(first) ? first : getActiveLocale()
  const value = isLocale(first) ? (second as DateInput) : first
  const options = isLocale(first)
    ? third
    : (second as Intl.DateTimeFormatOptions | undefined)
  return new Intl.DateTimeFormat(formatterLocale(locale), options).format(asDate(value))
}

export function formatTime(
  locale: Locale,
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
): string
export function formatTime(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
): string
export function formatTime(
  first: Locale | DateInput,
  second?: DateInput | Intl.DateTimeFormatOptions,
  third?: Intl.DateTimeFormatOptions,
): string {
  const locale = isLocale(first) ? first : getActiveLocale()
  const value = isLocale(first) ? (second as DateInput) : first
  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    ...((isLocale(first) ? third : second) as Intl.DateTimeFormatOptions | undefined),
  }
  return new Intl.DateTimeFormat(formatterLocale(locale), options).format(asDate(value))
}

export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string
export function formatNumber(
  first: Locale | number,
  second?: number | Intl.NumberFormatOptions,
  third?: Intl.NumberFormatOptions,
): string {
  const locale = isLocale(first) ? first : getActiveLocale()
  const value = isLocale(first) ? (second as number) : first
  const options = isLocale(first)
    ? third
    : (second as Intl.NumberFormatOptions | undefined)
  return new Intl.NumberFormat(formatterLocale(locale), options).format(value)
}

export function formatPercent(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string
export function formatPercent(
  value: number,
  options?: Intl.NumberFormatOptions,
): string
export function formatPercent(
  first: Locale | number,
  second?: number | Intl.NumberFormatOptions,
  third?: Intl.NumberFormatOptions,
): string {
  const locale = isLocale(first) ? first : getActiveLocale()
  const value = isLocale(first) ? (second as number) : first
  const options = isLocale(first)
    ? third
    : (second as Intl.NumberFormatOptions | undefined)
  return formatNumber(locale, value, { style: 'percent', ...options })
}

export function formatCurrency(
  locale: Locale,
  value: number,
  currency: string,
  options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
): string
export function formatCurrency(
  value: number,
  currency: string,
  options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
): string
export function formatCurrency(
  first: Locale | number,
  second: number | string,
  third?: string | Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
  fourth?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
): string {
  const locale = isLocale(first) ? first : getActiveLocale()
  const value = isLocale(first) ? (second as number) : first
  const currency = (isLocale(first) ? third : second) as string
  const options = (isLocale(first) ? fourth : third) as
    | Omit<Intl.NumberFormatOptions, 'style' | 'currency'>
    | undefined
  return formatNumber(locale, value, { style: 'currency', currency, ...options })
}

export function formatRelativeTime(
  locale: Locale,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
): string
export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
): string
export function formatRelativeTime(
  first: Locale | number,
  second: number | Intl.RelativeTimeFormatUnit,
  third?: Intl.RelativeTimeFormatUnit | Intl.RelativeTimeFormatOptions,
  fourth?: Intl.RelativeTimeFormatOptions,
): string {
  const locale = isLocale(first) ? first : getActiveLocale()
  const value = (isLocale(first) ? second : first) as number
  const unit = (isLocale(first) ? third : second) as Intl.RelativeTimeFormatUnit
  const options = (isLocale(first) ? fourth : third) as
    | Intl.RelativeTimeFormatOptions
    | undefined
  return new Intl.RelativeTimeFormat(formatterLocale(locale), {
    numeric: 'auto',
    ...options,
  }).format(value, unit)
}

export function formatDuration(
  locale: Locale,
  durationMs: number,
): string
export function formatDuration(durationMs: number): string
export function formatDuration(
  first: Locale | number,
  second?: number,
): string {
  const locale = isLocale(first) ? first : getActiveLocale()
  const durationMs = isLocale(first) ? (second ?? 0) : first
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const formatPart = (value: number) => formatNumber(locale, value, { useGrouping: false })
  if (hours > 0) {
    return `${formatPart(hours)}:${formatPart(minutes).padStart(2, '0')}:${formatPart(seconds).padStart(2, '0')}`
  }
  return `${formatPart(minutes)}:${formatPart(seconds).padStart(2, '0')}`
}

export function formatFileSize(locale: Locale, bytes: number): string
export function formatFileSize(bytes: number): string
export function formatFileSize(first: Locale | number, second?: number): string {
  const locale = isLocale(first) ? first : getActiveLocale()
  const bytes = Math.max(0, isLocale(first) ? (second ?? 0) : first)
  const units = [
    { threshold: 1024 ** 3, unit: 'gigabyte' as const },
    { threshold: 1024 ** 2, unit: 'megabyte' as const },
    { threshold: 1024, unit: 'kilobyte' as const },
    { threshold: 1, unit: 'byte' as const },
  ]
  const selected = units.find(({ threshold }) => bytes >= threshold) ?? units.at(-1)!
  const value = bytes / selected.threshold
  return new Intl.NumberFormat(formatterLocale(locale), {
    style: 'unit',
    unit: selected.unit,
    unitDisplay: 'short',
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value)
}
