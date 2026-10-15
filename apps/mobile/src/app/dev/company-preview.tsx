import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CompanyPickerScreen, type CompanyInviteItem, type CompanyPickerItem } from '@/components/company-picker-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STATES = ['demo', 'worst', 'empty', 'one', 'many', 'suspended'] as const;
type PreviewState = typeof STATES[number];

const LABELS: Record<PreviewState, string> = {
  demo: 'Demo',
  worst: 'Worst case',
  empty: 'Empty',
  one: 'One company',
  many: '40 companies',
  suspended: 'Unavailable',
};

function selectedState(value?: string): PreviewState {
  return STATES.find((state) => state === value) ?? 'demo';
}

function makeCompany(index: number, name: string, status: CompanyPickerItem['status'] = 'active'): CompanyPickerItem {
  return {
    id: `company:company-preview-${index}`,
    name,
    status,
  };
}

function companiesFor(state: PreviewState): CompanyPickerItem[] {
  if (state === 'empty') return [];
  if (state === 'one') return [makeCompany(1, 'Acme Health')];
  if (state === 'suspended') return [
    makeCompany(1, 'Acme Health'),
    makeCompany(2, 'Archived Research Group', 'unavailable'),
  ];
  if (state === 'worst') return [
    makeCompany(1, 'Acme Health Clinical Research and Patient Experience Group'),
    makeCompany(2, '环球国际医疗保健集团'),
    makeCompany(3, 'شركة المدار للتقنيات الصحية والبحوث السريرية'),
    makeCompany(4, 'Research and Accessibility Standards Working Group', 'unavailable'),
  ];
  const names = ['Acme Health', 'Northstar Research', 'Patient Portal', 'Design Systems', 'Clinical Operations'];
  const count = state === 'many' ? 40 : 3;
  return Array.from({ length: count }, (_, index) => makeCompany(index + 1, `${names[index % names.length]}${index > 4 ? ` ${index + 1}` : ''}`));
}

function invitationsFor(state: PreviewState, onAccept: () => void, onDecline: () => void): CompanyInviteItem[] {
  if (state === 'empty' || state === 'one' || state === 'suspended') return [];
  const title = state === 'worst'
    ? 'International Patient Safety and Clinical Research Collaboration'
    : 'Design Systems';
  const detail = state === 'worst'
    ? 'From Acme Health Clinical Research and Patient Experience Group'
    : 'From Acme Health';
  const count = state === 'many' ? 8 : 1;
  return Array.from({ length: count }, (_, index) => ({
    id: `invitation:company-preview-${index}`,
    title: index === 0 ? title : `${title} ${index + 1}`,
    detail,
    decision: null,
    busy: false,
    onAccept,
    onDecline,
  }));
}

export default function CompanyPreviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data } = useLocalSearchParams<{ data?: string }>();
  const state = selectedState(data);
  const companies = useMemo(() => companiesFor(state), [state]);
  const invitations = useMemo(() => invitationsFor(state, () => undefined, () => undefined), [state]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(companies[0]?.id ?? null);

  useEffect(() => setSelectedCompanyId(companies[0]?.id ?? null), [companies]);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.fixtureBar, { backgroundColor: theme.homeSurface, borderBottomColor: theme.homeBorder }]}>
        <ThemedText type="captionBold">Companies</ThemedText>
        <ScrollView contentContainerStyle={styles.fixtureOptions} horizontal showsHorizontalScrollIndicator={false}>
          {STATES.map((option) => {
            const active = option === state;
            return <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={option}
              onPress={() => router.setParams({ data: option })}
              style={[styles.fixtureOption, { backgroundColor: active ? theme.accent : theme.backgroundElement, borderColor: active ? theme.accent : theme.homeBorder }]}
            >
              <ThemedText style={{ color: active ? theme.accentInk : theme.text }} type="captionBold">{LABELS[option]}</ThemedText>
            </Pressable>;
          })}
        </ScrollView>
      </View>
      <CompanyPickerScreen
        bottomPadding={Spacing.six}
        companies={companies}
        companiesLoading={false}
        invitations={invitations}
        onSelectCompany={setSelectedCompanyId}
        selectedCompanyId={selectedCompanyId}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fixtureBar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  fixtureOption: { borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  fixtureOptions: { alignItems: 'center', gap: Spacing.one, paddingRight: Spacing.one },
  screen: { flex: 1 },
});
