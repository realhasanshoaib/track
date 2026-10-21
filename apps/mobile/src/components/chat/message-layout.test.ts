import { describe, expect, it } from 'vitest';

import { messageSelectionLayout } from '../../lib/message-selection-layout';

describe('message selection layout', () => {
  it('places the selection indicator outside the edge opposite each bubble', () => {
    expect(messageSelectionLayout({ isOwnMessage: true, selectionMode: true, windowWidth: 390 }).indicatorSide).toBe('left');
    expect(messageSelectionLayout({ isOwnMessage: false, selectionMode: true, windowWidth: 390 }).indicatorSide).toBe('right');
  });

  it('keeps voice-note width unchanged when selection controls appear', () => {
    const normalWidth = messageSelectionLayout({ isOwnMessage: true, selectionMode: false, windowWidth: 390 }).voicePlayerWidth;

    expect(messageSelectionLayout({ isOwnMessage: true, selectionMode: true, windowWidth: 390 }).voicePlayerWidth).toBe(normalWidth);
    expect(messageSelectionLayout({ isOwnMessage: false, selectionMode: true, windowWidth: 390 }).voicePlayerWidth).toBe(normalWidth);
  });
});
