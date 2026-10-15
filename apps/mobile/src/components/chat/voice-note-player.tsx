import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MESSAGE_MAX_WIDTH_RATIO, MESSAGE_SELECTION_RAIL_WIDTH } from '@/components/chat/message-layout';
import { ColoredAvatar } from '@/components/colored-avatar';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/attachment-presentation';
import { hapticLight } from '@/lib/haptics';
import { forgetVoiceNotePlayer, toggleVoiceNotePlayback } from '@/lib/voice-note-playback';
import { projectVoiceNoteProgress } from '@/lib/voice-note-progress';

import type { Doc } from '../../../../../convex/_generated/dataModel';

const BAR_COUNT = 32;
const SPEEDS = [1, 1.5, 2] as const;
const SKIP_SECONDS = 5;
const PLAY_SIZE = 30;
const AVATAR_SIZE = 44;
const TRACK_INSET = 6;
// Android polls mounted players even while paused; preserve its idle budget.
const PLAYBACK_UPDATE_INTERVAL = Platform.OS === 'android' ? 500 : 100;
const PLAYBACK_PROGRESS_DURATION = 120;

/** Keep a stable waveform for each recording without storing generated data. */
function waveform(seed: string) {
  const bars: number[] = [];
  let hash = 0;
  for (let index = 0; index < BAR_COUNT; index++) {
    hash = (hash * 31 + seed.charCodeAt(index % seed.length) + index * 17) >>> 0;
    bars.push(0.22 + ((hash >>> 7) % 78) / 100);
  }
  return bars;
}

function clamp01(value: number) {
  'worklet';
  return Math.min(Math.max(value, 0), 1);
}

type Props = {
  attachment: Doc<'attachments'>;
  deliveryMeta?: ReactNode;
  isOwnMessage: boolean;
  onLongPress?: () => void;
  selectionMode?: boolean;
  senderAvatarUrl?: string | null;
  senderName: string;
  url: string;
};

export function VoiceNotePlayer({ attachment, deliveryMeta, isOwnMessage, onLongPress, selectionMode = false, senderAvatarUrl, senderName, url }: Props) {
  const theme = useTheme();
  const surface = isOwnMessage ? theme.bubbleOwn : theme.bubbleOther;
  const { width: windowWidth } = useWindowDimensions();
  const player = useAudioPlayer(url, { updateInterval: PLAYBACK_UPDATE_INTERVAL });
  const status = useAudioPlayerStatus(player);
  const reducedMotion = useReducedMotion();
  const bars = useMemo(() => waveform(String(attachment._id)), [attachment._id]);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const scrubbing = useRef(false);
  const progress = useSharedValue(0);
  const heldForActions = useSharedValue(false);
  const progressWidth = Math.max(trackWidth - TRACK_INSET * 2, 0);
  const totalSeconds = attachment.durationMs ? attachment.durationMs / 1000 : status.duration;
  const elapsedSeconds = Math.min(status.currentTime, totalSeconds || status.currentTime);
  const engaged = status.playing || elapsedSeconds > 0.05;

  useEffect(() => () => forgetVoiceNotePlayer(player), [player]);

  useEffect(() => {
    if (scrubbing.current || !totalSeconds) return;
    if (Platform.OS === 'android' && status.playing && !status.isBuffering && !reducedMotion) {
      const frame = projectVoiceNoteProgress(status.currentTime, totalSeconds, status.playbackRate, PLAYBACK_UPDATE_INTERVAL);
      progress.value = frame.from;
      progress.value = withTiming(frame.to, { duration: frame.duration, easing: Easing.linear });
      return;
    }
    progress.value = withTiming(clamp01(status.currentTime / totalSeconds), {
      duration: status.playing && !status.isBuffering && !reducedMotion ? PLAYBACK_PROGRESS_DURATION : 0,
      easing: Easing.linear,
    });
  }, [progress, reducedMotion, status.currentTime, status.isBuffering, status.playbackRate, status.playing, totalSeconds]);

  useEffect(() => {
    // Browser timeupdate events may arrive only every ~250 ms. Sample only the
    // active note so Reduce Motion still has timely, non-animated progress.
    if (Platform.OS !== 'web' || !status.playing || !totalSeconds) return;
    const timer = setInterval(() => {
      if (scrubbing.current) return;
      progress.value = withTiming(clamp01(player.currentTime / totalSeconds), {
        duration: player.playing && !player.isBuffering && !reducedMotion ? PLAYBACK_PROGRESS_DURATION : 0,
        easing: Easing.linear,
      });
    }, 100);
    return () => clearInterval(timer);
  }, [player, progress, reducedMotion, status.playing, totalSeconds]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    forgetVoiceNotePlayer(player);
    progress.value = 0;
    void player.seekTo(0);
  }, [player, progress, status.didJustFinish]);

  function seekToFraction(fraction: number) {
    scrubbing.current = false;
    if (totalSeconds) void player.seekTo(fraction * totalSeconds);
  }

  function beginScrub() {
    scrubbing.current = true;
  }

  function openMessageActions() {
    scrubbing.current = false;
    if (totalSeconds) progress.value = clamp01(player.currentTime / totalSeconds);
    onLongPress?.();
  }

  const scrub = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      heldForActions.value = false;
      if (progressWidth <= 0) return;
      scheduleOnRN(beginScrub);
      progress.value = clamp01((event.x - TRACK_INSET) / progressWidth);
    })
    .onUpdate((event) => {
      if (progressWidth <= 0 || heldForActions.value) return;
      progress.value = clamp01((event.x - TRACK_INSET) / progressWidth);
    })
    .onFinalize(() => {
      if (progressWidth > 0 && !heldForActions.value) scheduleOnRN(seekToFraction, progress.value);
    });
  const hold = Gesture.LongPress()
    .enabled(Boolean(onLongPress) && !selectionMode)
    .minDuration(500)
    .maxDistance(8)
    .onStart(() => {
      heldForActions.value = true;
      scheduleOnRN(openMessageActions);
    });
  const trackGesture = Gesture.Simultaneous(scrub, hold);

  const playedStyle = useAnimatedStyle(() => ({ width: progress.value * progressWidth }));
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * progressWidth }] }));

  function toggle() {
    hapticLight();
    toggleVoiceNotePlayback(player);
  }

  function cycleSpeed() {
    hapticLight();
    const nextIndex = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(nextIndex);
    player.setPlaybackRate(SPEEDS[nextIndex]);
  }

  function skip(seconds: number) {
    const target = Math.min(Math.max(status.currentTime + seconds, 0), totalSeconds || 0);
    void player.seekTo(target);
  }

  const percent = Math.round((totalSeconds ? elapsedSeconds / totalSeconds : 0) * 100);
  const speed = SPEEDS[speedIndex];
  const selectionReservedWidth = selectionMode
    ? MESSAGE_SELECTION_RAIL_WIDTH + (isOwnMessage ? 0 : Spacing.two * 2)
    : 0;
  const playerWidth = Math.max(0, Math.min(windowWidth * MESSAGE_MAX_WIDTH_RATIO, 340) - selectionReservedWidth);
  const senderAvatar = senderAvatarUrl ? (
    <Image accessibilityLabel={`${senderName} profile photo`} accessibilityRole="image" contentFit="cover" recyclingKey={senderAvatarUrl} source={{ uri: senderAvatarUrl }} style={styles.avatar} transition={120} />
  ) : <ColoredAvatar label={senderName} seed={senderName} size={AVATAR_SIZE} />;

  return (
    <View style={[styles.card, { backgroundColor: surface, borderColor: theme.hairline, width: playerWidth }]}>
      {!isOwnMessage ? senderAvatar : null}
      <View style={styles.main}>
        <View style={styles.controlRow}>
          <Pressable
            accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}
            accessibilityRole="button"
            accessibilityState={{ busy: !status.isLoaded, disabled: !status.isLoaded }}
            android_ripple={{ borderless: true, color: theme.backgroundSelected }}
            disabled={!status.isLoaded}
            hitSlop={8}
            onPress={toggle}
            onLongPress={onLongPress}
            style={styles.playButton}>
            {status.isLoaded
              ? <PlatformIcon color={theme.text} name={status.playing ? 'pause' : 'play'} size={23} />
              : <ActivityIndicator color={theme.accentStrong} size="small" />}
          </Pressable>

          <GestureDetector gesture={trackGesture}>
            <View
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              accessibilityLabel="Voice note position"
              accessibilityRole="adjustable"
              accessibilityValue={{ max: 100, min: 0, now: percent }}
              onAccessibilityAction={(event) => skip(event.nativeEvent.actionName === 'increment' ? SKIP_SECONDS : -SKIP_SECONDS)}
              onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
              style={styles.track}>
              <View style={[styles.bars, { width: progressWidth }]}>
                {bars.map((height, index) => (
                  <View key={index} style={[styles.bar, { backgroundColor: theme.textTertiary, height: `${height * 100}%` }]} />
                ))}
              </View>
              <Animated.View style={[styles.playedClip, { left: TRACK_INSET, width: progressWidth }, playedStyle]}>
                <View style={[styles.bars, { width: progressWidth }]}>
                  {bars.map((height, index) => (
                    <View key={index} style={[styles.bar, { backgroundColor: theme.accentStrong, height: `${height * 100}%` }]} />
                  ))}
                </View>
              </Animated.View>
              <Animated.View style={[styles.knob, { backgroundColor: theme.accentStrong, borderColor: surface }, knobStyle]} />
            </View>
          </GestureDetector>
        </View>

        <View style={styles.meta}>
          <ThemedText style={styles.duration} type="caption">
            {formatDuration((engaged ? elapsedSeconds : totalSeconds || 0) * 1000)}
          </ThemedText>
          {status.playing ? (
            <Pressable accessibilityLabel={`Playback speed ${speed} times`} accessibilityRole="button" hitSlop={6} onLongPress={onLongPress} onPress={cycleSpeed} style={styles.speed}>
              <ThemedText style={[styles.speedText, { color: theme.textSecondary }]} type="captionBold">{`${speed}x`}</ThemedText>
            </Pressable>
          ) : null}
          <View style={styles.metaSpacer} />
          {deliveryMeta}
        </View>
      </View>

      {isOwnMessage ? senderAvatar : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: Radius.pill, flex: 1, maxWidth: 4, minWidth: 2 },
  avatar: { borderRadius: Radius.pill, height: AVATAR_SIZE, width: AVATAR_SIZE },
  bars: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row', gap: 2, height: 26, justifyContent: 'center' },
  card: { alignItems: 'center', borderCurve: 'continuous', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.one, maxWidth: '100%', minHeight: 68, paddingHorizontal: 9, paddingVertical: 8 },
  controlRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minWidth: 0 },
  duration: { fontVariant: ['tabular-nums'] },
  knob: { borderRadius: Radius.pill, borderWidth: 2, height: 12, left: TRACK_INSET, marginLeft: -6, position: 'absolute', top: 11, width: 12 },
  main: { flex: 1, gap: 2, minWidth: 0 },
  meta: { alignItems: 'center', flexDirection: 'row', minHeight: 20 },
  metaSpacer: { flex: 1, minWidth: 6 },
  playButton: { alignItems: 'center', borderRadius: Radius.pill, height: PLAY_SIZE, justifyContent: 'center', width: PLAY_SIZE },
  playedClip: { bottom: 0, justifyContent: 'center', overflow: 'hidden', position: 'absolute', top: 0 },
  speed: { borderRadius: Radius.pill, marginLeft: 5, paddingHorizontal: 3, paddingVertical: 1 },
  speedText: { fontVariant: ['tabular-nums'] },
  track: { alignItems: 'center', flex: 1, height: 34, justifyContent: 'center', minWidth: 0 },
});
