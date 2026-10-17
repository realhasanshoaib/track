import { describe, expect, it, vi } from 'vitest';

import {
  createCoalescedChatScrollScheduler,
  androidKeyboardInsetForViewport,
  followLatestAfterViewportLayout,
  restoreChatScrollAfterDeletion,
  scrollListToLatest,
  shouldFollowLatestAfterContentResize,
  shouldFollowPendingSendAfterContentLayout,
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

describe('shouldFollowLatestAfterContentResize', () => {
  it('follows new content while the reader is pinned to the latest message', () => {
    expect(shouldFollowLatestAfterContentResize(1_000, 1_240, {
      followingLatest: true,
      pinAfterSend: false,
      wasAtBottom: false,
    })).toBe(true);
  });

  it('does not issue a second scroll when the composer inset shrinks after send', () => {
    expect(shouldFollowLatestAfterContentResize(1_240, 1_000, {
      followingLatest: true,
      pinAfterSend: true,
      wasAtBottom: true,
    })).toBe(false);
  });

  it('does not issue another scroll when an optimistic row hands off at the same height', () => {
    expect(shouldFollowLatestAfterContentResize(1_240, 1_240, {
      followingLatest: true,
      pinAfterSend: true,
      wasAtBottom: true,
    })).toBe(false);
  });

  it('does not pull a reader away from history for an unrelated resize', () => {
    expect(shouldFollowLatestAfterContentResize(1_000, 1_240, {
      followingLatest: false,
      pinAfterSend: false,
      wasAtBottom: false,
    })).toBe(false);
  });
});

describe('shouldFollowPendingSendAfterContentLayout', () => {
  it('waits for the pending send layout and follows when the reader is pinned', () => {
    expect(shouldFollowPendingSendAfterContentLayout(true, {
      followingLatest: true,
      pinAfterSend: true,
      wasAtBottom: true,
    })).toBe(true);
  });

  it('does not follow after the reader starts browsing history', () => {
    expect(shouldFollowPendingSendAfterContentLayout(true, {
      followingLatest: false,
      pinAfterSend: false,
      wasAtBottom: false,
    })).toBe(false);
  });

  it('does not issue a stale send follow after the pending send is cleared', () => {
    expect(shouldFollowPendingSendAfterContentLayout(false, {
      followingLatest: true,
      pinAfterSend: true,
      wasAtBottom: true,
    })).toBe(false);
  });
});

describe('scrollListToLatest', () => {
  it('scrolls through the full content including the pending footer', () => {
    const list = { scrollToEnd: vi.fn(), scrollToOffset: vi.fn() };

    scrollListToLatest(list, { contentHeight: 3_484, viewportHeight: 651 });

    expect(list.scrollToOffset).toHaveBeenCalledWith({ animated: false, offset: 2_833 });
    expect(list.scrollToEnd).not.toHaveBeenCalled();
  });

  it('keeps the requested animation when moving to the latest row', () => {
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

describe('androidKeyboardInsetForViewport', () => {
  it('uses the full keyboard height when the window overlays the IME', () => {
    expect(androidKeyboardInsetForViewport(300, 731, 731)).toBe(300);
  });

  it('subtracts the resize already applied by Android', () => {
    expect(androidKeyboardInsetForViewport(300, 431, 731)).toBe(0);
  });

  it('accounts for a partial native resize and handles a missing baseline safely', () => {
    expect(androidKeyboardInsetForViewport(300, 581, 731)).toBe(150);
    expect(androidKeyboardInsetForViewport(300, 731, null)).toBe(300);
    expect(androidKeyboardInsetForViewport(0, 731, 731)).toBe(0);
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
