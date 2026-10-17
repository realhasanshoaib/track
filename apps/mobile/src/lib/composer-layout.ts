export const ComposerVisibleLineLimit = 4;

export function composerTextMaxHeight(lineHeight: number, fontScale: number, maxFontScale: number) {
  return Math.ceil(lineHeight * ComposerVisibleLineLimit * Math.min(fontScale, maxFontScale));
}

/** Keep Android composer controls legible when message media scrolls underneath. */
export function composerSurfaceBackgroundColor(platform: string, background: string, translucent: string) {
  return platform === 'android' ? background : translucent;
}
