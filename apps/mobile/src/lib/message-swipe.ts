export type MessageSwipeIntent = 'actions' | 'reply' | 'close';
export type MessageActionsSwipeDirection = 'left' | 'right';

/** Keeps a translated message row inside the viewport as its action tray opens. */
export function messageSwipeContentWidth(containerWidth: number, actionWidth: number) {
  'worklet';
  return Math.max(0, containerWidth - actionWidth);
}

/** Returns an interrupted gesture to its last settled tray state. */
export function messageSwipeCancelIntent(trayAlreadyOpen: boolean): MessageSwipeIntent {
  'worklet';
  return trayAlreadyOpen ? 'actions' : 'close';
}

/** Maps a completed horizontal drag to the action surface it is allowed to open. */
export function messageSwipeIntent(
  translationX: number,
  canReply: boolean,
  canOpenActions: boolean,
  trayAlreadyOpen = false,
  actionsDirection: MessageActionsSwipeDirection = 'left',
): MessageSwipeIntent {
  'worklet';
  const direction = actionsDirection === 'right' ? 1 : -1;
  const actionDistance = translationX * direction;
  if (trayAlreadyOpen) return actionDistance <= -56 ? 'close' : 'actions';
  if (actionDistance >= 56 && canOpenActions) return 'actions';
  if (actionDistance <= -56 && canReply) return 'reply';
  return 'close';
}
