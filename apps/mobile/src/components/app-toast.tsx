import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { PlatformIcon, type IconName } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useThemeOverride } from '@/contexts/theme-override-context';
import { useTheme } from '@/hooks/use-theme';
import { hapticDestructive, hapticLight, hapticSuccess } from '@/lib/haptics';
import { enqueueToast, toastDuration, type AppToastInput, type AppToastItem, type AppToastTone } from '@/lib/app-toast';

type ToastContextValue = { showToast: (toast: AppToastInput) => void };

const ToastContext = createContext<ToastContextValue | null>(null);
const enterEase = Easing.bezier(0.23, 1, 0.32, 1);
const exitEase = Easing.bezier(0.4, 0, 1, 1);
const settleSpring = { duration: 420, dampingRatio: 0.82 } as const;

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<AppToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((input: AppToastInput) => {
    const next: AppToastItem = {
      ...input,
      id: nextId.current += 1,
      tone: input.tone ?? 'info',
    };
    setQueue((current) => enqueueToast(current, next));
  }, []);
  const dismiss = useCallback(() => setQueue((current) => current.slice(1)), []);
  const value = useMemo(() => ({ showToast }), [showToast]);

  return <ToastContext.Provider value={value}>
    <View style={styles.provider}>
      {children}
      {queue[0] ? <ToastHost item={queue[0]} key={queue[0].id} onDismiss={dismiss} /> : null}
    </View>
  </ToastContext.Provider>;
}

export function useAppToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useAppToast must be used inside AppToastProvider');
  return value;
}

function ToastHost({ item, onDismiss }: { item: AppToastItem; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { theme: themeName } = useThemeOverride();
  const reduceMotion = useReducedMotion();
  const largeText = useWindowDimensions().fontScale > 1.2;
  const [reduceTransparency, setReduceTransparency] = useState<boolean | null>(null);
  const closing = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(reduceMotion ? 1 : 0.94);
  const translateY = useSharedValue(reduceMotion ? 0 : -24);
  const bloom = useSharedValue(0);
  const icon = item.icon ?? toastIcon(item.tone);
  const toneColor = toastColor(item.tone, theme);
  const glassAvailable = Platform.OS === 'ios' && reduceTransparency === false && safeGlassAvailability();

  const dismiss = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    opacity.set(withTiming(0, { duration: 140, easing: exitEase }));
    bloom.set(withTiming(0, { duration: 110 }));
    translateY.set(withTiming(reduceMotion ? 0 : -16, { duration: 170, easing: exitEase }));
    dismissTimer.current = setTimeout(onDismiss, 180);
  }, [bloom, onDismiss, opacity, reduceMotion, translateY]);

  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency);
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    closing.current = false;
    void AccessibilityInfo.announceForAccessibility([item.title, item.message].filter(Boolean).join('. '));
    if (item.tone === 'success') hapticSuccess();
    else if (item.tone === 'error') hapticDestructive();
    else hapticLight();

    opacity.set(withTiming(1, { duration: reduceMotion ? 150 : 120, easing: enterEase }));
    if (reduceMotion) {
      scale.set(1);
      translateY.set(0);
    } else {
      translateY.set(withSpring(0, settleSpring));
      scale.set(withSequence(
        withSpring(1.025, { duration: 250, dampingRatio: 0.8 }),
        withSpring(1, { duration: 180, dampingRatio: 1 }),
      ));
      bloom.set(withDelay(55, withTiming(1, { duration: 220, easing: enterEase })));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((screenReaderEnabled) => {
      if (active && !screenReaderEnabled) timer = setTimeout(dismiss, toastDuration(item));
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [bloom, dismiss, item, opacity, reduceMotion, scale, translateY]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: translateY.get() }, { scale: scale.get() }],
  }));
  const copy = <>
    <View style={[styles.iconWell, { backgroundColor: item.tone === 'success' ? theme.successSoft : item.tone === 'error' ? theme.dangerSoft : theme.accentSoft }]}>
      <PlatformIcon
        animationSpec={reduceMotion ? undefined : { effect: { type: 'bounce', wholeSymbol: true }, repeatCount: 1 }}
        color={toneColor}
        name={icon}
        size={20}
        variant="filled"
        weight="semibold"
      />
    </View>
    <View style={styles.copy}>
      <ThemedText numberOfLines={largeText ? undefined : 2} type="title">{item.title}</ThemedText>
      {item.message ? <ThemedText numberOfLines={largeText ? undefined : 3} themeColor="textSecondary" type="caption">{item.message}</ThemedText> : null}
    </View>
  </>;
  const leftDropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bloom.get(), [0, 0.35, 1], [0, 0.8, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(bloom.get(), [0, 1], [20, 0]) },
      { translateY: interpolate(bloom.get(), [0, 1], [13, -7]) },
      { scale: interpolate(bloom.get(), [0, 0.7, 1], [0.5, 1.08, 0.72]) },
    ],
  }));
  const rightDropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bloom.get(), [0, 0.3, 1], [0, 0.72, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(bloom.get(), [0, 1], [-18, 2]) },
      { translateY: interpolate(bloom.get(), [0, 1], [11, -5]) },
      { scale: interpolate(bloom.get(), [0, 0.65, 1], [0.4, 1, 0.65]) },
    ],
  }));

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onChange((event) => {
      translateY.set(Math.min(8, event.translationY * 0.18, event.translationY));
      opacity.set(interpolate(event.translationY, [-70, 0], [0.35, 1], Extrapolation.CLAMP));
    })
    .onEnd((event) => {
      if (event.translationY < -24 || event.velocityY < -520) {
        scheduleOnRN(dismiss);
        return;
      }
      translateY.set(withSpring(0, { ...settleSpring, velocity: event.velocityY }));
      opacity.set(withTiming(1, { duration: 120 }));
    });

  return <View pointerEvents="box-none" style={[styles.viewport, { paddingTop: insets.top + Spacing.two }]}>
    <GestureDetector gesture={pan}>
      <Animated.View accessibilityLiveRegion="polite" style={[styles.toastShell, cardStyle]}>
        <ToastMaterial glassAvailable={glassAvailable} reduceTransparency={reduceTransparency} themeName={themeName} />
        <View pointerEvents="none" style={[styles.toneRail, { backgroundColor: toneColor }]} />
        {!reduceMotion ? <>
          <Animated.View accessibilityElementsHidden pointerEvents="none" style={[styles.leftDrop, leftDropStyle, { backgroundColor: theme.navigationGlass }]} />
          <Animated.View accessibilityElementsHidden pointerEvents="none" style={[styles.rightDrop, rightDropStyle, { backgroundColor: theme.navigationGlass }]} />
        </> : null}
        <View style={styles.content}>
          {item.onPress ? <Pressable
            accessibilityHint="Opens the notification"
            accessibilityLabel={[item.title, item.message, 'Open notification'].filter(Boolean).join('. ')}
            accessibilityRole="button"
            onPress={() => { hapticLight(); dismiss(); item.onPress?.(); }}
            style={({ pressed }) => [styles.toastAction, { opacity: pressed ? 0.72 : 1 }]}
          >
            {copy}
            <PlatformIcon color={theme.textSecondary} name="chevron-right" size={18} />
          </Pressable> : <View style={styles.toastAction}>{copy}</View>}
          <Pressable accessibilityLabel="Dismiss notification" accessibilityRole="button" hitSlop={4} onPress={() => { hapticLight(); dismiss(); }} style={({ pressed }) => [styles.dismiss, { opacity: pressed ? 0.5 : 1 }]}>
            <PlatformIcon color={theme.textTertiary} name="close" size={16} />
          </Pressable>
        </View>
      </Animated.View>
    </GestureDetector>
  </View>;
}

function ToastMaterial({ glassAvailable, reduceTransparency, themeName }: { glassAvailable: boolean; reduceTransparency: boolean | null; themeName: 'light' | 'dark' }) {
  const theme = useTheme();
  const material = glassAvailable
    ? <GlassView colorScheme={themeName} glassEffectStyle="regular" isInteractive={false} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.materialClip]} tintColor={theme.navigationGlass} />
    : reduceTransparency !== false
      ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.backgroundElevated }]} />
      : <BlurView intensity={78} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.navigationGlass }]} tint={themeName === 'dark' ? 'systemMaterialDark' : 'systemMaterialLight'} />;
  return glassAvailable
    ? <GlassContainer pointerEvents="none" spacing={Spacing.two} style={StyleSheet.absoluteFill}>{material}</GlassContainer>
    : <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.materialClip]}>{material}</View>;
}

function safeGlassAvailability() {
  try {
    return isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

function toastIcon(tone: AppToastTone): IconName {
  if (tone === 'success') return 'check-circle';
  if (tone === 'error') return 'alert-circle';
  return 'information-outline';
}

function toastColor(tone: AppToastTone, theme: ReturnType<typeof useTheme>) {
  if (tone === 'success') return theme.success;
  if (tone === 'error') return theme.danger;
  return theme.accentStrong;
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minHeight: 74, padding: Spacing.three },
  copy: { flex: 1, gap: Spacing.half, minWidth: 0 },
  dismiss: { alignItems: 'center', height: TouchTarget, justifyContent: 'center', marginRight: -Spacing.two, width: TouchTarget },
  iconWell: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.large, height: 40, justifyContent: 'center', width: 40 },
  leftDrop: { borderRadius: Radius.pill, height: 28, left: 34, position: 'absolute', top: -5, width: 28 },
  materialClip: { borderCurve: 'continuous', borderRadius: Radius.xlarge, overflow: 'hidden' },
  provider: { flex: 1 },
  rightDrop: { borderRadius: Radius.pill, height: 20, position: 'absolute', right: 46, top: -3, width: 20 },
  toastShell: { alignSelf: 'center', borderCurve: 'continuous', borderRadius: Radius.xlarge, boxShadow: '0 10px 34px rgba(27,25,23,0.18)', maxWidth: 390, minWidth: 280, overflow: 'visible', width: '100%' },
  toastAction: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: Spacing.three, minWidth: 0 },
  toneRail: { borderBottomRightRadius: Radius.medium, borderTopRightRadius: Radius.medium, bottom: 12, left: 0, position: 'absolute', top: 12, width: 4, zIndex: 2 },
  viewport: { left: Spacing.four, position: 'absolute', right: Spacing.four, top: 0, zIndex: 100 },
});
