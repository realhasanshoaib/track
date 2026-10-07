import { describe, expect, it } from 'vitest';

import { messageSwipeCancelIntent, messageSwipeContentWidth, messageSwipeIntent } from './message-swipe';

describe('message swipe actions', () => {
  it('reserves space for the action tray so right-aligned messages stay in the viewport', () => {
    expect(messageSwipeContentWidth(320, 0)).toBe(320);
    expect(messageSwipeContentWidth(320, 72)).toBe(248);
    expect(messageSwipeContentWidth(40, 72)).toBe(0);
  });

  it('opens message actions after a left swipe on iOS', () => {
    expect(messageSwipeIntent(-72, true, true)).toBe('actions');
  });

  it('keeps the existing right-swipe reply gesture', () => {
    expect(messageSwipeIntent(72, true, true)).toBe('reply');
  });

  it('opens the message menu on a right swipe on Android', () => {
    expect(messageSwipeIntent(72, true, true, false, 'right')).toBe('actions');
  });

  it('keeps reply on the opposite swipe direction on Android', () => {
    expect(messageSwipeIntent(-72, true, true, false, 'right')).toBe('reply');
  });

  it('closes an open action tray on a right swipe without entering reply mode', () => {
    expect(messageSwipeIntent(72, true, true, true)).toBe('close');
  });

  it('closes the Android action tray on a left swipe', () => {
    expect(messageSwipeIntent(-72, true, true, true, 'right')).toBe('close');
  });

  it('keeps the action tray open after a short drag', () => {
    expect(messageSwipeIntent(24, true, true, true)).toBe('actions');
  });

  it('does not open unavailable actions or respond to a short drag', () => {
    expect(messageSwipeIntent(-72, true, false)).toBe('close');
    expect(messageSwipeIntent(-32, true, true)).toBe('close');
    expect(messageSwipeIntent(72, false, true)).toBe('close');
  });

  it('returns an interrupted swipe to its last settled state', () => {
    expect(messageSwipeCancelIntent(false)).toBe('close');
    expect(messageSwipeCancelIntent(true)).toBe('actions');
  });
});
