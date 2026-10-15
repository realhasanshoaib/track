import { describe, expect, it } from 'vitest';
import { projectVoiceNoteProgress } from './voice-note-progress';

describe('voice progress between native timestamps', () => {
  it.each([1, 1.5, 2])('follows actual playback speed %s without faster native polling', (rate) => {
    const frame = projectVoiceNoteProgress(2, 10, rate, 500);
    expect(frame.from).toBe(0.2);
    expect(frame.to).toBeCloseTo((2 + 0.5 * rate) / 10);
    expect(frame.duration).toBe(500);
  });
  it('arrives at the end at the correct time instead of slowing the last segment', () => {
    const frame = projectVoiceNoteProgress(9.8, 10, 2, 500);
    expect(frame.from).toBeCloseTo(0.98);
    expect(frame.to).toBe(1);
    expect(frame.duration).toBeCloseTo(100);
  });
  it('does not run past the end or animate invalid timestamps or rates', () => {
    expect(projectVoiceNoteProgress(11, 10, 1, 500)).toEqual({ from: 1, to: 1, duration: 0 });
    expect(projectVoiceNoteProgress(2, 0, 1, 500)).toEqual({ from: 0, to: 0, duration: 0 });
    expect(projectVoiceNoteProgress(2, 10, 0, 500)).toEqual({ from: 0.2, to: 0.2, duration: 0 });
    expect(projectVoiceNoteProgress(2, 10, NaN, 500)).toEqual({ from: 0.2, to: 0.2, duration: 0 });
    expect(projectVoiceNoteProgress(NaN, 10, 1, 500)).toEqual({ from: 0, to: 0, duration: 0 });
  });
});
