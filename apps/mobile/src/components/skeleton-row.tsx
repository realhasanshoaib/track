import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { Spacing } from '@/constants/theme';
import { useLocale } from '@/contexts/locale-context';
import { useTheme } from '@/hooks/use-theme';

export function SkeletonRow() {
  const theme = useTheme();
  const { direction } = useLocale();
  const { t } = useTranslation('common');
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.9, { duration: 800 }), -1, true);
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const bg = theme.backgroundElement;

  return (
    <Animated.View accessibilityLabel={t('generic.loading')} accessibilityRole="progressbar" style={[styles.row, { backgroundColor: bg, direction }, animStyle]}>
      <View style={[styles.avatar, { backgroundColor: theme.hairline }]} />
      <View style={styles.lines}>
        <View style={[styles.lineWide, { backgroundColor: theme.hairline }]} />
        <View style={[styles.lineNarrow, { backgroundColor: theme.hairline }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: 10,
    height: 44,
    width: 44,
  },
  lineNarrow: {
    borderRadius: 4,
    height: 10,
    width: '40%',
  },
  lineWide: {
    borderRadius: 4,
    height: 12,
    width: '60%',
  },
  lines: {
    flex: 1,
    gap: 6,
    justifyContent: 'center',
  },
  row: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: Spacing.three,
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
});
