import { describe, expect, it } from 'vitest';

import { canOpenExistingThread } from './release-config';

describe('existing thread navigation', () => {
  it('keeps a visible thread actionable while release flags are loading', () => {
    expect(canOpenExistingThread(true, false)).toBe(true);
  });

  it('respects the threads release flag after it loads', () => {
    expect(canOpenExistingThread(false, true)).toBe(true);
    expect(canOpenExistingThread(false, false)).toBe(false);
  });
});
