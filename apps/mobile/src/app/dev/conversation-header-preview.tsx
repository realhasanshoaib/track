import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChannelPickerPill, ConversationSearchPill } from '@/components/chat/conversation-header-controls';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STATES = ['demo', 'worst', 'empty', 'one', 'read-only'] as const;
type PreviewState = typeof STATES[number];

const LABELS: Record<PreviewState, string> = {
  demo: 'Demo',
  empty: 'Fallback',
  one: 'One letter',
  'read-only': 'Read only',
  worst: 'Worst case',
};

const LONG_CHANNEL_NAME = 'International Clinical Operations and Patient Portal Migration Readiness Review';
const LONG_SEARCH_QUERY = 'Find Patient Portal handoff updates, confirm the clinical operations owner, show open cross-team delivery risks, and list the latest accessibility review before the release checkpoint.';

function selectedState(value?: string): PreviewState {
  return STATES.find((state) => state === value) ?? 'demo';
}

export default function ConversationHeaderPreviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data } = useLocalSearchParams<{ data?: string }>();
  const state = selectedState(data);
  const readOnly = state === 'read-only';
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const iconAppearance = Platform.OS === 'ios' ? 'glass' : 'surface';
  const channelName = state === 'worst'
    ? LONG_CHANNEL_NAME
    : state === 'one'
      ? 'Q'
      : state === 'empty'
        ? 'Conversation'
        : 'Leadership';

  useEffect(() => {
    setQuery(state === 'worst' ? LONG_SEARCH_QUERY : '');
  }, [state]);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.preview, { paddingTop: insets.top + Spacing.two }]}>
        <ThemedText accessibilityRole="header" type="title">iOS Channel header</ThemedText>
        <ThemedText themeColor="textSecondary" type="small">320 pt preview width, with separate glass controls.</ThemedText>
        <View style={[styles.headerRow, { maxWidth: Math.min(width - Spacing.six, 320), marginTop: Spacing.four }]}>
          <IconButton
            accessibilityLabel={searchOpen ? 'Close message search' : 'Back to conversations'}
            appearance={iconAppearance}
            icon="arrow-left"
            onPress={() => setSearchOpen(false)}
          />
          {searchOpen ? (
            <ConversationSearchPill onChangeText={setQuery} onClear={() => setQuery('')} query={query} />
          ) : (
            <View style={styles.channelSlot}>
              <ChannelPickerPill
                accessibilityLabel={`Choose Channel. Current Channel: ${channelName}`}
                colorKey={state === 'empty' ? null : 'teal'}
                groupId="groups:conversation-header-preview"
                iconKey={state === 'empty' ? null : 'channel'}
                name={channelName}
                onPress={() => undefined}
              />
            </View>
          )}
          {!searchOpen ? <View style={styles.headerActions}>
            <IconButton
              accessibilityLabel="Search messages in this Channel"
              appearance={iconAppearance}
              icon="search"
              onPress={() => setSearchOpen(true)}
            />
            {!readOnly ? <IconButton
              accessibilityLabel="Channel options"
              appearance={iconAppearance}
              icon="dots-horizontal"
              onPress={() => undefined}
            /> : null}
          </View> : null}
        </View>
      </View>
      <View style={[styles.fixtureBar, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder, bottom: insets.bottom + Spacing.three }]}>
        <ThemedText type="captionBold">Header data</ThemedText>
        <ScrollView contentContainerStyle={styles.fixtureOptions} horizontal showsHorizontalScrollIndicator={false}>
          {STATES.map((option) => {
            const active = option === state;
            return <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={option}
              onPress={() => router.setParams({ data: option })}
              style={[styles.fixtureOption, { backgroundColor: active ? theme.homeSurface : 'transparent' }]}
            >
              <Text style={[styles.fixtureLabel, { color: theme.text }]}>{LABELS[option]}</Text>
            </Pressable>;
          })}
        </ScrollView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  channelSlot: { alignItems: 'center', flex: 1, minWidth: 0 },
  fixtureBar: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: 'row',
    gap: Spacing.two,
    maxWidth: 520,
    padding: Spacing.one,
    position: 'absolute',
    width: '96%',
  },
  fixtureLabel: { fontSize: 12, fontWeight: '600' },
  fixtureOption: { alignItems: 'center', borderRadius: 18, justifyContent: 'center', minHeight: 36, paddingHorizontal: Spacing.two },
  fixtureOptions: { alignItems: 'center', flexGrow: 1, gap: Spacing.half, justifyContent: 'center' },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  headerRow: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: Spacing.two, width: '100%' },
  preview: { gap: Spacing.one, paddingHorizontal: Spacing.three },
  screen: { flex: 1 },
});
