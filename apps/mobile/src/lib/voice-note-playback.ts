export type VoiceNotePlaybackPlayer = {
  isLoaded: boolean;
  playing: boolean;
  play: () => void;
  pause: () => void;
};

// Playback has one owner across message rows, Channels, and threads.
let activePlayer: VoiceNotePlaybackPlayer | null = null;

export function toggleVoiceNotePlayback(player: VoiceNotePlaybackPlayer) {
  // A requested player can be waiting for data with playing=false on iOS.
  if (player.playing || activePlayer === player) {
    player.pause();
    forgetVoiceNotePlayer(player);
    return;
  }
  if (!player.isLoaded) return;
  const previous = activePlayer;
  activePlayer = null;
  if (previous && previous !== player) previous.pause();
  player.play();
  activePlayer = player;
}

/** useAudioPlayer owns native disposal; never call into it from this cleanup. */
export function forgetVoiceNotePlayer(player: VoiceNotePlaybackPlayer) {
  if (activePlayer === player) activePlayer = null;
}
