import { describe, expect, it } from 'vitest';

import { shouldPlaceTextMetaInline } from './text-message-layout';

describe('shouldPlaceTextMetaInline', () => {
  it('keeps a short message and its delivery metadata together', () => {
    expect(shouldPlaceTextMetaInline('On my way', 393, 1)).toBe(true);
  });

  it('gives a long message the full line width without receipt overlap', () => {
    expect(shouldPlaceTextMetaInline('Please review the next handoff before the check-in.', 393, 1)).toBe(false);
    expect(shouldPlaceTextMetaInline('Benachrichtigungseinstellungen', 320, 1)).toBe(false);
    expect(shouldPlaceTextMetaInline('Line one\nLine two', 393, 1)).toBe(false);
  });

  it('reserves less inline space at larger text sizes', () => {
    expect(shouldPlaceTextMetaInline('Review this now', 320, 2)).toBe(false);
  });
});
