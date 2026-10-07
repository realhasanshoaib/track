import { useCallback } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Options = {
  disabled?: boolean;
  pressedScale?: number;
};

/** A small native press response that settles without changing the hit target. */
export function usePressFeedback({ disabled = false, pressedScale = 0.97 }: Options = {}) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = useCallback(() => {
    if (disabled) return;
    scale.value = reducedMotion
      ? withTiming(1, { duration: 0 })
      : withSpring(pressedScale, { dampingRatio: 0.78, duration: 140 });
  }, [disabled, pressedScale, reducedMotion, scale]);

  const onPressOut = useCallback(() => {
    scale.value = reducedMotion
      ? withTiming(1, { duration: 0 })
      : withSpring(1, { dampingRatio: 0.78, duration: 170 });
  }, [reducedMotion, scale]);

  return { animatedStyle, onPressIn, onPressOut };
}

export { AnimatedPressable };
