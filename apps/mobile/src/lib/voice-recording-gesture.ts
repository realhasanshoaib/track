export type VoiceGestureOutcome = 0 | 1 | 2;
export type VoiceGestureMode = 'idle' | 'locked' | 'recording';

export const VoiceGestureCancelDistance = -90;
export const VoiceGestureLockDistance = -64;

/** Resolves the first hold gesture threshold and keeps that choice sticky. */
export function nextVoiceGestureOutcome(
  current: VoiceGestureOutcome,
  translationX: number,
  translationY: number,
): VoiceGestureOutcome {
  'worklet';
  if (current !== 0) return current;
  if (translationX <= VoiceGestureCancelDistance) return 1;
  if (translationY <= VoiceGestureLockDistance) return 2;
  return 0;
}

/** A normal hold release finishes only an active, unlocked recording. */
export function shouldFinishVoiceOnRelease(mode: VoiceGestureMode, outcome: VoiceGestureOutcome) {
  'worklet';
  return mode === 'recording' && outcome === 0;
}
