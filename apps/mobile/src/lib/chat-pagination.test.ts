import { describe, expect, it } from 'vitest';

import { olderMessagesState, shouldAutoLoadOlderMessages, shouldPrefetchHistory } from './chat-pagination';

describe('older message pagination state', () => {
  it('keeps the history row available while either source is loading', () => {
    expect(olderMessagesState(['LoadingMore', 'Exhausted'])).toEqual({ hasMore: true, loading: true });
    expect(olderMessagesState(['Exhausted', 'CanLoadMore'])).toEqual({ hasMore: true, loading: false });
    expect(olderMessagesState(['Exhausted', 'Exhausted'])).toEqual({ hasMore: false, loading: false });
  });

  it('auto loads only when the reader has intentionally reached the older edge', () => {
    const base = { armed: true, hasMore: true, loading: false, userInitiated: true };
    expect(shouldAutoLoadOlderMessages({ ...base, offsetY: 32 })).toBe(true);
    expect(shouldAutoLoadOlderMessages({ ...base, offsetY: -24 })).toBe(true);
    expect(shouldAutoLoadOlderMessages({ ...base, offsetY: 100 })).toBe(false);
    expect(shouldAutoLoadOlderMessages({ ...base, offsetY: 0, userInitiated: false })).toBe(false);
    expect(shouldAutoLoadOlderMessages({ ...base, offsetY: 0, armed: false })).toBe(false);
    expect(shouldAutoLoadOlderMessages({ ...base, offsetY: 0, loading: true })).toBe(false);
    expect(shouldAutoLoadOlderMessages({ ...base, offsetY: 0, hasMore: false })).toBe(false);
  });

  it('fills a short chat automatically without prefetching a full viewport', () => {
    const base = { contentHeight: 480, viewportHeight: 520, hasMore: true, loading: false };
    expect(shouldPrefetchHistory(base)).toBe(true);
    expect(shouldPrefetchHistory({ ...base, contentHeight: 900 })).toBe(false);
    expect(shouldPrefetchHistory({ ...base, hasMore: false })).toBe(false);
    expect(shouldPrefetchHistory({ ...base, loading: true })).toBe(false);
    expect(shouldPrefetchHistory({ ...base, viewportHeight: 0 })).toBe(false);
  });
});
