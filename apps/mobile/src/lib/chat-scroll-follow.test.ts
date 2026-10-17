import { describe, expect, it, vi } from 'vitest';

import {
  restoreChatScrollAfterDeletion,
  scheduleLatestScrollAfterViewportLayout,
  scrollListToLatest,
  shouldCompensateAndroidKeyboardInset,
} from './chat-scroll-follow';

describe('scrollListToLatest', () => {
  it('scrolls to the measured bottom after keyboard padding expands content', () => {
    const list = { scrollToEnd: vi.fn(), scrollToOffset: vi.fn() };

    scrollListToLatest(list, { contentHeight: 2_896, viewportHeight: 731 });

    expect(list.scrollToOffset).toHaveBeenCalledWith({ animated: false, offset: 2_165 });
    expect(list.scrollToEnd).not.toHaveBeenCalled();
  });

  it('uses scrollToEnd until native content and viewport sizes are measured', () => {
    const list = { scrollToEnd: vi.fn(), scrollToOffset: vi.fn() };

    scrollListToLatest(list, { contentHeight: 0, viewportHeight: 0 });

    expect(list.scrollToEnd).toHaveBeenCalledWith({ animated: false });
    expect(list.scrollToOffset).not.toHaveBeenCalled();
  });
});

describe('restoreChatScrollAfterDeletion', () => {
  it('restores the reader to the same offset when they were browsing history', () => {
    const list = { scrollToEnd: vi.fn(), scrollToOffset: vi.fn() };
    const scrollToLatest = vi.fn();

    restoreChatScrollAfterDeletion(
      list,
      { offsetY: 1_248, wasAtBottom: false, followingLatest: false, pinAfterSend: false },
      scrollToLatest,
    );

    expect(list.scrollToOffset).toHaveBeenCalledWith({ animated: false, offset: 1_248 });
    expect(list.scrollToEnd).not.toHaveBeenCalled();
    expect(scrollToLatest).not.toHaveBeenCalled();
  });

  it('keeps the reader pinned to latest when deletion happens at the bottom', () => {
    const list = { scrollToEnd: vi.fn(), scrollToOffset: vi.fn() };
    const scrollToLatest = vi.fn();

    restoreChatScrollAfterDeletion(
      list,
      { offsetY: 1_248, wasAtBottom: true, followingLatest: false, pinAfterSend: false },
      scrollToLatest,
    );

    expect(scrollToLatest).toHaveBeenCalledOnce();
    expect(list.scrollToOffset).not.toHaveBeenCalled();
  });

  it('clamps a negative rubber-band offset before restoring it', () => {
    const list = { scrollToEnd: vi.fn(), scrollToOffset: vi.fn() };

    restoreChatScrollAfterDeletion(
      list,
      { offsetY: -18, wasAtBottom: false, followingLatest: false, pinAfterSend: false },
      vi.fn(),
    );

    expect(list.scrollToOffset).toHaveBeenCalledWith({ animated: false, offset: 0 });
  });
});

describe('shouldCompensateAndroidKeyboardInset', () => {
  it('adds an IME-sized inset when the keyboard overlays an unchanged viewport', () => {
    expect(shouldCompensateAndroidKeyboardInset(300, 731, 731)).toBe(true);
  });

  it('does not add a second IME inset when Android resized the list viewport', () => {
    expect(shouldCompensateAndroidKeyboardInset(300, 431, 731)).toBe(false);
  });

  it('does not compensate before a baseline viewport or after the keyboard closes', () => {
    expect(shouldCompensateAndroidKeyboardInset(300, 731, null)).toBe(false);
    expect(shouldCompensateAndroidKeyboardInset(0, 731, 731)).toBe(false);
  });
});

describe('scheduleLatestScrollAfterViewportLayout', () => {
  it('re-pins after the keyboard changes the list viewport while following latest', () => {
    const frames: Array<() => void> = [];
    const scrollToLatest = vi.fn();

    scheduleLatestScrollAfterViewportLayout(
      { wasAtBottom: false, followingLatest: true, pinAfterSend: false },
      scrollToLatest,
      (callback) => frames.push(callback),
    );

    expect(scrollToLatest).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    frames[0]?.();
    expect(scrollToLatest).toHaveBeenCalledOnce();
  });

  it('keeps the latest message visible when the viewport shrinks from the bottom', () => {
    const frames: Array<() => void> = [];

    scheduleLatestScrollAfterViewportLayout(
      { wasAtBottom: true, followingLatest: false, pinAfterSend: false },
      vi.fn(),
      (callback) => frames.push(callback),
    );

    expect(frames).toHaveLength(1);
  });

  it('does not pull the reader down after they scroll away from the latest message', () => {
    const frames: Array<() => void> = [];

    scheduleLatestScrollAfterViewportLayout(
      { wasAtBottom: false, followingLatest: false, pinAfterSend: false },
      vi.fn(),
      (callback) => frames.push(callback),
    );

    expect(frames).toHaveLength(0);
  });

  it('re-pins the latest pending message after a viewport change', () => {
    const frames: Array<() => void> = [];

    scheduleLatestScrollAfterViewportLayout(
      { wasAtBottom: false, followingLatest: false, pinAfterSend: true },
      vi.fn(),
      (callback) => frames.push(callback),
    );

    expect(frames).toHaveLength(1);
  });
});
