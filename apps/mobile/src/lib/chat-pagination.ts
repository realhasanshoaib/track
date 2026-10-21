export const CHAT_HISTORY_TOP_LOAD_THRESHOLD = 64;
export const CHAT_HISTORY_REARM_THRESHOLD = 160;

export type ChatPageStatus = 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';

export function olderMessagesState(statuses: readonly ChatPageStatus[]): { hasMore: boolean; loading: boolean } {
  return {
    hasMore: statuses.some((status) => status === 'CanLoadMore' || status === 'LoadingMore'),
    loading: statuses.some((status) => status === 'LoadingMore'),
  };
}

export function shouldAutoLoadOlderMessages(options: {
  armed: boolean;
  hasMore: boolean;
  loading: boolean;
  offsetY: number;
  userInitiated: boolean;
}): boolean {
  return options.userInitiated && options.armed && options.hasMore && !options.loading &&
    options.offsetY >= -32 && options.offsetY <= CHAT_HISTORY_TOP_LOAD_THRESHOLD;
}

/** Keep sparse conversations filled without displaying a history control. */
export function shouldPrefetchHistory({ contentHeight, viewportHeight, hasMore, loading }: {
  contentHeight: number;
  viewportHeight: number;
  hasMore: boolean;
  loading: boolean;
}) {
  return hasMore && !loading && viewportHeight > 0 && contentHeight > 0 &&
    contentHeight <= viewportHeight + CHAT_HISTORY_TOP_LOAD_THRESHOLD;
}
