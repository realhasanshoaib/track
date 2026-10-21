import { describe, expect, it } from 'vitest';

import { MAX_MESSAGE_WIDTH, MAX_VOICE_MESSAGE_WIDTH, MESSAGE_MAX_WIDTH_RATIO, messageBubbleMaxWidth, messageSelectionLayout, selectionIndicatorSide, VOICE_MESSAGE_MAX_WIDTH_RATIO } from './message-selection-layout';

describe('message bubble and selection layout', () => {
  it('keeps long text bubbles below seventy percent of the viewport and caps wide screens', () => {
    expect(MESSAGE_MAX_WIDTH_RATIO).toBe(0.7);
    expect(messageBubbleMaxWidth(390)).toBe(273);
    expect(messageBubbleMaxWidth(900)).toBe(MAX_MESSAGE_WIDTH);
    expect(messageBubbleMaxWidth(0)).toBe(0);
  });

  it('keeps the selection indicator on the side opposite the bubble', () => {
    expect(selectionIndicatorSide(true)).toBe('left');
    expect(selectionIndicatorSide(false)).toBe('right');
    expect(messageSelectionLayout({ isOwnMessage: true, selectionMode: false, windowWidth: 390 }).indicatorSide).toBeNull();
  });

  it('does not reduce voice note width when selection mode appears', () => {
    const before = messageSelectionLayout({ isOwnMessage: false, selectionMode: false, windowWidth: 390 });
    const during = messageSelectionLayout({ isOwnMessage: false, selectionMode: true, windowWidth: 390 });
    expect(during.voicePlayerWidth).toBe(before.voicePlayerWidth);
    expect(during.voicePlayerWidth).toBe(390 * VOICE_MESSAGE_MAX_WIDTH_RATIO);
    expect(during.voicePlayerWidth).toBeLessThanOrEqual(MAX_VOICE_MESSAGE_WIDTH);
  });
});
