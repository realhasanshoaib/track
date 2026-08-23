import { describe, expect, it } from 'vitest'

import { addAuthFlowToCallback, sanitizeAuthFlowCallback } from './auth-flow'

describe('web auth flow binding', () => {
  it('adds the browser-bound nonce without discarding the safe return path', () => {
    expect(addAuthFlowToCallback('/auth/callback?next=/sign-in', 'expected')).toBe(
      '/auth/callback?next=%2Fsign-in&flow=expected',
    )
  })

  it('accepts a one-time token only for the initiating browser tab', () => {
    expect(sanitizeAuthFlowCallback(
      'https://track.example/auth/callback?next=%2Fsign-in&flow=expected&ott=single-use',
      'expected',
    )).toEqual({
      sanitizedUrl: 'https://track.example/auth/callback?next=%2Fsign-in',
      token: 'single-use',
    })
  })

  it('sanitizes copied, duplicate, and reusable credentials without accepting them', () => {
    expect(sanitizeAuthFlowCallback(
      'https://track.example/auth/callback?flow=foreign&ott=single-use',
      'expected',
    )).toEqual({ sanitizedUrl: 'https://track.example/auth/callback', token: null })
    expect(sanitizeAuthFlowCallback(
      'https://track.example/auth/callback?flow=expected&ott=one&ott=two',
      'expected',
    )).toEqual({ sanitizedUrl: 'https://track.example/auth/callback', token: null })
    expect(sanitizeAuthFlowCallback(
      'https://track.example/auth/callback?cookie=session&flow=expected',
      'expected',
    )).toEqual({ sanitizedUrl: 'https://track.example/auth/callback', token: null })
  })
})
