import { describe, expect, it } from 'vitest'

import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatFileSize,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatTime,
} from './formatters'

describe('locale formatters', () => {
  it('uses the Arabic Latin-digit formatter locale', () => {
    expect(formatNumber('en', 1_234_567.89)).toBe('1,234,567.89')
    expect(formatNumber('ar', 1_234_567.89)).toBe('1,234,567.89')
    expect(formatPercent('ar', 0.42)).toMatch(/42.*%/)
    expect(formatCurrency('en', 12, 'USD')).toBe('$12.00')
    expect(formatCurrency('ar', 12, 'USD')).toMatch(/12\.00/)
  })

  it('formats deterministic dates, times, and relative labels', () => {
    const value = new Date('2026-01-02T03:04:05.000Z')
    expect(formatDate('en', value, { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })).toBe('01/02/2026')
    expect(formatTime('en', value, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false })).toBe('03:04')
    expect(formatRelativeTime('en', -3, 'day')).toBe('3 days ago')
    expect(formatRelativeTime('ar', -3, 'day')).toBe('قبل 3 أيام')
  })

  it('formats duration and file sizes with active locale digits', () => {
    expect(formatDuration('en', 65_000)).toBe('1:05')
    expect(formatDuration('ar', 65_000)).toBe('1:05')
    expect(formatFileSize('en', 1_536)).toMatch(/1\.5/)
    expect(formatFileSize('ar', 1_536)).toMatch(/1\.5/)
  })
})
