import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetailedMessage } from '../components/chat/types';
import type { PendingMessage } from '../lib/pending-messages';
import { usePendingMessageReconciliation } from './use-pending-message-reconciliation';

const harness = vi.hoisted(() => ({
  effect: undefined as (() => void | (() => void)) | undefined,
  prefetch: vi.fn(),
  cache: { current: new Map<string, Promise<boolean>>() },
}));
vi.mock('expo-image', () => ({ Image: { prefetch: harness.prefetch } }));
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => { harness.effect = effect; },
  useRef: () => harness.cache,
}));

// Only query fields read by reconciliation are relevant to this adapter fixture.
const messages = [{
  message: { _id: 'message-1' },
  attachments: [{ attachment: { contentType: 'image/jpeg', previewStatus: 'ready' },
    previewUrl: 'https://example.test/preview.jpg', url: 'https://example.test/original.jpg' }],
}] as DetailedMessage[];
const pending: PendingMessage[] = [{ at: 1, id: 'pending-1', messageId: 'message-1', body: '',
  attachments: [{ id: 'file-1', filename: 'photo.jpg', contentType: 'image/jpeg', uri: 'file://photo.jpg' }] }];

describe('pending image handoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    harness.cache.current.clear();
    harness.prefetch.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('retains the local image until its confirmed preview is cached', async () => {
    let ready!: (value: boolean) => void;
    harness.prefetch.mockReturnValue(new Promise<boolean>(resolve => { ready = resolve; }));
    const update = vi.fn();
    usePendingMessageReconciliation(messages, pending, update);
    harness.effect?.();
    expect(update).not.toHaveBeenCalled();
    expect(harness.prefetch).toHaveBeenCalledWith('https://example.test/preview.jpg', { cachePolicy: 'memory-disk' });
    ready(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0](pending)).toEqual([]);
  });

  it.each([false, true])('finishes the handoff after a cache result of %s', async (result) => {
    harness.prefetch.mockResolvedValue(result);
    const update = vi.fn();
    usePendingMessageReconciliation(messages, pending, update);
    harness.effect?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a stalled cache request and ignores completion after unmount', async () => {
    harness.prefetch.mockReturnValue(new Promise(() => {}));
    const update = vi.fn();
    usePendingMessageReconciliation(messages, pending, update);
    const cleanup = harness.effect?.();
    await vi.advanceTimersByTimeAsync(1999);
    expect(update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(update).toHaveBeenCalledOnce();
    if (cleanup) cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('deduplicates cache requests during upload progress and cancels stale updates', async () => {
    let ready!: (value: boolean) => void;
    harness.prefetch.mockReturnValue(new Promise<boolean>(resolve => { ready = resolve; }));
    const staleUpdate = vi.fn();
    usePendingMessageReconciliation(messages, pending, staleUpdate);
    const cleanup = harness.effect?.();
    if (cleanup) cleanup();
    const update = vi.fn();
    usePendingMessageReconciliation(messages, pending, update);
    harness.effect?.();
    expect(harness.prefetch).toHaveBeenCalledOnce();
    ready(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(staleUpdate).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});
