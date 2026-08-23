import { describe, expect, it } from 'vitest';

import { requireServiceUrl } from './service-url';

describe('requireServiceUrl', () => {
  it('requires HTTPS in production', () => {
    expect(() => requireServiceUrl({
      isProduction: true,
      name: 'EXPO_PUBLIC_CONVEX_URL',
      value: 'http://track.example',
    })).toThrow('must use HTTPS in production');
    expect(requireServiceUrl({
      isProduction: true,
      name: 'EXPO_PUBLIC_CONVEX_URL',
      value: 'https://track.example',
    })).toBe('https://track.example');
  });

  it('allows HTTP only outside production', () => {
    expect(requireServiceUrl({
      isProduction: false,
      name: 'EXPO_PUBLIC_APP_URL',
      value: 'http://localhost:3000',
    })).toBe('http://localhost:3000');
  });

  it('rejects malformed URLs, credentials, and non-web schemes', () => {
    expect(() => requireServiceUrl({
      isProduction: false,
      name: 'EXPO_PUBLIC_APP_URL',
      value: 'not a url',
    })).toThrow('must be a valid URL');
    expect(() => requireServiceUrl({
      isProduction: false,
      name: 'EXPO_PUBLIC_APP_URL',
      value: 'https://user:secret@track.example',
    })).toThrow('must not contain credentials');
    expect(() => requireServiceUrl({
      isProduction: false,
      name: 'EXPO_PUBLIC_APP_URL',
      value: 'file:///tmp/track',
    })).toThrow('must use HTTP or HTTPS');
  });
});
