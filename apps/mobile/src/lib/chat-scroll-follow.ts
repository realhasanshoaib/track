export interface ViewportLayoutFollowState {
  followingLatest: boolean;
  pinAfterSend: boolean;
  wasAtBottom: boolean;
}

export interface ChatScrollMetrics {
  contentHeight: number;
  viewportHeight: number;
}

export interface ChatListScrollTarget {
  scrollToEnd(options: { animated: boolean }): void;
  scrollToOffset(options: { animated: boolean; offset: number }): void;
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

export interface ChatDeleteScrollSnapshot extends ViewportLayoutFollowState {
  offsetY: number;
}

/** Restore the reader's place after deleted rows or tombstones change height. */
export function restoreChatScrollAfterDeletion(
  list: ChatListScrollTarget | null,
  snapshot: ChatDeleteScrollSnapshot,
  scrollToLatest: () => void,
): void {
  if (snapshot.wasAtBottom || snapshot.followingLatest || snapshot.pinAfterSend) {
    scrollToLatest();
    return;
  }
  list?.scrollToOffset({ animated: false, offset: Math.max(0, snapshot.offsetY) });
}

/** Use measured layout dimensions so Android applies a changed IME inset immediately. */
export function scrollListToLatest(
  list: ChatListScrollTarget | null,
  metrics: ChatScrollMetrics,
  animated = false,
): void {
  if (!list) return;
  if (metrics.contentHeight <= 0 || metrics.viewportHeight <= 0) {
    list.scrollToEnd({ animated });
    return;
  }
  list.scrollToOffset({
    animated,
    offset: Math.max(0, metrics.contentHeight - metrics.viewportHeight),
  });
}

/** Android needs IME padding only when the native viewport did not resize. */
export function shouldCompensateAndroidKeyboardInset(
  keyboardHeight: number,
  viewportHeight: number,
  viewportHeightBeforeKeyboard: number | null,
): boolean {
  if (keyboardHeight <= 0 || viewportHeightBeforeKeyboard === null) return false;
  const resizeThreshold = Math.max(80, keyboardHeight * 0.5);
  return viewportHeight >= viewportHeightBeforeKeyboard - resizeThreshold;
}

/** Request the latest position after a viewport resize, such as Android IME resize. */
export function followLatestAfterViewportLayout(
  state: ViewportLayoutFollowState,
  scrollToLatest: () => void,
): void {
  if (!state.wasAtBottom && !state.followingLatest && !state.pinAfterSend) return;
  scrollToLatest();
}
