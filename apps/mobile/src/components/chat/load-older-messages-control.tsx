import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type LoadOlderMessagesControlProps = {
  label: string;
  loading: boolean;
  onPress: () => void;
};

/** Shared, fixed-height history control for Channel and Thread timelines. */
export function LoadOlderMessagesControl({ label, loading, onPress }: LoadOlderMessagesControlProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={loading ? 'Loading older messages' : label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [styles.control, { opacity: pressed && !loading ? 0.72 : 1 }]}
    >
      <View style={styles.indicator}>
        {loading
          ? <ActivityIndicator color={theme.accentStrong} size="small" />
          : <PlatformIcon color={theme.textSecondary} name="chevron-up" size={16} />}
      </View>
      <ThemedText type="smallBold">{loading ? 'Loading older messages…' : label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: TouchTarget,
    padding: Spacing.two,
  },
  indicator: { alignItems: 'center', height: 16, justifyContent: 'center', width: 16 },
});
