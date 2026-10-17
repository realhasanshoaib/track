import { describe, expect, it } from 'vitest';

import { composerSurfaceBackgroundColor, composerTextMaxHeight } from './composer-layout';

describe('composer text height', () => {
  it('caps the input at four lines using the active font scale', () => {
    expect(composerTextMaxHeight(20, 1, 2)).toBe(80);
    expect(composerTextMaxHeight(20, 1.5, 2)).toBe(120);
    expect(composerTextMaxHeight(20, 3, 2)).toBe(160);
  });
});

describe('composer surface background', () => {
  it('keeps the Android composer opaque over message media', () => {
    expect(composerSurfaceBackgroundColor('android', '#ffffff', 'rgba(255,255,255,0.1)')).toBe('#ffffff');
  });

  it('preserves the existing translucent treatment on other platforms', () => {
    expect(composerSurfaceBackgroundColor('ios', '#ffffff', 'rgba(255,255,255,0.1)')).toBe('rgba(255,255,255,0.1)');
    expect(composerSurfaceBackgroundColor('web', '#ffffff', 'rgba(255,255,255,0.1)')).toBe('rgba(255,255,255,0.1)');
  });
});
