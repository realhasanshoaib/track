import type { NavigationHelpers, ParamListBase, TabNavigationState } from 'expo-router/react-navigation';
import type { MaterialTopTabNavigationEventMap } from 'expo-router/js-top-tabs';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useKeyboardState } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { PlatformIcon, type IconName } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { AndroidBottomTabHeight, BottomTabInset, IconSize, Radius, Spacing, Typography } from '@/constants/theme';
import { usePrimaryNavigationVisibility } from '@/contexts/primary-navigation-visibility-context';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight } from '@/lib/haptics';
import { primaryDestinationForRoute, primaryNavigationHeight, primaryNavigationSafeAreaInset, primaryNavigationVisibleForPath, primaryRouteIndex, primaryTabIndexAtX, primaryTabResetTarget, type PrimaryDestination } from '@/lib/primary-navigation';
import { useReleaseConfig } from '@/lib/release-config';
import { taskListHref } from '@/lib/task-navigation';
import type { Id } from '../../../../convex/_generated/dataModel';

type StandaloneTabKey = PrimaryDestination['key'];
type RouterTabBarProps = {
  navigation: NavigationHelpers<ParamListBase, MaterialTopTabNavigationEventMap>;
  state: TabNavigationState<ParamListBase>;
};
type NavigationItem = { key: StandaloneTabKey; label: string; icon: IconName; href: string; disabled?: boolean };

const standaloneTabs: NavigationItem[] = [
  { key: 'conversations', label: 'Chats', icon: 'message', href: '/conversations' },
  { key: 'tasks', label: 'My Tasks', icon: 'task', href: '/tasks' },
  { key: 'inbox', label: 'Inbox', icon: 'email-outline', href: '/inbox' },
  { key: 'profile', label: 'Profile', icon: 'account-circle', href: '/profile' },
];

/** Keeps utility routes attached to the same four-destination app shell. */
export function StandalonePrimaryNavigation({ active }: { active?: StandaloneTabKey }) {
  const router = useRouter();
  return <FloatingNavigation
    activeKey={active}
    createDisabled
    hidden={false}
    items={standaloneTabs}
    onCreate={() => undefined}
    onSelect={(item) => router.replace(item.href as never)}
  />;
}

/** Four peer destinations with platform-specific selection feedback. */
export function PrimaryNavigation({ navigation, state }: RouterTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const release = useReleaseConfig();
  const keyboardVisible = useKeyboardState((keyboard) => keyboard.isVisible);
  const { createAction, createContext, hidden, setHidden } = usePrimaryNavigationVisibility();
  const visibleRoutes = state.routes
    .filter((route) => route.name !== '(projects)')
    .sort((a, b) => primaryRouteIndex(a.name) - primaryRouteIndex(b.name));
  const items = visibleRoutes.map((route) => ({
    ...primaryDestinationForRoute(route.name, !release.tasks),
    href: route.name,
  }));
  const activeRouteName = state.routes[state.index]?.name;
  const activeKey = items.find((item) => item.href === activeRouteName)?.key ?? 'conversations';
  const createHref = createContext?.projectId
    ? taskListHref(
      createContext.projectId as Id<'projects'>,
      createContext.companyId && createContext.membershipId ? {
        archived: Boolean(createContext.archive),
        companyId: createContext.companyId as Id<'companies'>,
        membershipId: createContext.membershipId as Id<'projectMembers'>,
      } : null,
      undefined,
      undefined,
      { create: !createContext.archive, groupId: createContext.groupId as Id<'groups'> | undefined },
    )
    : '/tasks?create=1';

  const selectItem = useCallback((item: NavigationItem | (PrimaryDestination & { href: string })) => {
    const route = visibleRoutes.find((candidate) => candidate.name === item.href);
    if (!route || item.disabled) return false;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return false;
    const resetTarget = primaryTabResetTarget(item.key);
    if (resetTarget) navigation.navigate(route.name, resetTarget);
    else navigation.navigate(route.name, route.params);
    return true;
  }, [navigation, visibleRoutes]);

  useEffect(() => setHidden(false), [pathname, setHidden]);

  if (keyboardVisible || !primaryNavigationVisibleForPath(pathname)) return null;

  return <FloatingNavigation
    activeKey={activeKey}
    createDisabled={!release.tasks || Boolean(createContext?.archive)}
    hidden={hidden}
    items={items}
    onCreate={() => {
      if (createAction) {
        createAction();
        return;
      }
      router.push(createHref as never);
    }}
    onSelect={selectItem}
  />;
}

function FloatingNavigation({ activeKey, createDisabled, hidden, items, onCreate, onSelect }: {
  activeKey?: StandaloneTabKey;
  createDisabled: boolean;
  hidden: boolean;
  items: Array<NavigationItem | (PrimaryDestination & { href: string })>;
  onCreate: () => void;
  onSelect: (item: NavigationItem | (PrimaryDestination & { href: string })) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const isAndroid = Platform.OS === 'android';
  const safeAreaBottom = primaryNavigationSafeAreaInset(insets.bottom, isAndroid ? 0 : Spacing.two);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const navigationHeight = isAndroid
    ? primaryNavigationHeight(fontScale, AndroidBottomTabHeight)
    : primaryNavigationHeight(fontScale, BottomTabInset);
  const reducedMotion = useReducedMotion();
  const [rowWidth, setRowWidth] = useState(0);
  const hiddenProgress = useSharedValue(hidden ? 1 : 0);
  const dragX = useSharedValue(0);
  const dragOpacity = useSharedValue(0);
  const dragStretch = useSharedValue(1);
  const dragPillWidth = rowWidth / Math.max(items.length, 1);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => { if (active) setReduceTransparency(enabled); })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    hiddenProgress.set(reducedMotion
      ? withTiming(hidden ? 1 : 0, { duration: 120 })
      : withSpring(hidden ? 1 : 0, { dampingRatio: 1, duration: 280 }));
  }, [hidden, hiddenProgress, reducedMotion]);

  function commitDrag(index: number) {
    const item = items[index];
    if (item && !item.disabled) onSelect(item);
  }

  const drag = Gesture.Pan()
    .activateAfterLongPress(180)
    .onBegin((event) => {
      dragX.set(event.x);
      dragOpacity.set(1);
      dragStretch.set(1.08);
    })
    .onUpdate((event) => {
      dragX.set(Math.max(dragPillWidth / 2, Math.min(rowWidth - dragPillWidth / 2, event.x)));
      dragStretch.set(Math.min(1.28, 1 + Math.abs(event.velocityX) / 3_000));
    })
    .onEnd((event) => {
      const index = primaryTabIndexAtX(event.x, rowWidth, items.length);
      const target = (index + 0.5) * (rowWidth / items.length);
      dragX.set(reducedMotion ? target : withSpring(target, { dampingRatio: 1, duration: 320, velocity: event.velocityX }));
      dragStretch.set(withSpring(1, { dampingRatio: 1, duration: 220 }));
      dragOpacity.set(withTiming(0, { duration: reducedMotion ? 80 : 140 }));
      scheduleOnRN(commitDrag, index);
    })
    .onFinalize(() => {
      dragStretch.set(withSpring(1, { dampingRatio: 1, duration: 180 }));
      dragOpacity.set(withTiming(0, { duration: 100 }));
    });

  const positionStyle = useAnimatedStyle(() => ({
    opacity: 1 - hiddenProgress.get(),
    transform: [{ translateY: hiddenProgress.get() * (navigationHeight + insets.bottom + 24) }],
  }));
  const dragStyle = useAnimatedStyle(() => ({
    opacity: dragOpacity.get(),
    transform: [{ translateX: dragX.get() - dragPillWidth / 2 }, { scaleX: dragStretch.get() }],
  }));

  const solidSelection = isAndroid || reduceTransparency;
  const selectionSurface = theme.homeBackground;
  const useNativeGlass = Platform.OS === 'ios' && !reduceTransparency && safeGlassAvailability();
  const navigationSurface = solidSelection ? theme.homeSurface : 'transparent';
  const navigationRow = <View accessibilityRole="tablist" onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)} style={[styles.row, { height: navigationHeight }]}>
    <Animated.View pointerEvents="none" style={[styles.dragPill, { backgroundColor: selectionSurface, borderColor: 'transparent', height: navigationHeight, width: dragPillWidth }, dragStyle]} />
    {items.map((item) => <NavigationTab active={item.key === activeKey} item={item} key={item.key} onPress={() => onSelect(item)} />)}
  </View>;

  return <>
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[styles.positioner, isAndroid && styles.androidPositioner, {
      paddingBottom: safeAreaBottom,
      paddingHorizontal: isAndroid ? 0 : 20,
      paddingTop: isAndroid ? 0 : Spacing.two,
    }, positionStyle]}>
      <View style={[styles.fabBand, { height: 64 }]}>
        <CreateButton disabled={createDisabled} onPress={onCreate} style={{ bottom: 4, right: isAndroid ? Spacing.three : 28 }} />
      </View>
      <View style={[styles.chrome, isAndroid && styles.androidChrome, {
        backgroundColor: navigationSurface,
        borderColor: theme.homeBorder,
        height: navigationHeight,
        boxShadow: isAndroid ? 'none' : theme.background === '#1b1917'
          ? 'inset 0 2px 12px rgba(240,177,0,0.12), 0 6px 18px rgba(0,0,0,0.2)'
          : '0 6px 18px rgba(0,0,0,0.12)',
      }]}>
        {!solidSelection ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.materialClip]}>
          {useNativeGlass ? <GlassView
            colorScheme={theme.background === '#1b1917' ? 'dark' : 'light'}
            glassEffectStyle="regular"
            isInteractive={false}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            tintColor={theme.navigationGlass}
          /> : <BlurView
            intensity={52}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            tint={theme.background === '#1b1917' ? 'dark' : 'light'}
          />}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.navigationGlass }]} />
        </View> : null}
        <GestureDetector gesture={drag}>{navigationRow}</GestureDetector>
      </View>
      {isAndroid ? <View pointerEvents="none" style={[styles.androidSafeArea, { backgroundColor: navigationSurface, height: safeAreaBottom }]} /> : null}
    </Animated.View>
  </>;
}

function NavigationTab({ active, item, onPress }: {
  active: boolean;
  item: NavigationItem | (PrimaryDestination & { href: string });
  onPress: () => void;
}) {
  const theme = useTheme();
  const isAndroid = Platform.OS === 'android';
  return <Pressable
    accessibilityLabel={item.label}
    accessibilityRole="tab"
    accessibilityState={{ disabled: item.disabled, selected: active }}
    android_ripple={isAndroid ? { color: theme.homeBackground } : undefined}
    disabled={item.disabled}
    onPress={() => { hapticLight(); onPress(); }}
    style={({ pressed }) => [styles.item, { backgroundColor: 'transparent', opacity: item.disabled ? 0.38 : pressed ? 0.9 : 1 }]}
  >
    <View style={[styles.iconWell, { backgroundColor: active ? 'transparent' : theme.homeSurface, borderColor: active ? 'transparent' : theme.homeBorder }]}>
      <PlatformIcon color={active ? theme.accentStrong : theme.textSecondary} name={item.icon} size={isAndroid ? 24 : IconSize.large + 4} variant={active ? 'filled' : 'outline'} weight={active ? 'semibold' : 'regular'} />
    </View>
    <ThemedText numberOfLines={1} style={[styles.itemLabel, isAndroid && styles.androidItemLabel, { color: active ? theme.accentStrong : theme.textSecondary }]} type="captionBold">{item.label}</ThemedText>
  </Pressable>;
}

function CreateButton({ disabled, onPress, style }: { disabled: boolean; onPress: () => void; style: { bottom: number; right: number } }) {
  const theme = useTheme();
  return <View style={[styles.createSlot, style]}>
    <Pressable
      accessibilityHint={disabled ? 'Task creation is unavailable in this Project.' : 'Create a task in the selected Project, or choose a Project first.'}
      accessibilityLabel="Create task"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { hapticLight(); onPress(); }}
      style={({ pressed }) => [styles.createButton, { boxShadow: '0 4px 12px rgba(27,25,23,0.18)', elevation: 8, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 }]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.createButtonFill, { backgroundColor: disabled ? theme.backgroundSelected : theme.accent, borderColor: theme.accentStrong }]} />
      <PlatformIcon color={disabled ? theme.textTertiary : theme.accentInk} name="plus" size={30} weight="semibold" />
    </Pressable>
  </View>;
}

function safeGlassAvailability() {
  try {
    return isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  androidChrome: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderRadius: 0, borderRightWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  androidItemLabel: { ...Typography.captionBold, marginTop: 2 },
  androidPositioner: { left: 0, paddingHorizontal: 0, paddingTop: 0, right: 0 },
  chrome: { borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: BottomTabInset, overflow: 'visible' },
  createButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, height: 56, justifyContent: 'center', width: 56 },
  createButtonFill: { borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  createSlot: { alignItems: 'center', elevation: 10, position: 'absolute', zIndex: 10 },
  dragPill: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, left: 0, position: 'absolute' },
  androidSafeArea: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  fabBand: { overflow: 'visible', position: 'relative', zIndex: 5 },
  iconWell: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: 40, justifyContent: 'center', width: 40 },
  materialClip: { borderCurve: 'continuous', borderRadius: Radius.pill, overflow: 'hidden' },
  item: { alignItems: 'center', alignSelf: 'stretch', borderCurve: 'continuous', borderRadius: Radius.large, flex: 1, justifyContent: 'center', minHeight: 60, minWidth: 0, overflow: 'hidden' },
  itemLabel: { ...Typography.captionBold, marginTop: 1 },
  positioner: { bottom: 0, left: 0, overflow: 'visible', paddingHorizontal: 20, paddingTop: Spacing.two, position: 'absolute', right: 0, zIndex: 50 },
  row: { alignItems: 'center', flexDirection: 'row', height: BottomTabInset, overflow: 'visible' },
});
