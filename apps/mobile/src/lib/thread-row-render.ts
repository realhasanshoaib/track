/** Values that change the rendered content or current interaction rules for a row. */
export type ThreadRowRenderState = {
  actionSignature: string;
  highlighted: boolean;
  interactionAvailability: string;
  interactionVersion: unknown;
  isFirstInGroup: boolean;
  isOwnMessage: boolean;
  item: unknown;
  readReceipts: unknown;
  selected: boolean;
  selectionMode: boolean;
  variant: string;
};

/**
 * Parent chat screens often refresh event closures while the message itself is
 * unchanged. The interaction version changes when those closures capture new
 * behavior, allowing React.memo to skip the expensive bubble/media subtree on
 * composer-only renders.
 */
export function areThreadRowRenderStatesEqual(previous: ThreadRowRenderState, next: ThreadRowRenderState) {
  return previous.item === next.item
    && previous.interactionVersion === next.interactionVersion
    && previous.actionSignature === next.actionSignature
    && previous.highlighted === next.highlighted
    && previous.interactionAvailability === next.interactionAvailability
    && previous.isFirstInGroup === next.isFirstInGroup
    && previous.isOwnMessage === next.isOwnMessage
    && previous.readReceipts === next.readReceipts
    && previous.selected === next.selected
    && previous.selectionMode === next.selectionMode
    && previous.variant === next.variant;
}
