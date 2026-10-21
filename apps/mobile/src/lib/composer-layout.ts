export const ComposerVisibleLineLimit = 4;

/** Switch the input to top alignment as soon as it contains a second line. */
export function composerInputMultilineThreshold(lineHeight: number, verticalInset: number) {
  return lineHeight + verticalInset;
}

export function composerTextMaxHeight(lineHeight: number, fontScale: number, maxFontScale: number) {
  return Math.ceil(lineHeight * ComposerVisibleLineLimit * Math.min(fontScale, maxFontScale));
}

export function composerControlVisibility(mode: string, keyboardVisible: boolean, hasContent: boolean) {
  return {
    sendAction: mode === 'idle',
    voiceControl: mode === 'idle' && !keyboardVisible && !hasContent,
  };
}

export function composerAttachmentStripMetrics(hasItems: boolean, stripHeight: number, collapseSpacing: number) {
  return {
    height: hasItems ? stripHeight : 0,
    marginBottom: hasItems ? 0 : -collapseSpacing,
  };
}

export function composerAttachmentStripLayout(tileSize: number, topPadding: number, bottomPadding: number) {
  return {
    height: tileSize + topPadding + bottomPadding,
    paddingBottom: bottomPadding,
    paddingTop: topPadding,
  };
}

/** Keep Android composer controls legible when message media scrolls underneath. */
export function composerSurfaceBackgroundColor(platform: string, background: string, translucent: string) {
  return platform === 'android' ? background : translucent;
}
