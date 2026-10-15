import { describe, expect, it } from 'vitest';

import { threadSlug } from './thread-name';

describe('threadSlug', () => {
  it('formats a readable thread name as a connected slug', () => {
    expect(threadSlug('Patient Portal: release review')).toBe('patient-portal-release-review');
  });

  it('preserves Unicode letters while normalizing punctuation', () => {
    expect(threadSlug('München – café')).toBe('münchen-café');
  });

  it('uses a stable fallback when a name has no letters or numbers', () => {
    expect(threadSlug('  ✨  ')).toBe('thread');
  });
});
