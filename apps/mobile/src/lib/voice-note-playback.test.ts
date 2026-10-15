import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetVoiceNotePlayer, toggleVoiceNotePlayback } from './voice-note-playback';

function player() {
  return {
    isLoaded: true,
    playing: false,
    play: vi.fn(function (this: { playing: boolean }) { this.playing = true; }),
    pause: vi.fn(function (this: { playing: boolean }) { this.playing = false; }),
  };
}

const players: ReturnType<typeof player>[] = [];
function voice() { const next = player(); players.push(next); return next; }
afterEach(() => { for (const current of players) forgetVoiceNotePlayer(current); players.length = 0; });

describe('voice-note playback', () => {
  it('handles a rapid burst of alternating play/pause taps without leaving playback active', () => {
    const current = voice();
    for (let tap = 0; tap < 30; tap++) toggleVoiceNotePlayback(current);
    expect(current.play).toHaveBeenCalledTimes(15);
    expect(current.pause).toHaveBeenCalledTimes(15);
    expect(current.playing).toBe(false);
  });
  it('cancels a buffering request when another note starts', () => {
    const buffering = voice();
    buffering.play.mockImplementation(() => {});
    const next = voice();
    toggleVoiceNotePlayback(buffering);
    toggleVoiceNotePlayback(next);
    expect(buffering.pause).toHaveBeenCalledOnce();
    expect(next.playing).toBe(true);
  });
  it('pauses a play request that is waiting for audio data', () => {
    const buffering = voice();
    buffering.play.mockImplementation(() => {});
    toggleVoiceNotePlayback(buffering);
    toggleVoiceNotePlayback(buffering);
    expect(buffering.play).toHaveBeenCalledOnce();
    expect(buffering.pause).toHaveBeenCalledOnce();
  });

  it('allows replay after a completed note has been released by the end event', () => {
    const completed = voice();
    toggleVoiceNotePlayback(completed);
    completed.playing = false;
    forgetVoiceNotePlayer(completed);
    toggleVoiceNotePlayback(completed);
    expect(completed.play).toHaveBeenCalledTimes(2);
    expect(completed.pause).not.toHaveBeenCalled();
  });
  it('stops the previous voice note before starting another', () => {
    const first = voice();
    const second = voice();
    toggleVoiceNotePlayback(first);
    toggleVoiceNotePlayback(second);
    expect(first.playing).toBe(false);
    expect(first.pause).toHaveBeenCalledOnce();
    expect(second.playing).toBe(true);
  });

  it('pauses immediately when playback is active, without waiting for a UI status update', () => {
    const current = voice();
    toggleVoiceNotePlayback(current);
    toggleVoiceNotePlayback(current);
    expect(current.playing).toBe(false);
    expect(current.play).toHaveBeenCalledOnce();
    expect(current.pause).toHaveBeenCalledOnce();
  });

  it('does not stop current playback when an unloaded note is tapped', () => {
    const current = voice();
    const unloaded = voice();
    unloaded.isLoaded = false;
    toggleVoiceNotePlayback(current);
    toggleVoiceNotePlayback(unloaded);
    expect(current.playing).toBe(true);
    expect(unloaded.play).not.toHaveBeenCalled();
  });

  it('forgets an unmounted player without calling a released native object', () => {
    const first = voice();
    const second = voice();
    toggleVoiceNotePlayback(first);
    forgetVoiceNotePlayer(first);
    toggleVoiceNotePlayback(second);
    expect(first.pause).not.toHaveBeenCalled();
  });

  it('keeps the active player when a different message unmounts', () => {
    const first = voice();
    const second = voice();
    toggleVoiceNotePlayback(first);
    forgetVoiceNotePlayer(second);
    toggleVoiceNotePlayback(second);
    expect(first.pause).toHaveBeenCalledOnce();
  });
});
