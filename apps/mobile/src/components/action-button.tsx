import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PlatformIcon, type IconName } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AnimatedPressable, usePressFeedback } from '@/hooks/use-press-feedback';
import { hapticLight } from '@/lib/haptics';

export type ActionButtonState = 'default' | 'success' | 'error' | 'offline';

type Props = {
  accessibilityHint?: string;
  disabled?: boolean;
  icon?: IconName;
  label: string;
  loading?: boolean;
  onPress: () => void;
  state?: ActionButtonState;
  style?: StyleProp<ViewStyle>;
  variant?: 'primary' | 'secondary' | 'destructive';
};

/** Shared full-size action with stable pressed, disabled, loading, and outcome states. */
export function ActionButton({
  accessibilityHint,
  disabled = false,
  icon,
  label,
  loading = false,
  onPress,
  state = 'default',
  style,
  variant = 'primary',
}: Props) {
  const theme = useTheme();
  const unavailable = disabled || loading;
  const pressFeedback = usePressFeedback({ disabled: unavailable, pressedScale: 0.985 });
  const destructive = variant === 'destructive' || state === 'error';
  const filled = variant === 'primary' || destructive || state === 'success';
  const backgroundColor = state === 'success'
    ? theme.success
    : destructive
      ? theme.danger
      : filled
        ? theme.accent
        : theme.backgroundElement;
  const foregroundColor = variant === 'primary' && state !== 'success' && !destructive
    ? theme.accentInk
    : filled ? theme.background : theme.text;

  return (
    <AnimatedPressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable }}
      android_ripple={{ color: filled ? theme.accentStrong : theme.backgroundSelected }}
      disabled={unavailable}
      onPressIn={pressFeedback.onPressIn}
      onPressOut={pressFeedback.onPressOut}
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={[
        styles.button,
        style,
        {
          backgroundColor,
          borderColor: variant === 'secondary' ? theme.hairline : backgroundColor,
          opacity: unavailable ? 0.5 : 1,
        },
        pressFeedback.animatedStyle,
      ]}>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={foregroundColor} size="small" />
        ) : icon ? (
          <PlatformIcon color={foregroundColor} name={icon} size={18} />
        ) : null}
        <ThemedText numberOfLines={2} style={[styles.label, { color: foregroundColor }]} type="smallBold">
          {label}
        </ThemedText>
        {state === 'offline' ? <PlatformIcon color={foregroundColor} name="cloud-off" size={18} /> : null}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: TouchTarget,
    overflow: 'hidden',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
    textAlign: 'center',
  },
});
