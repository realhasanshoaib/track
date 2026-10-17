export const ComposerVisibleLineLimit = 4;

export function composerTextMaxHeight(lineHeight: number, fontScale: number, maxFontScale: number) {
  return Math.ceil(lineHeight * ComposerVisibleLineLimit * Math.min(fontScale, maxFontScale));
}
