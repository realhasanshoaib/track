import { Pressable, StyleSheet } from 'react-native';

import { PlatformIcon } from '@/components/platform-icon';
import { Colors, Radius, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function MessageActionShortcut({
  authorName,
  onPress,
  timeLabel,
  overlay = false,
}: {
  authorName: string;
  onPress: () => void;
  timeLabel: string;
  overlay?: boolean;
}) {
  const theme = useTheme();
  const iconColor = overlay ? Colors.dark.text : theme.textTertiary;
  return (
    <Pressable
      accessibilityHint="Opens copy, reply, forward, report, and other message actions."
      accessibilityLabel={`More actions for message from ${authorName}, sent at ${timeLabel}`}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: pressed ? overlay ? 'rgba(0,0,0,0.58)' : theme.backgroundSelected : overlay ? 'rgba(0,0,0,0.32)' : 'transparent' }]}
    >
      <PlatformIcon color={iconColor} name="dots-horizontal" size={15} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: TouchTarget,
    justifyContent: 'center',
    width: TouchTarget,
  },
});
