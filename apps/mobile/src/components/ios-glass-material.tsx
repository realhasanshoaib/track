import { GlassContainer, GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type IOSGlassContainerProps = ComponentProps<typeof GlassContainer>;

/** Keeps grouped glass controls safe on iOS versions without the native glass API. */
export function IOSGlassContainer({ spacing, ...props }: IOSGlassContainerProps) {
  return hasNativeGlassEffect()
    ? <GlassContainer spacing={spacing} {...props} />
    : <View {...props} />;
}

/** Background material for compact iOS header controls and identity pills. */
export function IOSGlassMaterial({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  if (Platform.OS !== 'ios') return null;

  if (!hasNativeGlassEffect()) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, style, { backgroundColor: theme.backgroundElevated }]} />;
  }

  return (
    <GlassView
      colorScheme={theme.background === '#1b1917' ? 'dark' : 'light'}
      glassEffectStyle="regular"
      isInteractive={false}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
      tintColor={theme.navigationGlass}
    />
  );
}

function hasNativeGlassEffect() {
  if (Platform.OS !== 'ios') return false;
  try {
    return isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}
