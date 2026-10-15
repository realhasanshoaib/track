import { Pressable, StyleSheet, View } from 'react-native';

import { EntityMark } from '@/components/entity-mark';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { MaxFontScale, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  companyId: string | null;
  companyLogoUrl: string | null;
  companyName: string;
  disabled?: boolean;
  maxSearchLength?: number;
  onSearchChange: (value: string) => void;
  onSwitchCompany: () => void;
  search: string;
  searchAccessibilityLabel: string;
  searchPlaceholder: string;
  title: string;
};

/** Shared page heading and search controls for the app's main work screens. */
export function WorkspaceTopControls({
  companyId,
  companyLogoUrl,
  companyName,
  disabled = false,
  maxSearchLength,
  onSearchChange,
  onSwitchCompany,
  search,
  searchAccessibilityLabel,
  searchPlaceholder,
  title,
}: Props) {
  const theme = useTheme();

  return <View style={styles.root}>
    <View style={styles.heading}>
      <ThemedText accessibilityRole="header" numberOfLines={1} style={styles.title} type="display">{title}</ThemedText>
      <Pressable
        accessibilityHint="Opens the Company selector"
        accessibilityLabel={`Switch Company. Current Company: ${companyName}`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onSwitchCompany}
        style={({ pressed }) => [styles.companyButton, {
          backgroundColor: pressed ? theme.backgroundSelected : theme.homeSurface,
          borderColor: theme.homeBorder,
          opacity: disabled ? 0.5 : 1,
        }]}
      >
        <EntityMark id={companyId ?? 'company'} imageUrl={companyLogoUrl} kind="company" name={companyName} size={26} />
        <ThemedText numberOfLines={1} style={styles.companyName} type="captionBold">{companyName}</ThemedText>
        <PlatformIcon color={theme.textSecondary} name="chevron-down" size={14} weight="regular" />
      </Pressable>
    </View>

    <View style={[styles.searchField, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder }]}>
      <PlatformIcon color={theme.textTertiary} name="search" size={17} />
      <ThemedTextInput
        accessibilityLabel={searchAccessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
        maxLength={maxSearchLength}
        maxFontSizeMultiplier={MaxFontScale}
        onChangeText={onSearchChange}
        placeholder={searchPlaceholder}
        placeholderTextColor={theme.textTertiary}
        returnKeyType="search"
        style={[styles.searchInput, { color: theme.text }]}
        value={search}
      />
      {search ? <Pressable
        accessibilityLabel="Clear search"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => onSearchChange('')}
        style={styles.clearSearch}
      ><PlatformIcon color={theme.textSecondary} name="close" size={18} weight="regular" /></Pressable> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  clearSearch: { alignItems: 'center', borderRadius: Radius.pill, height: 32, justifyContent: 'center', width: 32 },
  companyButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexShrink: 1, gap: Spacing.two, height: TouchTarget, justifyContent: 'flex-start', maxWidth: '62%', minWidth: TouchTarget, paddingHorizontal: Spacing.two },
  companyName: { flexShrink: 1, minWidth: 0 },
  heading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', minHeight: TouchTarget },
  root: { gap: Spacing.two },
  searchField: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, height: TouchTarget, minHeight: TouchTarget, paddingHorizontal: Spacing.three, width: '100%' },
  searchInput: { ...Typography.body, flex: 1, minWidth: 0, paddingVertical: 0 },
  title: { flex: 1, flexShrink: 1, minWidth: 0 },
});
