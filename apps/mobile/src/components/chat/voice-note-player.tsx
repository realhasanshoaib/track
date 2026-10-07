import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatDuration } from '@/lib/attachment-presentation';
import { hapticLight } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

import type { Doc } from '../../../../../convex/_generated/dataModel';

const BAR_COUNT = 32;
const SPEEDS = [1, 1.5, 2] as const;
const SKIP_SECONDS = 5;
const PLAY_SIZE = 36;

/** Bar heights are derived from the attachment id so a note looks the same on every render. */
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

type Props = { attachment: Doc<'attachments'>; url: string };

export function VoiceNotePlayer({ attachment, url }: Props) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const bars = useMemo(() => waveform(attachment._id), [attachment._id]);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const scrubbing = useRef(false);
  const progress = useSharedValue(0);

  const totalSeconds = attachment.durationMs ? attachment.durationMs / 1000 : status.duration;
  const elapsedSeconds = Math.min(status.currentTime, totalSeconds || status.currentTime);
  // WhatsApp shows the total until playback starts, then the elapsed position.
  const engaged = status.playing || elapsedSeconds > 0.05;

  useEffect(() => {
    if (scrubbing.current || !totalSeconds) return;
    progress.value = clamp01(status.currentTime / totalSeconds);
  }, [progress, status.currentTime, totalSeconds]);

  useEffect(() => {
    if (!status.didJustFinish) return;
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

  const scrub = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      if (trackWidth <= 0) return;
      scheduleOnRN(beginScrub);
      progress.value = clamp01(event.x / trackWidth);
    })
    .onUpdate((event) => {
      if (trackWidth <= 0) return;
      progress.value = clamp01(event.x / trackWidth);
    })
    .onFinalize(() => {
      scheduleOnRN(seekToFraction, progress.value);
    });

  const playedStyle = useAnimatedStyle(() => ({ width: progress.value * trackWidth }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * trackWidth }],
  }));

  function toggle() {
    hapticLight();
    if (status.playing) {
      player.pause();
      return;
    }
    player.play();
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

  return (
    <View style={[styles.row, { width: Math.min(windowWidth * 0.68, 268) }]}>
      <Pressable
        accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}
        accessibilityRole="button"
        accessibilityState={{ busy: !status.isLoaded, disabled: !status.isLoaded }}
        android_ripple={{ borderless: true, color: theme.backgroundSelected }}
        disabled={!status.isLoaded}
        hitSlop={8}
        onPress={toggle}
        style={[styles.playButton, { backgroundColor: theme.accent }]}>
        {status.isLoaded ? (
          <PlatformIcon
            color={theme.accentInk}
            name={status.playing ? 'pause' : 'play'}
            size={20}
          />
        ) : (
          <ActivityIndicator color={theme.accentInk} size="small" />
        )}
      </Pressable>

      <View style={styles.main}>
        <GestureDetector gesture={scrub}>
          <View
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            accessibilityLabel="Voice note position"
            accessibilityRole="adjustable"
            accessibilityValue={{ max: 100, min: 0, now: percent }}
            onAccessibilityAction={(event) =>
              skip(event.nativeEvent.actionName === 'increment' ? SKIP_SECONDS : -SKIP_SECONDS)
            }
            onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
            style={styles.track}>
            <View style={styles.bars}>
              {bars.map((height, index) => (
                <View
                  key={index}
                  style={[
                    styles.bar,
                    { backgroundColor: theme.textTertiary, height: `${height * 100}%` },
                  ]}
                />
              ))}
            </View>
            <Animated.View style={[styles.playedClip, playedStyle]}>
              <View style={[styles.bars, { width: trackWidth }]}>
                {bars.map((height, index) => (
                  <View
                    key={index}
                    style={[
                      styles.bar,
                      { backgroundColor: theme.accentStrong, height: `${height * 100}%` },
                    ]}
                  />
                ))}
              </View>
            </Animated.View>
            <Animated.View
              style={[styles.knob, { backgroundColor: theme.accentStrong }, knobStyle]}
            />
          </View>
        </GestureDetector>

        <View style={styles.meta}>
          <ThemedText themeColor="textSecondary" type="caption">
            {formatDuration((engaged ? elapsedSeconds : totalSeconds || 0) * 1000)}
          </ThemedText>
          {status.playing ? (
            <Pressable
              accessibilityLabel={`Playback speed ${speed} times`}
              accessibilityRole="button"
              hitSlop={8}
              onPress={cycleSpeed}
              style={[styles.speed, { backgroundColor: theme.backgroundSelected }]}
            >
              <ThemedText themeColor="textSecondary" type="captionBold">{`${speed}x`}</ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: Radius.pill,
    flex: 1,
    maxWidth: 4,
    minWidth: 2,
  },
  bars: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 2,
    height: 26,
    justifyContent: 'center',
    width: '100%',
  },
  knob: {
    borderRadius: Radius.pill,
    height: 10,
    marginLeft: -5,
    position: 'absolute',
    top: 13,
    width: 10,
  },
  main: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 20,
  },
  playButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    height: PLAY_SIZE,
    justifyContent: 'center',
    width: PLAY_SIZE,
  },
  playedClip: {
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.one,
  },
  speed: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 28,
    justifyContent: 'center',
    minWidth: 32,
    paddingHorizontal: Spacing.one,
  },
  track: {
    alignItems: 'center',
    height: PLAY_SIZE,
    justifyContent: 'center',
  },
});
