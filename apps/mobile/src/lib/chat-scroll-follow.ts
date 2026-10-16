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

/** Reapply the latest position after a viewport resize, such as Android IME resize. */
export function scheduleLatestScrollAfterViewportLayout(
  state: ViewportLayoutFollowState,
  scrollToLatest: () => void,
  scheduleFrame: (callback: () => void) => unknown = (callback) => requestAnimationFrame(callback),
): void {
  if (!state.wasAtBottom && !state.followingLatest && !state.pinAfterSend) return;
  scheduleFrame(() => scrollToLatest());
}
