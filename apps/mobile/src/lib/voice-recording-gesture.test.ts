import { describe, expect, it } from 'vitest';

import {
  nextVoiceGestureOutcome,
  shouldFinishVoiceOnRelease,
} from './voice-recording-gesture';

describe('voice recording gesture release', () => {
  it('waits until a hold crosses the cancel or lock threshold', () => {
    expect(nextVoiceGestureOutcome(0, -89, -63)).toBe(0);
    expect(nextVoiceGestureOutcome(0, -90, 0)).toBe(1);
    expect(nextVoiceGestureOutcome(0, 0, -64)).toBe(2);
  });

  it('keeps the first cancel or lock choice when the finger moves again', () => {
    expect(nextVoiceGestureOutcome(1, 0, -90)).toBe(1);
    expect(nextVoiceGestureOutcome(2, -100, 0)).toBe(2);
  });

  it('prioritizes cancel if one update crosses both thresholds', () => {
    expect(nextVoiceGestureOutcome(0, -100, -70)).toBe(1);
  });

  it('finishes only a normal release of an active recording', () => {
    expect(shouldFinishVoiceOnRelease('recording', 0)).toBe(true);
    expect(shouldFinishVoiceOnRelease('recording', 1)).toBe(false);
    expect(shouldFinishVoiceOnRelease('recording', 2)).toBe(false);
    expect(shouldFinishVoiceOnRelease('locked', 0)).toBe(false);
    expect(shouldFinishVoiceOnRelease('idle', 0)).toBe(false);
  });
});
