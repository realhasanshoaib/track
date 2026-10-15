import Animated, { FadeInRight, FadeOutLeft, useReducedMotion } from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';

import { EntityMark } from '@/components/entity-mark';
import { IOSGlassMaterial } from '@/components/ios-glass-material';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AnimatedPressable, usePressFeedback } from '@/hooks/use-press-feedback';

type ChannelPickerPillProps = {
  accessibilityLabel: string;
  colorKey?: string | null;
  groupId: string;
  iconKey?: string | null;
  name: string;
  onPress: () => void;
};

export function ChannelPickerPill({
  accessibilityLabel,
  colorKey,
  groupId,
  iconKey,
  name,
  onPress,
}: ChannelPickerPillProps) {
  const theme = useTheme();
  const pressFeedback = usePressFeedback({ pressedScale: 0.985 });

  return (
    <AnimatedPressable
      accessibilityHint="Opens the Channel picker"
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      onPressIn={pressFeedback.onPressIn}
      onPressOut={pressFeedback.onPressOut}
      style={[
        styles.channelPicker,
        {
          backgroundColor: theme.homeSurface,
          borderColor: theme.homeBorder,
        },
        pressFeedback.animatedStyle,
      ]}>
      <IOSGlassMaterial style={styles.glassMaterial} />
      <ChannelHeaderIdentity colorKey={colorKey} groupId={groupId} iconKey={iconKey} name={name} />
      <PlatformIcon color={theme.textSecondary} name="chevron-down" size={15} />
    </AnimatedPressable>
  );
}

export function ChannelHeaderIdentity({ colorKey, groupId, iconKey, name }: Omit<ChannelPickerPillProps, 'accessibilityLabel' | 'onPress'>) {
  const reducedMotion = useReducedMotion();
  return <Animated.View
    entering={reducedMotion ? undefined : FadeInRight.duration(180)}
    exiting={reducedMotion ? undefined : FadeOutLeft.duration(130)}
    style={styles.channelIdentity}
  >
      <EntityMark colorKey={colorKey} iconKey={iconKey} id={groupId} kind="channel" name={name} size={24} />
      <ThemedText numberOfLines={1} style={styles.channelTitle} type="title">{name}</ThemedText>
  </Animated.View>;
}

type ConversationSearchPillProps = {
  onChangeText: (value: string) => void;
  onClear: () => void;
  query: string;
};

export function ConversationSearchPill({ onChangeText, onClear, query }: ConversationSearchPillProps) {
  const theme = useTheme();

  return (
    <View style={[styles.searchPill, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
      <IOSGlassMaterial style={styles.glassMaterial} />
      <PlatformIcon color={theme.textSecondary} name="search" size={17} />
      <ThemedTextInput
        accessibilityLabel="Search messages in this Channel"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        maxLength={200}
        onChangeText={onChangeText}
        placeholder="Search messages"
        returnKeyType="search"
        style={[styles.searchInput, { color: theme.text }]}
        value={query}
      />
      {query ? <AnimatedPressable
        accessibilityLabel="Clear message search"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onClear}
        style={styles.clearSearch}>
        <PlatformIcon color={theme.textSecondary} name="close" size={17} />
      </AnimatedPressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  channelIdentity: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: Spacing.two, minWidth: 0 },
  channelPicker: {
    alignItems: 'center',
    alignSelf: 'center',
    borderCurve: 'continuous',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexShrink: 1,
    gap: Spacing.two,
    maxWidth: 280,
    minHeight: TouchTarget,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: Spacing.three,
  },
  channelTitle: { flexShrink: 1, minWidth: 0 },
  clearSearch: { alignItems: 'center', justifyContent: 'center', minHeight: 28, minWidth: 28 },
  glassMaterial: { borderCurve: 'continuous', borderRadius: Radius.pill },
  searchInput: { flex: 1, fontSize: 16, minWidth: 0, paddingHorizontal: 0, paddingVertical: 0 },
  searchPill: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    height: 42,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: Spacing.three,
  },
});
