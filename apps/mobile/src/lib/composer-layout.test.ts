import { describe, expect, it } from 'vitest';

import { composerAttachmentStripLayout, composerAttachmentStripMetrics, composerControlVisibility, composerInputMultilineThreshold, composerSurfaceBackgroundColor, composerTextMaxHeight } from './composer-layout';

describe('composer text height', () => {
  it('caps the input at four lines using the active font scale', () => {
    expect(composerTextMaxHeight(20, 1, 2)).toBe(80);
    expect(composerTextMaxHeight(20, 1.5, 2)).toBe(120);
    expect(composerTextMaxHeight(20, 3, 2)).toBe(160);
  });

  it('switches to multiline alignment after one line instead of waiting for several lines', () => {
    const threshold = composerInputMultilineThreshold(24, 8);
    expect(threshold).toBe(32);
    expect(28 > threshold).toBe(false);
    expect(48 > threshold).toBe(true);
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

describe('composer action visibility', () => {
  it('keeps the yellow send action present for idle drafts with the keyboard open or closed', () => {
    expect(composerControlVisibility('idle', false, false).sendAction).toBe(true);
    expect(composerControlVisibility('idle', true, false).sendAction).toBe(true);
    expect(composerControlVisibility('idle', true, true).sendAction).toBe(true);
  });

  it('shows the inline voice control only for an empty draft with the keyboard closed', () => {
    expect(composerControlVisibility('idle', false, false).voiceControl).toBe(true);
    expect(composerControlVisibility('idle', true, false).voiceControl).toBe(false);
    expect(composerControlVisibility('idle', false, true).voiceControl).toBe(false);
    expect(composerControlVisibility('recording', false, false).voiceControl).toBe(false);
  });
});

describe('composer attachment strip layout', () => {
  it('keeps the selected image flush with the strip bottom and removes empty strip height while sending', () => {
    const layout = composerAttachmentStripLayout(76, 4, 0);
    const visible = composerAttachmentStripMetrics(true, layout.height, 8);
    const hiddenWhileSending = composerAttachmentStripMetrics(false, layout.height, 8);

    expect(layout).toEqual({ height: 80, paddingBottom: 0, paddingTop: 4 });
    expect(visible).toEqual({ height: 80, marginBottom: 0 });
    expect(hiddenWhileSending).toEqual({ height: 0, marginBottom: -8 });
  });

  it('collapses the reserved composer space after the send finishes', () => {
    expect(composerAttachmentStripMetrics(false, 80, 8)).toEqual({ height: 0, marginBottom: -8 });
  });
});
