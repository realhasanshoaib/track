import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { EntityMark } from '@/components/entity-mark';
import { PlatformIcon } from '@/components/platform-icon';
import { SkeletonList } from '@/components/skeleton-row';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { StateEntering, StateLayout } from '@/constants/motion';

export type CompanyPickerItem<T extends string = string> = {
  id: T;
  name: string;
  status: 'active' | 'unavailable';
  colorKey?: string | null;
  iconKey?: string | null;
  imageUrl?: string | null;
};

export type CompanyInviteItem = {
  id: string;
  title: string;
  detail: string;
  decision: 'accept' | 'decline' | null;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export function CompanyPickerScreen<T extends string>({
  companies,
  selectedCompanyId,
  onSelectCompany,
  companiesLoading,
  invitations,
  invitationsLoading = false,
  bottomPadding,
}: {
  companies: CompanyPickerItem<T>[];
  selectedCompanyId: T | null;
  onSelectCompany: (companyId: T | null) => void;
  companiesLoading: boolean;
  invitations: CompanyInviteItem[];
  invitationsLoading?: boolean;
  bottomPadding: number;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const largeText = useWindowDimensions().fontScale > 1.2;

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View accessibilityRole="radiogroup" accessibilityLabel="Choose a company" style={[styles.choiceGroup, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
        {companiesLoading ? <SkeletonList count={3} label="Loading your Companies" /> : companies.map((company, index) => (
          <Animated.View entering={reducedMotion ? undefined : StateEntering} key={company.id} layout={reducedMotion ? undefined : StateLayout}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.hairline }]} /> : null}
            <CompanyChoiceRow
              disabled={company.status !== 'active'}
              icon={(
                <EntityMark
                  colorKey={company.colorKey}
                  iconKey={company.iconKey}
                  id={company.id}
                  imageUrl={company.imageUrl}
                  kind="company"
                  name={company.name}
                  size={40}
                />
              )}
              label={company.name}
              largeText={largeText}
              onPress={() => onSelectCompany(company.id)}
              selected={company.id === selectedCompanyId}
              unavailable={company.status !== 'active'}
            />
          </Animated.View>
        ))}
        {!companiesLoading && companies.length > 0 ? <View style={[styles.divider, { backgroundColor: theme.hairline }]} /> : null}
        <CompanyChoiceRow
          icon={<View style={[styles.personalMark, { backgroundColor: theme.backgroundElement }]}><PlatformIcon color={theme.textSecondary} name="person" size={19} /></View>}
          label="Personal Projects"
          largeText={largeText}
          onPress={() => onSelectCompany(null)}
          selected={selectedCompanyId === null}
        />
      </View>

      {invitationsLoading || invitations.length ? (
        <Animated.View entering={reducedMotion ? undefined : StateEntering} layout={reducedMotion ? undefined : StateLayout} style={styles.invitationSection}>
          <ThemedText accessibilityRole="header" type="subtitle">Invitations</ThemedText>
          <View style={[styles.invitationGroup, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
            {invitationsLoading ? <SkeletonList count={2} label="Loading invitations" /> : invitations.map((invitation, index) => (
              <Animated.View entering={reducedMotion ? undefined : StateEntering} key={invitation.id} layout={reducedMotion ? undefined : StateLayout}>
                {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.hairline }]} /> : null}
                <View style={styles.invitationRow}>
                  <View style={styles.invitationCopy}>
                    <ThemedText numberOfLines={largeText ? undefined : 2} type="title">{invitation.title}</ThemedText>
                    <ThemedText themeColor="textSecondary" type="caption">{invitation.detail}</ThemedText>
                  </View>
                  <View style={styles.invitationActions}>
                    <InvitationAction disabled={invitation.busy} label={invitation.decision === 'accept' ? 'Joining…' : 'Accept'} onPress={invitation.onAccept} primary title={invitation.title} />
                    <InvitationAction disabled={invitation.busy} label={invitation.decision === 'decline' ? 'Declining…' : 'Decline'} onPress={invitation.onDecline} title={invitation.title} />
                  </View>
                </View>
              </Animated.View>
            ))}
          </View>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

function CompanyChoiceRow({
  icon,
  label,
  onPress,
  selected,
  disabled = false,
  unavailable = false,
  largeText,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  selected: boolean;
  disabled?: boolean;
  unavailable?: boolean;
  largeText: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={`${label}${unavailable ? ', unavailable' : ''}`}
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      android_ripple={{ color: theme.backgroundSelected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.choiceRow, largeText && styles.choiceRowLarge, { backgroundColor: selected ? theme.accentSoft : 'transparent', opacity: disabled ? 0.62 : 1 }, pressed && !disabled && { backgroundColor: theme.backgroundSelected }]}
    >
      {icon}
      <View style={styles.choiceCopy}>
        <ThemedText numberOfLines={largeText ? undefined : 2} type="title">{label}</ThemedText>
        {unavailable ? <ThemedText themeColor="textSecondary" type="caption">Unavailable</ThemedText> : null}
      </View>
      <View style={[styles.radio, { borderColor: selected ? theme.accentStrong : theme.textTertiary }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: theme.accentStrong }]} /> : null}
      </View>
    </Pressable>
  );
}

function InvitationAction({ label, onPress, primary, disabled, title }: { label: string; onPress: () => void; primary?: boolean; disabled: boolean; title: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={`${label} invitation: ${title}`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { backgroundColor: primary ? theme.accentSoft : 'transparent', opacity: disabled ? 0.56 : pressed ? 0.72 : 1 }]}
    >
      <ThemedText themeColor={primary ? 'accentStrong' : 'textSecondary'} type="captionBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, justifyContent: 'center', minHeight: TouchTarget, minWidth: 72, paddingHorizontal: Spacing.three },
  choiceCopy: { flex: 1, justifyContent: 'center', minWidth: 0 },
  choiceGroup: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', padding: Spacing.one },
  choiceRow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, flexDirection: 'row', gap: Spacing.three, minHeight: 64, overflow: 'hidden', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  choiceRowLarge: { alignItems: 'flex-start', minHeight: 76 },
  content: { alignSelf: 'center', gap: Spacing.five, maxWidth: 560, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, width: '100%' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.three },
  invitationActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  invitationCopy: { flex: 1, gap: Spacing.one, minWidth: 0 },
  invitationGroup: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', paddingHorizontal: Spacing.three },
  invitationRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'space-between', paddingVertical: Spacing.three },
  invitationSection: { gap: Spacing.three },
  personalMark: { alignItems: 'center', borderRadius: Radius.pill, height: 40, justifyContent: 'center', width: 40 },
  radio: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1.5, height: 20, justifyContent: 'center', width: 20 },
  radioDot: { borderRadius: Radius.pill, height: 10, width: 10 },
});
