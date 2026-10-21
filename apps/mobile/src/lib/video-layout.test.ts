import { describe, expect, it } from 'vitest';

import { chatVideoAspectRatio, chatVideoFrameSize, DefaultChatVideoAspectRatio } from './video-layout';

describe('chatVideoAspectRatio', () => {
  it('uses a stable landscape frame when dimensions are not available', () => {
    expect(chatVideoAspectRatio({})).toBe(DefaultChatVideoAspectRatio);
    expect(chatVideoAspectRatio({ width: 0, height: 0 })).toBe(DefaultChatVideoAspectRatio);
  });

  it('preserves portrait and landscape video geometry', () => {
    expect(chatVideoAspectRatio({ width: 1080, height: 1920 })).toBeCloseTo(0.5625);
    expect(chatVideoAspectRatio({ width: 1920, height: 1080 })).toBeCloseTo(16 / 9);
  });

  it('clamps unusual metadata to stable message bounds', () => {
    expect(chatVideoAspectRatio({ width: 100_000, height: 1 })).toBe(1.9);
    expect(chatVideoAspectRatio({ width: 1, height: 100_000 })).toBe(0.56);
  });
});

describe('chatVideoFrameSize', () => {
  it('keeps a landscape frame at the normal media width', () => {
    expect(chatVideoFrameSize(280, 700, 16 / 9)).toEqual({ width: 280, height: 157.5 });
  });

  it('caps tall videos to the available viewport without cropping the frame', () => {
    const frame = chatVideoFrameSize(280, 700, 9 / 16);
    expect(frame.height).toBeCloseTo(378);
    expect(frame.width / frame.height).toBeCloseTo(9 / 16);
  });
});
