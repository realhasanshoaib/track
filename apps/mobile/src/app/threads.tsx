import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { EmptyState } from '@/components/empty-state';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useTrackUser } from '@/contexts/track-user-context';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber, useLocale } from '@/i18n';
import { hapticLight } from '@/lib/haptics';
import { useReleaseConfig } from '@/lib/release-config';
import { threadConversationHref } from '@/lib/thread-navigation';
import { useTranslation } from 'react-i18next';

type ThreadListRow = {
  key: string;
  groupId: Id<'groups'> | undefined;
  threadId: Id<'channelThreads'>;
  messageId?: Id<'messages'>;
  title: string;
  subtitle: string;
  unread: boolean;
};

export default function ThreadsScreen() {
  const theme = useTheme();
  const { direction, locale } = useLocale();
  const { t } = useTranslation('chat');
  const router = useRouter();
  const releaseConfig = useReleaseConfig();
  const { trackUserId } = useTrackUser();
  const { groupId, projectId, companyId, membershipId, archive, sourceMessageId } = useLocalSearchParams<{
    groupId: string;
    projectId: string;
    companyId?: string;
    membershipId?: string;
    archive?: string;
    sourceMessageId?: string;
  }>();
  const gid = groupId as Id<'groups'> | undefined;
  const pid = projectId as Id<'projects'> | undefined;
  const cid = companyId as Id<'companies'> | undefined;
  const pmid = membershipId as Id<'projectMembers'> | undefined;
  const sourceId = sourceMessageId as Id<'messages'> | undefined;
  const context = cid && pmid ? { companyId: cid, membershipId: pmid, archived: archive === '1' } : null;
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createKey = useRef<string | null>(null);
  const createThread = useMutation(api.channelThreads.create);
  const navigation = useQuery(
    api.mobile.resolveNavigation,
    releaseConfig.threads && trackUserId && pid && gid
      ? { userId: trackUserId, projectId: pid, groupId: gid, actingCompanyId: cid, projectMemberId: pmid }
      : 'skip',
  );
  const threads = useQuery(
    api.channelThreads.list,
    releaseConfig.threads && trackUserId && gid && navigation?.available
      ? { userId: trackUserId, groupId: gid, actingCompanyId: cid, projectMemberId: pmid, status }
      : 'skip',
  );
  const searchTerm = searchQuery.trim();
  const searchResults = useQuery(
    api.search.project,
    releaseConfig.threads && trackUserId && pid && navigation?.available && searchTerm.length >= 2
      ? {
          userId: trackUserId,
          projectId: pid,
          actingCompanyId: cid,
          projectMemberId: pmid,
          filter: 'all',
          limit: 12,
          query: searchTerm,
        }
      : 'skip',
  );
  const searchActive = searchTerm.length >= 2;
  const rows = useMemo<ThreadListRow[]>(() => searchActive
    ? [
        ...(searchResults?.threads ?? []).map((item) => ({
          key: `thread-${item.id}`,
          groupId: item.groupId,
          threadId: item.threadId,
          messageId: undefined,
          title: item.title,
          subtitle: `${item.preview} · ${item.groupName}`,
          unread: false,
        })),
        ...(searchResults?.messages ?? []).flatMap((item) => item.threadId ? [{
          key: `message-${item.id}`,
          groupId: item.groupId,
          threadId: item.threadId,
          messageId: item.messageId,
          title: item.threadName ?? t('threads.threadReply'),
          subtitle: item.preview,
          unread: false,
        }] : []),
        ...(searchResults?.files ?? []).flatMap((item) => item.threadId ? [{
          key: `file-${item.id}`,
          groupId: item.groupId,
          threadId: item.threadId,
          messageId: item.messageId,
          title: item.title,
          subtitle: `${item.threadName ?? t('threads.threadAttachment')} · ${item.groupName}`,
          unread: false,
        }] : []),
      ]
    : (threads ?? []).map((item) => ({
        key: `thread-${item.thread._id}`,
        groupId: gid,
        threadId: item.thread._id,
        messageId: undefined,
        title: item.thread.name,
        subtitle: `${t('threads.replyCount', { count: item.replyCount, formattedCount: formatNumber(locale, item.replyCount) })}${item.following ? ` · ${t('threads.following')}` : ''}`,
        unread: item.unread,
      })), [locale, searchActive, searchResults, t, threads]);
  const readOnly = archive === '1' || navigation?.archived === true;

  async function submit() {
    if (!trackUserId || !pid || !gid || !name.trim()) return;
    setSaving(true);
    setError(null);
    createKey.current ??= crypto.randomUUID();
    try {
      const threadId = await createThread({
        projectId: pid,
        groupId: gid,
        creatorId: trackUserId,
        actingCompanyId: cid,
        projectMemberId: pmid,
        sourceMessageId: sourceId,
        idempotencyKey: createKey.current,
        name,
      });
      createKey.current = null;
      router.replace(threadConversationHref(pid, gid, threadId, context) as never);
    } catch {
      setError(t('errors.save'));
    } finally {
      setSaving(false);
    }
  }

  if (!releaseConfig.threads || (navigation && !navigation.available)) {
    return <ThemedView style={styles.screen}><Stack.Screen options={{ title: t('threads.unavailableTitle') }} /><EmptyState body={t('threads.unavailableBody')} icon="forum-outline" title={t('threads.unavailableTitle')} /></ThemedView>;
  }

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: t('threads.title') }} />
      <View style={[styles.tabs, { borderBottomColor: theme.hairline }, direction === 'rtl' && styles.rtlRow]}>
        {(['active', 'archived'] as const).map((value) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: status === value }}
            key={value}
            onPress={() => { hapticLight(); setStatus(value); }}
            style={[styles.tab, status === value && { borderBottomColor: theme.accent }]}>
            <ThemedText type="smallBold">{value === 'active' ? t('threads.active') : t('threads.archived')}</ThemedText>
          </Pressable>
        ))}
      </View>
      {sourceId ? <View style={[styles.sourceNotice, { backgroundColor: theme.backgroundElement }]}><ThemedText type="small">{t('threads.sourceNotice')}</ThemedText></View> : null}
      <TextInput
        accessibilityLabel={t('threads.searchAccessibility')}
        onChangeText={setSearchQuery}
        placeholder={t('threads.searchPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        style={[styles.search, { borderColor: theme.hairline, color: theme.text, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
        value={searchQuery}
      />
      {error ? <ThemedText accessibilityLiveRegion="polite" style={styles.error} type="small">{t('errors.retryRequest', { error })}</ThemedText> : null}
      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(item) => item.key}
        ListEmptyComponent={(searchActive ? searchResults : threads) === undefined
          ? <ThemedText style={{ color: theme.textSecondary }}>{searchActive ? t('threads.searching') : t('threads.loading')}</ThemedText>
          : <EmptyState body={searchActive ? t('threads.noResultsBody', { query: searchTerm }) : t('threads.noThreadsBody', { status: status === 'active' ? t('threads.active').toLocaleLowerCase() : t('threads.archived').toLocaleLowerCase() })} icon="forum-outline" title={searchActive ? t('threads.noResultsTitle') : t('threads.noThreadsTitle')} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityHint={item.unread ? t('threads.unreadHint') : undefined}
            onPress={() => pid && item.groupId && item.threadId && router.push(threadConversationHref(pid, item.groupId, item.threadId, context, item.messageId) as never)}
            style={[styles.row, { backgroundColor: theme.backgroundElement }, direction === 'rtl' && styles.rtlRow]}>
            <View style={styles.rowCopy}>
              <ThemedText contentDirection="auto" type="smallBold">{item.title}</ThemedText>
              <ThemedText contentDirection="auto" numberOfLines={2} style={{ color: theme.textSecondary }} type="small">{item.subtitle}</ThemedText>
            </View>
            {item.unread ? <ThemedText style={{ color: theme.accent }} type="code">{t('threads.unread')}</ThemedText> : <PlatformIcon color={theme.textSecondary} directional name="chevron-right" size={18} />}
          </Pressable>
        )}
      />
      {!readOnly && status === 'active' && !searchActive ? (
        <View style={[styles.create, { borderTopColor: theme.hairline }, direction === 'rtl' && styles.rtlRow]}>
          <TextInput
            accessibilityLabel={t('threads.nameAccessibility')}
            maxLength={100}
            onChangeText={setName}
            placeholder={t('threads.namePlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { borderColor: theme.hairline, color: theme.text, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
            value={name}
          />
          <Pressable
            accessibilityRole="button"
            disabled={saving || !name.trim()}
            onPress={() => void submit()}
            style={[styles.createButton, { backgroundColor: theme.accent, opacity: saving || !name.trim() ? 0.5 : 1 }]}>
            <ThemedText style={{ color: '#1b1917' }} type="smallBold">{saving ? t('threads.starting') : t('threads.start')}</ThemedText>
          </Pressable>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  create: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, padding: Spacing.three },
  createButton: { alignItems: 'center', borderRadius: 9, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.four },
  error: { color: '#b91c1c', paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  input: { borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, flex: 1, minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  list: { flexGrow: 1, gap: Spacing.two, padding: Spacing.three },
  row: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', minHeight: 64, padding: Spacing.three },
  rtlRow: { flexDirection: 'row-reverse' },
  rowCopy: { flex: 1, gap: 3 },
  search: { borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, marginHorizontal: Spacing.three, marginTop: Spacing.three, minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  screen: { flex: 1 },
  sourceNotice: { margin: Spacing.three, marginBottom: 0, padding: Spacing.three, borderRadius: 10 },
  tab: { alignItems: 'center', borderBottomWidth: 2, flex: 1, minHeight: TouchTarget, justifyContent: 'center' },
  tabs: { borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row' },
});
