import { describe, expect, it } from 'vitest'

import { authTrustedOrigins, requireAuthSiteUrl } from './authOrigins'

describe('auth origin policy', () => {
  it('trusts the configured HTTPS app and fixed Apple callback origins outside local development', () => {
    expect(authTrustedOrigins('https://track.example/')).toEqual([
      'https://track.example',
      'https://appleid.apple.com',
    ])
  })

  it('adds loopback development ports only for a loopback site URL', () => {
    expect(authTrustedOrigins('http://localhost:3000')).toEqual([
      'http://localhost:3000',
      'http://localhost:8081',
      'http://localhost:8082',
      'http://localhost:8083',
      'https://appleid.apple.com',
    ])
  })

  it('rejects insecure remote, credentialed, and path-scoped site URLs', () => {
    expect(() => requireAuthSiteUrl('http://track.example')).toThrow('HTTPS origin')
    expect(() => requireAuthSiteUrl('https://user:secret@track.example')).toThrow('HTTPS origin')
    expect(() => requireAuthSiteUrl('https://track.example/auth')).toThrow('HTTPS origin')
  })
})
