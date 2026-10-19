export const ComposerVisibleLineLimit = 4;

export function composerTextMaxHeight(lineHeight: number, fontScale: number, maxFontScale: number) {
  return Math.ceil(lineHeight * ComposerVisibleLineLimit * Math.min(fontScale, maxFontScale));
}

export function composerControlVisibility(mode: string, keyboardVisible: boolean, hasContent: boolean) {
  return {
    sendAction: mode === 'idle',
    voiceControl: mode === 'idle' && !keyboardVisible && !hasContent,
  };
}

export function composerAttachmentStripMetrics(hasItems: boolean, reserveSpace: boolean, stripHeight: number, collapseSpacing: number) {
  const reserved = hasItems || reserveSpace;
  return {
    height: reserved ? stripHeight : 0,
    marginBottom: reserved ? 0 : -collapseSpacing,
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
