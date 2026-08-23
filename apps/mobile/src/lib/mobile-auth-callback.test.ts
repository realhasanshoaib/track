import { describe, expect, it } from 'vitest';

import {
  createMobileAuthFlowCallback,
  readMobileAuthOneTimeToken,
  requireMobileAuthCallback,
  sanitizeWebAuthCallback,
} from './mobile-auth-callback';

describe('requireMobileAuthCallback', () => {
  it('accepts a dedicated HTTPS app-link callback', () => {
    expect(requireMobileAuthCallback('https://track.example/auth/mobile/callback')).toEqual({
      hostname: 'track.example',
      pathname: '/auth/mobile/callback',
      url: 'https://track.example/auth/mobile/callback',
    });
  });

  it('rejects custom schemes and broad or ambiguous callbacks', () => {
    expect(() => requireMobileAuthCallback('track://auth/callback')).toThrow('HTTPS');
    expect(() => requireMobileAuthCallback('https://track.example')).toThrow('dedicated path');
    expect(() => requireMobileAuthCallback('https://track.example/auth?source=mobile')).toThrow('query or fragment');
  });

  it('requires the callback to use the configured service origin', () => {
    expect(() => requireMobileAuthCallback(
      'https://callback.example/auth/mobile/callback',
      'https://track.example',
    )).toThrow('Track service origin');
  });
});

describe('readMobileAuthOneTimeToken', () => {
  const callback = requireMobileAuthCallback('https://track.example/auth/mobile/callback');
  const flowNonce = 'expected-flow';

  it('accepts one token from the exact configured callback', () => {
    expect(readMobileAuthOneTimeToken(
      `${callback.url}?flow=${flowNonce}&ott=single-use-token`,
      callback,
      flowNonce,
    )).toBe('single-use-token');
  });

  it('rejects callbacks from another origin or path', () => {
    expect(() => readMobileAuthOneTimeToken(
      `https://attacker.example/auth/mobile/callback?flow=${flowNonce}&ott=token`,
      callback,
      flowNonce,
    ))
      .toThrow('unexpected callback');
    expect(() => readMobileAuthOneTimeToken(
      `https://track.example/other?flow=${flowNonce}&ott=token`,
      callback,
      flowNonce,
    ))
      .toThrow('unexpected callback');
  });

  it('rejects reusable cookies, duplicate tokens, foreign flows, and extra parameters', () => {
    expect(() => readMobileAuthOneTimeToken(`${callback.url}?cookie=session`, callback, flowNonce)).toThrow('unsafe reusable');
    expect(() => readMobileAuthOneTimeToken(
      `${callback.url}?flow=${flowNonce}&ott=one&ott=two`,
      callback,
      flowNonce,
    )).toThrow('one-time sign-in token');
    expect(() => readMobileAuthOneTimeToken(
      `${callback.url}?flow=foreign&ott=one`,
      callback,
      flowNonce,
    )).toThrow('one-time sign-in token');
    expect(() => readMobileAuthOneTimeToken(
      `${callback.url}?flow=${flowNonce}&ott=one&next=/`,
      callback,
      flowNonce,
    )).toThrow('one-time sign-in token');
  });

  it('builds a callback that binds the server redirect to the initiating app flow', () => {
    expect(createMobileAuthFlowCallback(callback, flowNonce)).toBe(`${callback.url}?flow=${flowNonce}`);
  });
});

describe('sanitizeWebAuthCallback', () => {
  it('extracts one-time tokens and removes them from browser history', () => {
    expect(sanitizeWebAuthCallback('https://track.example/?flow=expected&ott=single-use', 'expected')).toEqual({
      sanitizedUrl: 'https://track.example/',
      token: 'single-use',
    });
  });

  it('removes reusable cookies without accepting them', () => {
    expect(sanitizeWebAuthCallback('https://track.example/?cookie=session', 'expected')).toEqual({
      sanitizedUrl: 'https://track.example/',
      token: null,
    });
  });

  it('rejects ambiguous token callbacks while retaining unrelated navigation state', () => {
    expect(sanitizeWebAuthCallback('https://track.example/?flow=foreign&ott=one&next=%2Fworkspace', 'expected')).toEqual({
      sanitizedUrl: 'https://track.example/?next=%2Fworkspace',
      token: null,
    });
  });
});
