import { useEffect } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useThemeOverride } from '@/contexts/theme-override-context';
import { useTheme } from '@/hooks/use-theme';

import trackMarkImage from '@/assets/images/track-mark.png';
import trackMarkReversedImage from '@/assets/images/track-mark-reversed.png';

/**
 * Decorative sign-in hero drawn in the store-artwork language: faint route
 * rings with accent station dots riding them. Rendered with plain views so it
 * follows the active theme at any size; rotation pauses under reduced motion.
 */
export function SignInHero() {
  const theme = useTheme();
  const { t } = useTranslation('common');
  const { theme: themeName } = useThemeOverride();
  const markSource = themeName === 'dark' ? trackMarkReversedImage : trackMarkImage;

  const ring = `${theme.text}12`;

  return (
    <View pointerEvents="none" style={styles.hero}>
      {/* Stations sit 90° / 120° apart so one is always crossing the visible arc. */}
      <Orbit degreesPerSecond={8} style={styles.orbitLarge}>
        <View style={[styles.ringLarge, { borderColor: ring }]} />
        <View style={[styles.station, { backgroundColor: theme.accent, left: 537, top: 320 }]} />
        <View style={[styles.station, { backgroundColor: theme.accent, left: 228, top: 537 }]} />
        <View style={[styles.station, { backgroundColor: theme.accent, left: 11, top: 228 }]} />
        <View style={[styles.station, { backgroundColor: theme.accent, left: 320, top: 11 }]} />
      </Orbit>
      <Orbit degreesPerSecond={-12} style={styles.orbitSmall}>
        <View style={[styles.ringSmall, { borderColor: ring }]} />
        <View style={[styles.station, { backgroundColor: theme.accent, left: 204, top: 16 }]} />
        <View style={[styles.station, { backgroundColor: theme.accent, left: 225, top: 260 }]} />
        <View style={[styles.station, { backgroundColor: theme.accent, left: 4, top: 156 }]} />
      </Orbit>

      <View style={styles.lockup}>
        <View style={[styles.markTile, { backgroundColor: theme.backgroundElement }]}>
          <Image accessibilityIgnoresInvertColors resizeMode="contain" source={markSource} style={styles.mark} />
          <View
            style={[styles.markStation, { backgroundColor: theme.accent, borderColor: theme.background }]}
          />
        </View>
        <ThemedText style={styles.name}>Track</ThemedText>
        <ThemedText style={[styles.tagline, { color: theme.textSecondary }]} type="small">
          {t('auth.tagline')}
        </ThemedText>
      </View>
    </View>
  );
}

function Orbit({
  children,
  degreesPerSecond,
  style,
}: {
  children: React.ReactNode;
  degreesPerSecond: number;
  style: ViewStyle;
}) {
  const reducedMotion = useReducedMotion();
  const turns = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    const duration = (360 / Math.abs(degreesPerSecond)) * 1000;
    turns.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1);
    return () => cancelAnimation(turns);
  }, [degreesPerSecond, reducedMotion, turns]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turns.value * 360 * Math.sign(degreesPerSecond)}deg` }],
  }));

  return <Animated.View style={[style, spin]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: Spacing.five,
  },
  lockup: {
    alignItems: 'center',
    gap: Spacing.four,
  },
  mark: {
    height: 56,
    width: 56,
  },
  markStation: {
    borderRadius: 8,
    borderWidth: 3,
    bottom: -5,
    height: 16,
    position: 'absolute',
    right: -5,
    width: 16,
  },
  markTile: {
    alignItems: 'center',
    borderRadius: 26,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  name: {
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 44,
  },
  orbitLarge: {
    height: 560,
    position: 'absolute',
    right: -200,
    top: -230,
    width: 560,
  },
  orbitSmall: {
    bottom: -140,
    height: 300,
    left: -150,
    position: 'absolute',
    width: 300,
  },
  ringLarge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
    borderWidth: 26,
  },
  ringSmall: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
    borderWidth: 18,
  },
  station: {
    borderRadius: 6,
    height: 12,
    position: 'absolute',
    width: 12,
  },
  tagline: {
    maxWidth: 260,
    textAlign: 'center',
  },
});
