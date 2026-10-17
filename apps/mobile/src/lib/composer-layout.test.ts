import { describe, expect, it } from 'vitest';

import { composerTextMaxHeight } from './composer-layout';

describe('composer text height', () => {
  it('caps the input at four lines using the active font scale', () => {
    expect(composerTextMaxHeight(20, 1, 2)).toBe(80);
    expect(composerTextMaxHeight(20, 1.5, 2)).toBe(120);
    expect(composerTextMaxHeight(20, 3, 2)).toBe(160);
  });
});
