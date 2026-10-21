import { useEffect } from 'react';
import { Image } from 'expo-image';
import { Easing, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ColoredAvatar } from '@/components/colored-avatar';
import { PlatformIcon } from '@/components/platform-icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TypingPerson = {
  indicator: { activity?: 'typing' | 'attaching' | 'recording' };
  avatarUrl?: string | null;
  user: { _id: string; displayName: string } | null;
};

/** Incoming activity sits after the final message, without shifting history readers. */
export function ChatTypingIndicator({ people }: { people: readonly TypingPerson[] }) {
  const theme = useTheme();
  const visible = people.slice(0, 3);
  if (!visible.length) return null;

  const recording = visible.some(({ indicator }) => indicator.activity === 'recording');
  const attaching = visible.some(({ indicator }) => indicator.activity === 'attaching');
  const names = visible.map(({ user }) => user?.displayName ?? 'Someone');
  const activityLabel = recording ? 'recording a voice message' : attaching ? 'attaching media' : 'typing';
  const accessibilityLabel = `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} ${activityLabel}`;

  return (
    <View accessibilityLabel={accessibilityLabel} accessible style={styles.row}>
      <View style={styles.avatars}>
        {visible.map(({ avatarUrl, user }, index) => (
          <View key={user?._id ?? `unknown-${index}`} style={[styles.avatar, index > 0 && styles.avatarOverlap]}>
            {avatarUrl ? (
              <Image
                accessibilityElementsHidden
                cachePolicy="memory-disk"
                contentFit="cover"
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
              />
            ) : <ColoredAvatar label={user?.displayName ?? '?'} seed={user?._id} size={28} />}
          </View>
        ))}
      </View>
      <View style={[styles.bubble, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
        <TypingDot index={0} />
        <TypingDot index={1} />
        <TypingDot index={2} />
        {recording ? (
          <View style={[styles.voiceBadge, { backgroundColor: theme.accentStrong }]}>
            <PlatformIcon color={theme.accentInk} name="microphone-outline" size={12} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function TypingDot({ index }: { index: number }) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 0;
      return;
    }
    progress.value = withDelay(index * 120, withRepeat(
      withSequence(
        withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    ));
    return () => cancelAnimation(progress);
  }, [index, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0.75 : 0.4 + progress.value * 0.6,
    transform: [{ translateY: reducedMotion ? 0 : -2 * progress.value }],
  }));

  const theme = useTheme();
  return <Animated.View style={[styles.dot, { backgroundColor: theme.textSecondary }, animatedStyle]} />;
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
  },
  avatars: { alignItems: 'center', flexDirection: 'row' },
  avatar: {
    borderCurve: 'continuous',
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  avatarImage: { height: 28, width: 28 },
  avatarOverlap: { marginLeft: -Spacing.one },
  bubble: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.one,
    height: 28,
    justifyContent: 'center',
    minWidth: 44,
    overflow: 'visible',
    position: 'relative',
    paddingHorizontal: Spacing.two,
  },
  dot: { borderRadius: Radius.pill, height: 5, width: 5 },
  voiceBadge: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: Radius.pill,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: -7,
    top: -8,
    width: 20,
  },
});
