import { describe, expect, it } from 'vitest'

import {
  applySecurityHeaders,
  getContentSecurityPolicy,
  isNoStoreRequest,
} from './security-headers'

describe('security response headers', () => {
  it('adds the baseline headers and HSTS to secure production responses', async () => {
    const request = new Request('https://track.example/workspace', {
      headers: { accept: 'text/html' },
    })
    const response = applySecurityHeaders(new Response('ok'), request, '/workspace', 'router')

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()')
    expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
    expect(response.headers.get('Content-Security-Policy')).toContain("base-uri 'self'")
    expect(response.headers.get('Content-Security-Policy')).toContain("object-src 'none'")
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('keeps development usable without HSTS while allowing local HMR', () => {
    const request = new Request('http://localhost:3000/workspace', {
      headers: { accept: 'text/html' },
    })
    const response = applySecurityHeaders(new Response('ok'), request, '/workspace', 'router', { development: true })
    const csp = response.headers.get('Content-Security-Policy') ?? ''

    expect(response.headers.has('Strict-Transport-Security')).toBe(false)
    expect(csp).toContain('http://localhost:*')
    expect(csp).toContain("'unsafe-eval'")
  })

  it('does not disable immutable asset caching', () => {
    const request = new Request('https://track.example/assets/app-123.js', {
      headers: { accept: 'text/html' },
    })
    expect(isNoStoreRequest(request, '/assets/app-123.js', 'router')).toBe(false)
  })

  it('marks API and server-function responses as uncacheable', () => {
    const request = new Request('https://track.example/api/auth/session')
    expect(isNoStoreRequest(request, '/api/auth/session', 'router')).toBe(true)
    expect(isNoStoreRequest(request, '/server-fn', 'serverFn')).toBe(true)
  })

  it('keeps the CSP baseline in development', () => {
    expect(getContentSecurityPolicy(true)).toContain("base-uri 'self'")
  })
})
