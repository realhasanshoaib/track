import { useCallback, useSyncExternalStore } from 'react';

type ProgressSnapshot = Readonly<Record<string, number>>;

const EmptyProgressSnapshot: ProgressSnapshot = Object.freeze({});
const progressSnapshots = new Map<string, ProgressSnapshot>();
const progressListeners = new Map<string, Set<() => void>>();

function notifyProgress(messageId: string) {
  for (const listener of progressListeners.get(messageId) ?? []) listener();
}

/** Keep upload progress updates out of the screen-level message-list state. */
export function reportPendingMessageProgress(messageId: string, attachmentId: string, progress: number) {
  if (!Number.isFinite(progress)) return;
  const bounded = Math.min(Math.max(progress, 0), 1);
  const visibleProgress = bounded === 0 || bounded === 1
    ? bounded
    : Math.round(bounded * 10) / 10;
  const current = progressSnapshots.get(messageId) ?? EmptyProgressSnapshot;
  if (current[attachmentId] === visibleProgress) return;
  progressSnapshots.set(messageId, Object.freeze({ ...current, [attachmentId]: visibleProgress }));
  notifyProgress(messageId);
}

export function clearPendingMessageProgress(messageId: string) {
  if (!progressSnapshots.delete(messageId)) return;
  notifyProgress(messageId);
}

function subscribeToProgress(messageId: string, listener: () => void) {
  let listeners = progressListeners.get(messageId);
  if (!listeners) {
    listeners = new Set();
    progressListeners.set(messageId, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (!listeners?.size) progressListeners.delete(messageId);
  };
}

export function usePendingMessageProgress(messageId: string): ProgressSnapshot {
  const subscribe = useCallback((listener: () => void) => subscribeToProgress(messageId, listener), [messageId]);
  const getSnapshot = useCallback(() => progressSnapshots.get(messageId) ?? EmptyProgressSnapshot, [messageId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
