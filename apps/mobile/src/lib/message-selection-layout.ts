export const MESSAGE_MAX_WIDTH_RATIO = 0.7;
export const MAX_MESSAGE_WIDTH = 480;
export const VOICE_MESSAGE_MAX_WIDTH_RATIO = 0.78;
export const MAX_VOICE_MESSAGE_WIDTH = 340;
const MESSAGE_MEDIA_MAX_WIDTH_RATIO = 0.72;
const MESSAGE_MEDIA_MAX_WIDTH = 320;

export type MessageSelectionIndicatorSide = 'left' | 'right';

export function selectionIndicatorSide(isOwnMessage: boolean): MessageSelectionIndicatorSide {
  return isOwnMessage ? 'left' : 'right';
}

export function messageBubbleMaxWidth(windowWidth: number) {
  return Math.max(0, Math.min(windowWidth * MESSAGE_MAX_WIDTH_RATIO, MAX_MESSAGE_WIDTH));
}

export function voiceMessageMaxWidth(windowWidth: number) {
  return Math.max(0, Math.min(windowWidth * VOICE_MESSAGE_MAX_WIDTH_RATIO, MAX_VOICE_MESSAGE_WIDTH));
}

export function chatMessageMediaWidth(windowWidth: number) {
  return Math.max(
    0,
    Math.min(windowWidth * MESSAGE_MEDIA_MAX_WIDTH_RATIO, MESSAGE_MEDIA_MAX_WIDTH, windowWidth * MESSAGE_MAX_WIDTH_RATIO),
  );
}

/** Selection controls float outside the message row and never consume bubble width. */
export function messageSelectionLayout({
  isOwnMessage,
  selectionMode,
  windowWidth,
}: {
  isOwnMessage: boolean;
  selectionMode: boolean;
  windowWidth: number;
}) {
  return {
    indicatorSide: selectionMode ? selectionIndicatorSide(isOwnMessage) : null,
    voicePlayerWidth: voiceMessageMaxWidth(windowWidth),
  };
}
