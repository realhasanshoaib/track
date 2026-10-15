import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Translucent Android material behind native chat headers. */
export function ChatHeaderBackground() {
  const theme = useTheme();

  if (Platform.OS !== 'android') {
    return <View pointerEvents="none" style={StyleSheet.absoluteFill} />;
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={52}
        style={StyleSheet.absoluteFill}
        tint={theme.background === '#1b1917' ? 'dark' : 'light'}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.navigationGlass }]} />
    </View>
  );
}
