import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

type TabSwipeDirection = -1 | 1;
type TabSwipeContextValue = {
  setActiveKey: (key: string) => void;
  registerNavigation: (handler: (direction: TabSwipeDirection) => boolean) => () => void;
};

const PrimaryTabSwipeContext = createContext<TabSwipeContextValue | null>(null);

export function usePrimaryTabSwipe() {
  const context = useContext(PrimaryTabSwipeContext);
  if (!context) throw new Error('usePrimaryTabSwipe must be used inside PrimaryTabSwipe.');
  return context;
}

export function PrimaryTabSwipe({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const navigationHandler = useRef<((direction: TabSwipeDirection) => boolean) | null>(null);
  const activeKey = useRef<string | null>(null);
  const pendingDirection = useSharedValue<TabSwipeDirection | 0>(0);
  const translateX = useSharedValue(0);
  const registerNavigation = useCallback((handler: (direction: TabSwipeDirection) => boolean) => {
    navigationHandler.current = handler;
    return () => {
      if (navigationHandler.current === handler) navigationHandler.current = null;
    };
  }, []);
  const setActiveKey = useCallback((key: string) => {
    const previousKey = activeKey.current;
    activeKey.current = key;
    if (previousKey === null || previousKey === key) return;

    const direction = pendingDirection.get();
    if (!direction) return;
    pendingDirection.set(0);
    translateX.set(direction < 0 ? -width : width);
    translateX.set(reducedMotion ? 0 : withTiming(0, { duration: 180 }));
  }, [pendingDirection, reducedMotion, translateX, width]);
  const navigate = useCallback((direction: TabSwipeDirection) => {
    const navigated = navigationHandler.current?.(direction) ?? false;
    if (!navigated) {
      pendingDirection.set(0);
      translateX.set(withSpring(0, { damping: 24, stiffness: 260 }));
    }
  }, [pendingDirection, translateX]);
  const contextValue = useMemo(() => ({ registerNavigation, setActiveKey }), [registerNavigation, setActiveKey]);

  const swipe = Gesture.Pan()
    .activeOffsetX(24)
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      translateX.set(Math.max(-width, Math.min(width, event.translationX)));
    })
    .onEnd((event) => {
      const projectedDistance = event.translationX + event.velocityX * 0.12;
      if (Math.abs(projectedDistance) < 72) {
        translateX.set(withSpring(0, { damping: 24, stiffness: 260 }));
        return;
      }
      const direction: TabSwipeDirection = projectedDistance < 0 ? 1 : -1;
      if (reducedMotion) {
        translateX.set(0);
        scheduleOnRN(navigate, direction);
        return;
      }
      pendingDirection.set(direction);
      translateX.set(withTiming(direction < 0 ? width : -width, { duration: 150 }, (finished) => {
        if (finished) scheduleOnRN(navigate, direction);
      }));
    });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));

  return (
    <PrimaryTabSwipeContext.Provider value={contextValue}>
      <GestureDetector gesture={swipe}>
        <Animated.View style={[styles.root, animatedStyle]}>{children}</Animated.View>
      </GestureDetector>
    </PrimaryTabSwipeContext.Provider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
