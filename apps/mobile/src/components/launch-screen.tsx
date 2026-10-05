import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import trackMarkImage from '@/assets/images/track-mark.png';
import trackMarkReversedImage from '@/assets/images/track-mark-reversed.png';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';

/** Keep the brand transition shorter than the handoff to the first app screen. */
export const LAUNCH_ARTWORK_DURATION_MS = 820;
export const LAUNCH_DISPLAY_DURATION_MS = 980;
const LAUNCH_EXIT_DURATION_MS = 160;

const ACTION_NODE_SIZE = 68;
const ACTION_ICON_SIZE = 34;
const ACTION_ROUTE_GAP = 64;
const ACTION_STAGE_WIDTH = ACTION_NODE_SIZE * 2 + ACTION_ROUTE_GAP;
const ROUTE_DOT_SIZE = 8;
const BRAND_MARK_SIZE = 76;

export function LaunchScreen({ animationActive = false, exiting = false, onExitComplete, onReady, theme = 'light' }: {
  animationActive?: boolean;
  exiting?: boolean;
  onExitComplete?: () => void;
  onReady?: () => void;
  theme?: 'light' | 'dark';
}) {
  const didLoadMark = useRef(false);
  const didLayout = useRef(false);
  const didReportReady = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const [artReady, setArtReady] = useState(false);
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const colors = Colors[theme];
  const markSource = theme === 'dark' ? trackMarkReversedImage : trackMarkImage;

  useEffect(() => {
    if (!exiting) return;
    const animation = Animated.timing(opacity, {
      duration: reducedMotion ? 0 : LAUNCH_EXIT_DURATION_MS,
      toValue: 0,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onExitComplete?.();
    });
    return () => animation.stop();
  }, [exiting, onExitComplete, opacity, reducedMotion]);

  const reportReady = useCallback(() => {
    if (didReportReady.current || !didLayout.current || !didLoadMark.current) return;
    didReportReady.current = true;
    setArtReady(true);
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    if (!artReady || !animationActive || exiting) return;
    if (reducedMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, {
      duration: LAUNCH_ARTWORK_DURATION_MS,
      easing: Easing.linear,
    });
    return () => cancelAnimation(progress);
  }, [animationActive, artReady, exiting, progress, reducedMotion]);

  const conversationStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.14, 0.2], [0, 1, 1], 'clamp'),
    transform: [
      { translateY: interpolate(progress.value, [0, 0.18], [6, 0], 'clamp') },
      { scale: interpolate(progress.value, [0, 0.18], [0.9, 1], 'clamp') },
    ],
  }));
  const actionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 0.58], [0, 1], 'clamp'),
    transform: [
      { translateX: interpolate(progress.value, [0.4, 0.58], [6, 0], 'clamp') },
      { scale: interpolate(progress.value, [0.4, 0.58], [0.9, 1], 'clamp') },
    ],
  }));
  const routeDotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.12, 0.2, 0.54, 0.64], [0, 1, 1, 0], 'clamp'),
    transform: [{ translateX: interpolate(progress.value, [0.18, 0.58], [0, ACTION_ROUTE_GAP], 'clamp') }],
  }));
  const brandMarkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.48, 0.68], [0, 1], 'clamp'),
    transform: [
      { translateY: interpolate(progress.value, [0.48, 0.68], [8, 0], 'clamp') },
      { scale: interpolate(progress.value, [0.48, 0.68], [0.9, 1], 'clamp') },
    ],
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 0.77], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(progress.value, [0.6, 0.77], [6, 0], 'clamp') }],
  }));
  const captionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.72, 0.9], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(progress.value, [0.72, 0.9], [4, 0], 'clamp') }],
  }));

  return (
    <View
      accessibilityLabel="Loading Track"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      onLayout={() => {
        didLayout.current = true;
        reportReady();
      }}
      style={[styles.screen, { backgroundColor: colors.homeBackground }]}
    >
      <Animated.View style={[styles.canvas, { opacity }]}>
        <View style={styles.hero}>
          <View
            accessibilityElementsHidden
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.actionStage}
          >
            <View style={[styles.routeTrack, { backgroundColor: colors.homeBorder }]} />
            <Reanimated.View style={[styles.routeDot, { backgroundColor: colors.accent }, routeDotStyle]} />
            <Reanimated.View style={[styles.actionNode, styles.sourceNode, { backgroundColor: colors.homeSurface, borderColor: colors.homeBorder }, conversationStyle]}>
              <PlatformIcon color={colors.textSecondary} name="message" size={ACTION_ICON_SIZE} />
            </Reanimated.View>
            <Reanimated.View style={[styles.actionNode, styles.destinationNode, { backgroundColor: colors.homeSurface, borderColor: colors.homeBorder }, actionStyle]}>
              <PlatformIcon color={colors.accentStrong} name="task" size={ACTION_ICON_SIZE} variant="filled" />
            </Reanimated.View>
          </View>

          <Reanimated.View style={[styles.brandMarkWrap, brandMarkStyle]}>
            <Image
              accessible={false}
              accessibilityIgnoresInvertColors
              fadeDuration={0}
              onLoadEnd={() => {
                didLoadMark.current = true;
                reportReady();
              }}
              resizeMode="contain"
              source={markSource}
              style={styles.brandMark}
            />
          </Reanimated.View>

          <Reanimated.View style={[styles.wordmarkWrap, wordmarkStyle]}>
            <ThemedText style={[styles.wordmark, { color: colors.text }]} type="display">Track</ThemedText>
          </Reanimated.View>

          <Reanimated.View style={[styles.captionWrap, captionStyle]}>
            <ThemedText style={[styles.caption, { color: colors.textSecondary }]} type="small">
              From conversation to action
            </ThemedText>
          </Reanimated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  canvas: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four, transform: [{ translateY: 8 }], width: '100%' },
  actionStage: { alignItems: 'center', height: ACTION_NODE_SIZE, justifyContent: 'center', position: 'relative', width: ACTION_STAGE_WIDTH },
  routeTrack: { height: 2, left: ACTION_NODE_SIZE, position: 'absolute', top: ACTION_NODE_SIZE / 2 - 1, width: ACTION_ROUTE_GAP },
  routeDot: { borderRadius: Radius.pill, height: ROUTE_DOT_SIZE, left: ACTION_NODE_SIZE - ROUTE_DOT_SIZE / 2, position: 'absolute', top: ACTION_NODE_SIZE / 2 - ROUTE_DOT_SIZE / 2, width: ROUTE_DOT_SIZE, zIndex: 1 },
  actionNode: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: ACTION_NODE_SIZE, justifyContent: 'center', position: 'absolute', width: ACTION_NODE_SIZE, zIndex: 2 },
  sourceNode: { left: 0 },
  destinationNode: { right: 0 },
  brandMarkWrap: { alignItems: 'center', height: BRAND_MARK_SIZE, justifyContent: 'center', marginTop: Spacing.five, width: BRAND_MARK_SIZE },
  brandMark: { height: BRAND_MARK_SIZE, width: BRAND_MARK_SIZE },
  wordmarkWrap: { marginTop: Spacing.one },
  wordmark: { fontWeight: '700', letterSpacing: -1.2, lineHeight: 44, fontSize: 36, textAlign: 'center' },
  captionWrap: { marginTop: Spacing.two },
  caption: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
});
