import { describe, expect, it } from 'vitest'

import { getSafeLocalReturnPath, getSafeMarkdownHref } from './url-policy'

describe('getSafeMarkdownHref', () => {
  it.each([
    'https://example.com/docs?q=track#links',
    'HTTP://example.com/docs',
    '/workspace/projects?view=all#tasks',
    'relative/path?view=all#tasks',
    './relative/path',
    '#tasks',
    '/?next=%2Fworkspace',
  ])('allows safe target %s', (value) => {
    expect(getSafeMarkdownHref(value)).toBe(value)
  })

  it.each([
    '//evil.example/phish',
    '/\\evil.example/phish',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'custom-scheme://example.com',
    'https://example.com/%0A',
    'https://example.com/has space',
    '/malformed%',
  ])('rejects unsafe target %s', (value) => {
    expect(getSafeMarkdownHref(value)).toBeNull()
  })
})

describe('getSafeLocalReturnPath', () => {
  it('preserves a valid path, query, and hash', () => {
    const value = '/workspace/projects?view=all#tasks'
    expect(getSafeLocalReturnPath(value)).toBe(value)
  })

  it.each([
    '//evil.example/phish',
    '/\\evil.example/phish',
    'https://evil.example/phish',
    'javascript:alert(1)',
    '/malformed%',
    '/path with spaces',
    '\u0000/workspace',
  ])('falls back for unsafe path %s', (value) => {
    expect(getSafeLocalReturnPath(value, '/workspace')).toBe('/workspace')
  })
})
