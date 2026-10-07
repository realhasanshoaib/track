import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, type NativeSyntheticEvent, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

type TouchPoint = { x: number; y: number };
type TouchLocation = NativeSyntheticEvent<{ pageX: number; pageY: number }>;

const DRAG_THRESHOLD = 10;
const RIPPLE_SIZE = 38;

/** Shows a brief, location-specific pulse without taking ownership of touches. */
export function TouchFeedback({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<View>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.35)).current;
  const origin = useRef<TouchPoint>({ x: 0, y: 0 });
  const rootOffset = useRef<TouchPoint>({ x: 0, y: 0 });
  const [point, setPoint] = useState<TouchPoint | null>(null);

  const updateRootOffset = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      rootOffset.current = { x, y };
    });
  }, []);

  const onTouchStart = useCallback((event: TouchLocation) => {
    if (reducedMotion) {
      setPoint(null);
      return;
    }
    const { pageX, pageY } = event.nativeEvent;
    origin.current = { x: pageX, y: pageY };
    setPoint({ x: pageX - rootOffset.current.x, y: pageY - rootOffset.current.y });
    fade.stopAnimation();
    scale.stopAnimation();
    fade.setValue(0.12);
    scale.setValue(0.35);
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 170, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(50),
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]),
    ]).start(({ finished }) => {
      if (finished) setPoint(null);
    });
  }, [fade, reducedMotion, scale]);

  const onTouchMove = useCallback((event: TouchLocation) => {
    const { pageX, pageY } = event.nativeEvent;
    if (Math.hypot(pageX - origin.current.x, pageY - origin.current.y) > DRAG_THRESHOLD) {
      fade.stopAnimation();
      scale.stopAnimation();
      fade.setValue(0);
      setPoint(null);
    }
  }, [fade, scale]);

  return (
    <View
      ref={rootRef}
      onLayout={updateRootOffset}
      onTouchMove={Platform.OS === 'ios' ? undefined : onTouchMove}
      onTouchStart={Platform.OS === 'ios' ? undefined : onTouchStart}
      style={{ flex: 1 }}>
      {children}
      {Platform.OS === 'ios' ? null : <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{
          backgroundColor: theme.text,
          borderRadius: RIPPLE_SIZE / 2,
          height: RIPPLE_SIZE,
          left: point ? point.x - RIPPLE_SIZE / 2 : -RIPPLE_SIZE,
          opacity: fade,
          position: 'absolute',
          top: point ? point.y - RIPPLE_SIZE / 2 : -RIPPLE_SIZE,
          transform: [{ scale }],
          width: RIPPLE_SIZE,
          zIndex: 20,
        }}
      />}
    </View>
  );
}
