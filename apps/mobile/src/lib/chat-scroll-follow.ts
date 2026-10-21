export interface ViewportLayoutFollowState {
  followingLatest: boolean;
  pinAfterSend: boolean;
  wasAtBottom: boolean;
}

export interface ChatListScrollTarget {
  scrollToEnd(options: { animated: boolean }): void;
  scrollToOffset(options: { animated: boolean; offset: number }): void;
}

export interface ChatScrollMetrics {
  contentHeight: number;
  viewportHeight: number;
}

/** Focusing the composer must not move a reader away from message history. */
export function shouldFollowLatestOnComposerFocus(isAtLatest: boolean): boolean {
  return isAtLatest;
}

/** Collapse same-frame layout events into one scroll using the latest measurements. */
export function createCoalescedChatScrollScheduler(
  scheduleFrame: (callback: () => void) => unknown = (callback) => requestAnimationFrame(callback),
): (scroll: () => void) => void {
  let frameScheduled = false;
  let latestScroll: (() => void) | null = null;

  return (scroll) => {
    latestScroll = scroll;
    if (frameScheduled) return;
    frameScheduled = true;
    scheduleFrame(() => {
      frameScheduled = false;
      const nextScroll = latestScroll;
      latestScroll = null;
      nextScroll?.();
    });
  };
}

export type ChatDeleteScrollSnapshot = ViewportLayoutFollowState & { userScrolled?: boolean };

/** Keep history readers on FlatList's visible-content anchor after rows change. */
export function restoreChatScrollAfterDeletion(
  snapshot: ChatDeleteScrollSnapshot,
  scrollToLatest: () => void,
): void {
  // A drag during the optimistic delete supersedes the old follow-latest
  // snapshot. Never issue a stale programmatic scroll over the reader's move.
  if (snapshot.userScrolled) return;
  if (snapshot.wasAtBottom || snapshot.followingLatest || snapshot.pinAfterSend) scrollToLatest();
}

/** Use measured layout dimensions so Android applies a changed IME inset immediately. */
export function scrollListToLatest(
  list: ChatListScrollTarget | null,
  metrics: ChatScrollMetrics,
  animated = false,
): void {
  if (!list) return;
  // Pending messages render in ListFooterComponent. FlatList.scrollToEnd can
  // stop at the final data row before that footer, leaving the newest bubble
  // under the keyboard. Use the measured full content end so footer rows count.
  const offset = Math.max(0, Math.ceil(metrics.contentHeight - metrics.viewportHeight));
  list.scrollToOffset({ animated, offset });
}

/** Return only the keyboard overlap the native viewport did not already remove. */
export function androidKeyboardInsetForViewport(
  keyboardHeight: number,
  viewportHeight: number,
  viewportHeightBeforeKeyboard: number | null,
): number {
  if (keyboardHeight <= 0) return 0;
  if (viewportHeightBeforeKeyboard === null || viewportHeight <= 0) return keyboardHeight;
  const viewportReduction = Math.max(0, viewportHeightBeforeKeyboard - viewportHeight);
  return Math.max(0, keyboardHeight - viewportReduction);
}

/** Request the latest position after a viewport resize, such as Android IME resize. */
export function followLatestAfterViewportLayout(
  state: ViewportLayoutFollowState,
  scrollToLatest: () => void,
): void {
  if (!state.wasAtBottom && !state.followingLatest && !state.pinAfterSend) return;
  scrollToLatest();
}

/** A shrinking composer inset is clamped by the native list; re-scrolling it jumps the conversation. */
export function shouldFollowLatestAfterContentResize(
  previousHeight: number,
  nextHeight: number,
  state: ViewportLayoutFollowState,
): boolean {
  return nextHeight > previousHeight &&
    (state.followingLatest || state.wasAtBottom || state.pinAfterSend);
}

/** Wait for a measured content layout before following a newly inserted optimistic message. */
export function shouldFollowPendingSendAfterContentLayout(
  pendingSendFollow: boolean,
  state: ViewportLayoutFollowState,
): boolean {
  return pendingSendFollow &&
    (state.followingLatest || state.wasAtBottom || state.pinAfterSend);
}
