import { Children, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { MaxFontScale, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { hapticLight } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
/** Rows rendered before a search narrows the list, so opening stays instant. */
const SEARCH_PAGE = 30;

type Props = {
  children: React.ReactNode;
  onClose: () => void;
  presentation?: 'sheet' | 'drawer';
  title: string;
  visible: boolean;
};

export function OptionsSheet({ children, onClose, presentation = 'sheet', title, visible }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scrim = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const scrollMetrics = useRef({ contentHeight: 0, offsetY: 0, viewportHeight: 0 });
  const [showScrollHint, setShowScrollHint] = useState(false);

  function updateScrollMetrics(update: Partial<typeof scrollMetrics.current>) {
    Object.assign(scrollMetrics.current, update);
    const { contentHeight, offsetY, viewportHeight } = scrollMetrics.current;
    const nextHint = contentHeight - viewportHeight - offsetY > Spacing.four;
    setShowScrollHint((current) => current === nextHint ? current : nextHint);
  }

  useEffect(() => {
    const distance = presentation === 'drawer' ? 440 : 520;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    if (visible) {
      setMounted(true);
      scrollMetrics.current = { contentHeight: 0, offsetY: 0, viewportHeight: 0 };
      setShowScrollHint(false);
      // A screen input may still hold the keyboard; the modal is a separate
      // window, so stale keyboard padding would float the sheet mid-screen.
      Keyboard.dismiss();
      const entrance = presentation === 'drawer' ? translateX : translateY;
      translateY.value = presentation === 'drawer' ? 0 : distance;
      translateX.value = presentation === 'drawer' ? distance : 0;
      entrance.value = reducedMotion
        ? withTiming(0, { duration: 0 })
        : withSpring(0, { dampingRatio: 0.88, duration: 250 });
      scrim.value = withTiming(1, { duration: reducedMotion ? 0 : 180 });
    } else {
      scrim.value = withTiming(0, { duration: reducedMotion ? 0 : 120 });
      const exit = presentation === 'drawer' ? translateX : translateY;
      exit.value = withTiming(distance, {
        duration: reducedMotion ? 0 : 150,
        easing: Easing.in(Easing.cubic),
      });
      // A tab switch can pause its Reanimated tree before the completion
      // callback runs. Close the native Modal on the JS clock as well, or it
      // can stay above the destination screen's sheet indefinitely.
      dismissTimer = setTimeout(() => setMounted(false), reducedMotion ? 0 : 170);
    }
    return () => { if (dismissTimer) clearTimeout(dismissTimer); };
  }, [presentation, reducedMotion, scrim, translateX, translateY, visible]);

  const pan = (presentation === 'drawer' ? Gesture.Pan().activeOffsetX([-12, 12]) : Gesture.Pan().activeOffsetY([-12, 12]))
    .onUpdate((event) => {
      if (presentation === 'drawer') translateX.value = Math.max(0, event.translationX);
      else translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const shouldClose = presentation === 'drawer'
        ? event.translationX > DISMISS_DISTANCE || event.velocityX > DISMISS_VELOCITY
        : event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;
      if (shouldClose) {
        scheduleOnRN(hapticLight);
        scheduleOnRN(onClose);
        return;
      }
      const settle = presentation === 'drawer' ? translateX : translateY;
      settle.value = reducedMotion
        ? withTiming(0, { duration: 0 })
        : withSpring(0, {
          dampingRatio: 0.9,
          duration: 240,
          velocity: Math.max(0, presentation === 'drawer' ? event.velocityX : event.velocityY),
        });
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: presentation === 'drawer' ? [{ translateX: translateX.value }] : [{ translateY: translateY.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  if (!mounted) return null;

  return (
    <Modal animationType="none" transparent visible={mounted} onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.modal}>
        <KeyboardAvoidingView behavior="padding" style={styles.modal}>
          <Animated.View style={[styles.scrimLayer, scrimStyle]}>
            <Pressable
              accessibilityLabel="Dismiss options"
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.scrim, { backgroundColor: theme.overlay }]}
            />
          </Animated.View>
          {/*
            The sheet is a flex child rather than an absolutely placed one: a
            percentage max height cannot resolve against an auto-height parent,
            so the old sheet grew past both screen edges and its scroll view
            never took over. Bounding it here also means the keyboard shrinks
            the sheet instead of pushing its head off the top of the screen.
          */}
          <View
            pointerEvents="box-none"
            style={[
              styles.sheetLayer,
              presentation === 'drawer' && styles.drawerLayer,
              {
                paddingBottom: presentation === 'drawer' ? Math.max(insets.bottom, Spacing.two) : 0,
                paddingTop: insets.top + Spacing.six,
              },
            ]}>
            <Animated.View style={[styles.sheetWrap, presentation === 'drawer' && styles.drawerWrap, sheetStyle]}>
              <ThemedView
                accessibilityViewIsModal
                onAccessibilityEscape={onClose}
                style={[
                  styles.sheet,
                  presentation === 'drawer' && styles.drawer,
                  presentation === 'sheet' && styles.bottomSheet,
                  {
                    backgroundColor: theme.homeBackground,
                    borderColor: theme.homeBorder,
                  },
                ]}>
                <GestureDetector gesture={pan}>
                  <View style={styles.grabArea}>
                    {presentation === 'sheet' ? <View style={[styles.handle, { backgroundColor: theme.textTertiary }]} /> : null}
                    <View style={styles.header}>
                      <ThemedText accessibilityRole="header" style={styles.headerTitle} type="titleLarge">{title}</ThemedText>
                      <Pressable
                        accessibilityLabel="Close"
                        accessibilityRole="button"
                        android_ripple={{ color: theme.backgroundSelected, borderless: true }}
                        hitSlop={12}
                        onPress={() => { hapticLight(); onClose(); }}
                        style={[styles.closeButton, { borderColor: theme.homeBorder }]}>
                        <PlatformIcon color={theme.textSecondary} name="close" size={18} />
                      </Pressable>
                    </View>
                  </View>
                </GestureDetector>
                <View style={styles.scrollFrame}>
                  <ScrollView
                    contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, Spacing.two) + (showScrollHint ? 24 : 0) }]}
                    keyboardDismissMode="interactive"
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={(_, height) => updateScrollMetrics({ contentHeight: height })}
                    onLayout={(event) => updateScrollMetrics({ viewportHeight: event.nativeEvent.layout.height })}
                    onScroll={(event) => updateScrollMetrics({ offsetY: event.nativeEvent.contentOffset.y })}
                    scrollEventThrottle={32}
                    showsVerticalScrollIndicator={false}
                    style={styles.scroll}>
                    {children}
                  </ScrollView>
                  {showScrollHint ? (
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      pointerEvents="none"
                      style={[styles.scrollHint, { backgroundColor: theme.homeBackground }]}>
                      <PlatformIcon color={theme.textTertiary} name="chevron-down" size={16} />
                    </View>
                  ) : null}
                </View>
              </ThemedView>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

export function SheetSection({ children, title }: { children: React.ReactNode; title?: string }) {
  const theme = useTheme();
  const items = Children.toArray(children);
  return (
    <View style={styles.section}>
      {title ? (
        <ThemedText accessibilityRole="header" style={styles.sectionTitle} themeColor="textSecondary" type="captionBold">
          {title}
        </ThemedText>
      ) : null}
      <View style={[styles.sectionBody, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
        {items.map((child, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={[styles.separator, { backgroundColor: theme.hairline }]} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/** Consistent padded copy for loading, empty, offline, and result states. */
export function SheetNote({
  children,
  state = 'default',
}: {
  children: React.ReactNode;
  state?: 'default' | 'success' | 'error' | 'offline';
}) {
  const theme = useTheme();
  const color = state === 'error'
    ? theme.danger
    : state === 'success'
      ? theme.success
      : state === 'offline'
        ? theme.accentStrong
        : theme.textSecondary;

  return (
    <View
      accessibilityRole={state === 'error' ? 'alert' : undefined}
      style={[styles.note, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder }]}>
      <ThemedText style={{ color }} type="caption">{children}</ThemedText>
    </View>
  );
}

export function SheetRow({
  destructive,
  detail,
  disabled,
  accessibilityHint,
  accessibilityRole,
  icon,
  label,
  leading,
  loading,
  onPress,
  selected,
  state = 'default',
  trailing,
}: {
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'checkbox' | 'radio';
  destructive?: boolean;
  detail?: string;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof PlatformIcon>['name'];
  label: string;
  leading?: React.ReactNode;
  loading?: boolean;
  onPress?: () => void;
  selected?: boolean;
  state?: 'default' | 'success' | 'error' | 'offline';
  trailing?: React.ReactNode;
}) {
  const theme = useTheme();
  const textColor = destructive || state === 'error' ? theme.danger : state === 'success' ? theme.success : theme.text;
  const iconColor = destructive || state === 'error' ? theme.danger : state === 'success' ? theme.success : state === 'offline' ? theme.accentStrong : theme.textSecondary;
  const unavailable = disabled || loading;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityRole={onPress ? accessibilityRole ?? (selected === undefined ? 'button' : 'radio') : undefined}
      accessibilityState={{
        busy: Boolean(loading),
        disabled: Boolean(unavailable),
        ...(accessibilityRole === 'checkbox' ? { checked: Boolean(selected) } : { selected }),
      }}
      android_ripple={{ color: theme.backgroundSelected }}
      disabled={unavailable}
      onPress={() => { if (onPress) { hapticLight(); onPress(); } }}
      style={({ pressed }) => [
        styles.sheetRow,
        {
          backgroundColor: selected ? theme.accentSoft : pressed ? theme.backgroundElement : 'transparent',
          opacity: unavailable ? 0.45 : 1,
        },
      ]}>
      <View style={styles.sheetRowLeading}>
        {leading ?? (icon || state === 'offline' ? (
          <View style={[styles.sheetRowIcon, { backgroundColor: theme.backgroundElement }]}>
            <PlatformIcon color={iconColor} name={icon ?? 'cloud-off'} size={19} />
          </View>
        ) : null)}
      </View>
      <View style={styles.sheetRowBody}>
        <ThemedText numberOfLines={1} style={{ color: textColor }} type="small">
          {label}
        </ThemedText>
        {detail ? (
          <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{detail}</ThemedText>
        ) : null}
      </View>
      {loading ? <ActivityIndicator color={iconColor} size="small" /> : selected ? (
        <PlatformIcon color={theme.accentStrong} name="check-circle" size={19} />
      ) : trailing ? (
        trailing
      ) : null}
    </Pressable>
  );
}

export function SheetInput({
  autoFocus,
  label,
  maxLength,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  autoFocus?: boolean;
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (v: string) => void;
  placeholder?: string;
  value: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.inputWrap}>
      <ThemedText accessible={false} themeColor="textSecondary" type="captionBold">{label}</ThemedText>
      <ThemedTextInput
        accessibilityLabel={label}
        autoFocus={autoFocus}
        keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
        cursorColor={theme.accent}
        maxLength={maxLength}
        maxFontSizeMultiplier={MaxFontScale}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        selectionColor={theme.accent}
        selectionHandleColor={theme.accent}
        style={[
          styles.input,
          multiline && styles.inputMulti,
          styles.inputText,
          { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder, color: theme.text },
          multiline && styles.inputTextMulti,
        ]}
        value={value}
      />
    </View>
  );
}

/**
 * A tappable field that shows the current value and opens a dedicated picker.
 * Replaces free-form text entry for structured values.
 */
export function SheetFieldButton({
  expanded,
  icon,
  label,
  onPress,
  placeholder = 'Not set',
  onClear,
  value,
}: {
  expanded?: boolean;
  icon?: React.ComponentProps<typeof PlatformIcon>['name'];
  label: string;
  onPress: () => void;
  placeholder?: string;
  onClear?: () => void;
  value?: string | null;
}) {
  const theme = useTheme();
  return (
    <View style={styles.inputWrap}>
      <ThemedText accessible={false} themeColor="textSecondary" type="captionBold">{label}</ThemedText>
      <Pressable
        accessibilityHint={`Opens the ${label.toLowerCase()} picker`}
        accessibilityLabel={`${label}: ${value || placeholder}`}
        accessibilityRole="button"
        accessibilityState={expanded === undefined ? undefined : { expanded }}
        android_ripple={{ color: theme.backgroundSelected }}
        onPress={() => { hapticLight(); onPress(); }}
        style={[styles.field, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
        {icon ? <PlatformIcon color={theme.textSecondary} name={icon} size={19} /> : null}
        <ThemedText
          numberOfLines={1}
          style={styles.fieldValue}
          themeColor={value ? 'text' : 'textTertiary'}
          type="small">
          {value || placeholder}
        </ThemedText>
        {value && onClear ? (
          <Pressable
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            accessibilityRole="button"
            hitSlop={14}
            onPress={() => { hapticLight(); onClear(); }}>
            <PlatformIcon color={theme.textSecondary} name="close" size={17} />
          </Pressable>
        ) : (
          <PlatformIcon color={theme.textTertiary} name={expanded === undefined ? 'chevron-right' : expanded ? 'chevron-up' : 'chevron-down'} size={18} />
        )}
      </Pressable>
    </View>
  );
}

export type SearchListItem = {
  /**
   * A function is resolved only for the rows that actually render, so a detail
   * that costs real work — a timezone's live offset and clock — never has to be
   * computed for the whole table.
   */
  detail?: string | (() => string);
  key: string;
  label: string;
  leading?: React.ReactNode;
  searchText?: string;
};

/** A filtered, selectable list for choices too numerous to stack as rows. */
export function SheetSearchList({
  emptyLabel = 'No matches',
  items,
  onSelect,
  placeholder = 'Search',
  selectedKey,
}: {
  emptyLabel?: string;
  items: SearchListItem[];
  onSelect: (key: string) => void;
  placeholder?: string;
  selectedKey?: string | null;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => (item.searchText ?? item.label).toLowerCase().includes(needle));
  }, [items, query]);

  // A sheet scrolls its own content, so a virtualized list cannot live inside
  // it. Rendering a page at a time keeps a long table cheap to open instead.
  const visible = filtered.slice(0, SEARCH_PAGE);
  const remaining = filtered.length - visible.length;

  return (
    <View style={styles.searchWrap}>
      <View style={[styles.searchBar, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
        <PlatformIcon color={theme.textSecondary} name="search" size={18} />
        <ThemedTextInput
          accessibilityLabel={placeholder}
          autoCorrect={false}
          clearButtonMode="while-editing"
          keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
          cursorColor={theme.accent}
          maxLength={100}
          maxFontSizeMultiplier={MaxFontScale}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={theme.textTertiary}
          selectionColor={theme.accent}
          selectionHandleColor={theme.accent}
          style={[styles.searchInput, { color: theme.text }]}
          value={query}
        />
      </View>
      {visible.length ? (
        <SheetSection>
          {visible.map((item) => (
            <SheetRow
              detail={typeof item.detail === 'function' ? item.detail() : item.detail}
              key={item.key}
              label={item.label}
              leading={item.leading}
              onPress={() => onSelect(item.key)}
              selected={item.key === selectedKey}
            />
          ))}
        </SheetSection>
      ) : (
        <View style={styles.searchEmpty}>
          <ThemedText themeColor="textSecondary" type="small">{emptyLabel}</ThemedText>
        </View>
      )}
      {remaining > 0 ? (
        <ThemedText
          accessibilityLiveRegion="polite"
          style={styles.searchMore}
          themeColor="textSecondary"
          type="caption">
          {`${remaining} more — keep typing to narrow the list`}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: TouchTarget,
    justifyContent: 'center',
    width: TouchTarget,
  },
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
  field: {
    alignItems: 'center',
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
  },
  fieldValue: {
    flex: 1,
  },
  grabArea: {
    paddingTop: Spacing.three,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: 3,
    height: 5,
    marginBottom: Spacing.two,
    opacity: 0.5,
    width: 40,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
    minHeight: 52,
    paddingBottom: Spacing.four,
  },
  headerTitle: {
    flex: 1,
  },
  input: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: TouchTarget,
    overflow: 'hidden',
  },
  inputMulti: {
    minHeight: 96,
  },
  inputText: {
    ...Typography.body,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  inputTextMulti: {
    textAlignVertical: 'top',
  },
  inputWrap: {
    gap: Spacing.one,
  },
  modal: {
    flex: 1,
  },
  scrim: {
    flex: 1,
  },
  scrimLayer: {
    ...StyleSheet.absoluteFill,
  },

  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollFrame: {
    flexShrink: 1,
    position: 'relative',
  },
  scrollHint: {
    alignItems: 'center',
    bottom: 0,
    height: 24,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  searchBar: {
    alignItems: 'center',
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
  },
  searchEmpty: {
    alignItems: 'center',
    padding: Spacing.five,
  },
  searchInput: {
    ...Typography.body,
    flex: 1,
    paddingVertical: Spacing.two,
  },
  searchMore: {
    paddingHorizontal: 4,
  },
  searchWrap: {
    gap: Spacing.three,
  },
  note: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  sectionBody: {
    borderRadius: Radius.homeSurface,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sectionTitle: {
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  sheet: {
    borderRadius: Radius.xlarge,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 12px 36px rgba(0,0,0,0.22)',
    flexShrink: 1,
    paddingHorizontal: Spacing.four,
  },
  bottomSheet: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  drawer: {
    flex: 1,
    maxWidth: 420,
    width: '88%',
  },
  drawerLayer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sheetLayer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  sheetRowBody: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  sheetRowIcon: {
    alignItems: 'center',
    borderRadius: Radius.large,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sheetRowLeading: { alignItems: 'center', justifyContent: 'center', minWidth: 36 },
  sheetWrap: {
    flexShrink: 1,
    marginHorizontal: Spacing.two,
  },
  drawerWrap: {
    alignSelf: 'stretch',
    height: '100%',
    marginHorizontal: 0,
  },
});
