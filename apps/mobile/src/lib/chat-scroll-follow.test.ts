import { describe, expect, it, vi } from 'vitest';

import {
  createCoalescedChatScrollScheduler,
  followLatestAfterViewportLayout,
  restoreChatScrollAfterDeletion,
  scrollListToLatest,
  shouldCompensateAndroidKeyboardInset,
} from './chat-scroll-follow';

describe('createCoalescedChatScrollScheduler', () => {
  it('runs only the latest requested scroll once per frame', () => {
    const frames: Array<() => void> = [];
    const schedule = createCoalescedChatScrollScheduler((callback) => frames.push(callback));
    const firstScroll = vi.fn();
    const latestScroll = vi.fn();

    schedule(firstScroll);
    schedule(latestScroll);

    expect(frames).toHaveLength(1);
    expect(firstScroll).not.toHaveBeenCalled();
    expect(latestScroll).not.toHaveBeenCalled();

    frames[0]?.();

    expect(firstScroll).not.toHaveBeenCalled();
    expect(latestScroll).toHaveBeenCalledOnce();
  });

  it('schedules later layout changes on the next frame', () => {
    const frames: Array<() => void> = [];
    const schedule = createCoalescedChatScrollScheduler((callback) => frames.push(callback));
    const scroll = vi.fn();

    schedule(scroll);
    frames[0]?.();
    schedule(scroll);

    expect(frames).toHaveLength(2);
    frames[1]?.();
    expect(scroll).toHaveBeenCalledTimes(2);
  });
});

describe('scrollListToLatest', () => {
  it('scrolls through the fixed composer padding after an insert', () => {
    const list = { scrollToEnd: vi.fn(), scrollToOffset: vi.fn() };

    scrollListToLatest(list, { contentHeight: 3_484, viewportHeight: 651 });

    expect(list.scrollToOffset).toHaveBeenCalledWith({ animated: false, offset: 2_833 });
    expect(list.scrollToEnd).not.toHaveBeenCalled();
  });

  it('keeps native animation choice when moving to the latest row', () => {
    const list = { scrollToEnd: vi.fn(), scrollToOffset: vi.fn() };

    scrollListToLatest(list, { contentHeight: 3_484, viewportHeight: 651 }, true);

    expect(list.scrollToOffset).toHaveBeenCalledWith({ animated: true, offset: 2_833 });
    expect(list.scrollToEnd).not.toHaveBeenCalled();
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

describe('followLatestAfterViewportLayout', () => {
  it('requests a re-pin after the keyboard changes the list viewport while following latest', () => {
    const scrollToLatest = vi.fn();

    followLatestAfterViewportLayout(
      { wasAtBottom: false, followingLatest: true, pinAfterSend: false },
      scrollToLatest,
    );

    expect(scrollToLatest).toHaveBeenCalledOnce();
  });

  it('keeps the latest message visible when the viewport shrinks from the bottom', () => {
    const scrollToLatest = vi.fn();
    followLatestAfterViewportLayout(
      { wasAtBottom: true, followingLatest: false, pinAfterSend: false },
      scrollToLatest,
    );

    expect(scrollToLatest).toHaveBeenCalledOnce();
  });

  it('does not pull the reader down after they scroll away from the latest message', () => {
    const scrollToLatest = vi.fn();

    followLatestAfterViewportLayout(
      { wasAtBottom: false, followingLatest: false, pinAfterSend: false },
      scrollToLatest,
    );

    expect(scrollToLatest).not.toHaveBeenCalled();
  });

  it('re-pins the latest pending message after a viewport change', () => {
    const scrollToLatest = vi.fn();

    followLatestAfterViewportLayout(
      { wasAtBottom: false, followingLatest: false, pinAfterSend: true },
      scrollToLatest,
    );

    expect(scrollToLatest).toHaveBeenCalledOnce();
  });
});
