import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { usePressFeedback } from '@/hooks/use-press-feedback';

type PressableProps = Omit<ComponentProps<typeof Pressable>, 'children' | 'style'>;

type Props = PressableProps & {
  children: ReactNode;
  pillStyle?: StyleProp<ViewStyle>;
  pressedPillStyle?: StyleProp<ViewStyle>;
  targetStyle?: StyleProp<ViewStyle>;
};

/** Keeps a compact capsule visual inside the platform minimum touch target. */
export function CompactPillButton({
  children,
  onPressIn: onPressInProp,
  onPressOut: onPressOutProp,
  pillStyle,
  pressedPillStyle,
  targetStyle,
  ...pressableProps
}: Props) {
  const { animatedStyle, onPressIn, onPressOut } = usePressFeedback({ disabled: Boolean(pressableProps.disabled) });

  return (
    <Pressable
      {...pressableProps}
      onPressIn={(event) => { onPressIn(); onPressInProp?.(event); }}
      onPressOut={(event) => { onPressOut(); onPressOutProp?.(event); }}
      style={[styles.target, targetStyle]}>
      {({ pressed }) => (
        <Animated.View pointerEvents="none" style={[styles.pill, pillStyle, pressed && pressedPillStyle, animatedStyle]}>
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: Spacing.three,
  },
  target: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TouchTarget,
  },
});
