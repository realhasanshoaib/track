import { describe, expect, it } from 'vitest';

import { shouldShowJumpToLatest } from './thread-list';

describe('shouldShowJumpToLatest', () => {
  it('hides the control near the latest messages and shows it after a longer scroll', () => {
    expect(shouldShowJumpToLatest(0)).toBe(false);
    expect(shouldShowJumpToLatest(80)).toBe(false);
    expect(shouldShowJumpToLatest(321)).toBe(true);
  });
});
