import { useMutation, usePaginatedQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { ActionButton } from '@/components/action-button';
import { useAppToast } from '@/components/app-toast';
import { ConnectivityBanner } from '@/components/connectivity-banner';
import { CompactPillButton } from '@/components/compact-pill-button';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { OptionsSheet, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { ScreenLoading } from '@/components/screen-loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { useTrackUser } from '@/contexts/track-user-context';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight } from '@/lib/haptics';
import { channelHref, type RepresentedProjectContext } from '@/lib/company-navigation';
import { uniqueAttentionIdentities } from '@/lib/mobile-attention';
import { taskDetailHref, taskListHref, type MobileTaskIdentity } from '@/lib/task-navigation';
import { threadConversationHref } from '@/lib/thread-navigation';
import { sortInboxItems } from '@/lib/inbox-feed';
import { MaxFontScale, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useBottomTabContentInset } from '@/hooks/use-bottom-tab-inset';

type AttentionItem = {
  kind: 'task';
  id: Id<'taskNotifications'>;
  projectId: Id<'projects'>;
  projectName: string;
  companyName?: string;
  taskKey: string;
  taskTitle: string;
  eventType: string;
  createdAt: number;
  companyId?: Id<'companies'>;
  membershipId: Id<'projectMembers'>;
  taskId: Id<'tasks'>;
} | {
  kind: 'message';
  id: Id<'messages'>;
  projectId: Id<'projects'>;
  projectName: string;
  companyName?: string;
  groupId: Id<'groups'>;
  groupName: string;
  messageId: Id<'messages'>;
  threadId?: Id<'channelThreads'>;
  threadName?: string;
  senderName: string;
  preview: string;
  eventType: string;
  createdAt: number;
  companyId?: Id<'companies'>;
  membershipId: Id<'projectMembers'>;
} | {
  kind: 'suggestion';
  id: Id<'taskSuggestions'>;
  suggestionId: Id<'taskSuggestions'>;
  projectId: Id<'projects'>;
  projectName: string;
  companyName?: string;
  title: string;
  preview: string;
  eventType: 'task_suggestion';
  createdAt: number;
  companyId?: Id<'companies'>;
  membershipId: Id<'projectMembers'>;
} | {
  kind: 'invitation';
  id: Id<'companyInvitations'>;
  invitationId: Id<'companyInvitations'>;
  companyId: Id<'companies'>;
  projectName: string;
  companyName?: string;
  title: string;
  preview: string;
  eventType: 'company_invitation';
  createdAt: number;
};

type AttentionFilter = 'all' | 'mentions' | 'replies' | 'tasks' | 'suggestions' | 'invitations';

const emptyCopy: Record<AttentionFilter, { body: string; title: string }> = {
  all: { title: "You're clear", body: 'New assignments, mentions, replies, suggestions, and invitations will appear here.' },
  invitations: { title: 'No invitations', body: 'New company invitations will appear here.' },
  mentions: { title: 'No mentions', body: 'Messages that mention you will appear here.' },
  replies: { title: 'No replies', body: 'Replies to your messages and threads will appear here.' },
  suggestions: { title: 'No suggestions', body: 'Grounded task suggestions from your conversations will appear here.' },
  tasks: { title: 'No task updates', body: 'Assignments, due work, and task mentions will appear here.' },
};

function eventCopy(eventType: string) {
  switch (eventType) {
    case 'assignment': return 'You were assigned this task';
    case 'assignment_lost': return 'You are no longer assigned this task';
    case 'mention': return 'You were mentioned on this task';
    case 'due_soon': return 'This task is due soon';
    case 'overdue': return 'This task is overdue';
    case 'urgent_update': return 'Urgent task update';
    case 'task_suggestion': return 'Review grounded task suggestion';
    case 'company_invitation': return 'Company invitation';
    default: return 'This task needs your attention';
  }
}

function relativeTime(createdAt: number) {
  const minutes = Math.max(1, Math.floor((Date.now() - createdAt) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function dayLabel(createdAt: number, now = new Date()) {
  const date = new Date(createdAt);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDifference = Math.round((startToday - startDate) / 86_400_000);
  if (dayDifference === 0) return 'Today';
  if (dayDifference === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export default function InboxScreen() {
  const { showToast } = useAppToast();
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const bottomContentInset = useBottomTabContentInset();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string; invitationId?: string }>();
  const { trackUserId } = useTrackUser();
  const itemPages = usePaginatedQuery(api.mobile.listAttention, trackUserId
    ? { userId: trackUserId }
    : 'skip', { initialNumItems: 10 });
  const items = itemPages.results as AttentionItem[];
  const { loadMore: loadMoreItems, status: itemStatus } = itemPages;
  const decideInvitation = useMutation(api.companies.decideInvitation);
  const markTaskRead = useMutation(api.taskNotifications.markTaskRead);
  const [filter, setFilter] = useState<AttentionFilter>(params.filter === 'invitations' ? 'invitations' : 'all');
  const [search, setSearch] = useState('');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [invitationBusy, setInvitationBusy] = useState<string | null>(null);
  const visibleItems = useMemo(() => {
    const filtered = uniqueAttentionIdentities(items).filter((item) => {
      return filter === 'all'
        || (filter === 'tasks' && item.kind === 'task')
        || (filter === 'mentions' && item.kind === 'message' && item.eventType === 'mention')
        || (filter === 'replies' && item.kind === 'message' && item.eventType === 'direct_reply')
        || (filter === 'suggestions' && item.kind === 'suggestion')
        || (filter === 'invitations' && item.kind === 'invitation');
      });
    const query = search.trim().toLocaleLowerCase();
    const searched = query ? filtered.filter((item) => {
      const searchable = item.kind === 'task'
        ? `${item.taskTitle} ${item.projectName} ${item.companyName ?? ''} ${eventCopy(item.eventType)}`
        : item.kind === 'message'
          ? `${item.senderName} ${item.preview} ${item.projectName} ${item.groupName} ${item.threadName ?? ''} ${item.companyName ?? ''}`
          : `${item.title} ${item.preview} ${item.projectName} ${item.companyName ?? ''}`;
      return searchable.toLocaleLowerCase().includes(query);
    }) : filtered;
    return sortInboxItems(searched, (item) => item.kind === 'invitation' && item.invitationId === params.invitationId);
  }, [filter, items, params.invitationId, search]);

  function openItem(item: AttentionItem) {
    hapticLight();
    if (item.kind === 'task') {
      void markTaskRead({
        taskId: item.taskId,
        actingCompanyId: item.companyId,
        projectMemberId: item.companyId ? item.membershipId : undefined,
      }).catch(() => undefined);
    }
    const identity: MobileTaskIdentity | null = item.companyId && item.kind !== 'invitation'
      ? { companyId: item.companyId, membershipId: item.membershipId }
      : null;
    const context: RepresentedProjectContext | null = item.companyId && item.kind !== 'invitation'
      ? { companyId: item.companyId, membershipId: item.membershipId, archived: false }
      : null;
    if (item.kind === 'task') {
      router.push(taskDetailHref(item.projectId, item.taskKey, identity, {
        companyId: item.companyId,
        id: item.id,
        membershipId: item.membershipId,
      }));
      return;
    }
    if (item.kind === 'suggestion') {
      router.push(taskListHref(item.projectId, identity, 'inbox', item.suggestionId));
      return;
    }
    if (item.kind === 'invitation') {
      router.push('/company');
      return;
    }
    if (item.threadId) {
      router.push(threadConversationHref(item.projectId, item.groupId, item.threadId, context, item.messageId) as never);
      return;
    }
    router.push(channelHref(item.projectId, item.groupId, context, item.messageId) as never);
  }

  return (
    <ThemedView style={[styles.screen, { paddingTop: safeAreaInsets.top, paddingLeft: safeAreaInsets.left, paddingRight: safeAreaInsets.right }]}>
      <Stack.Screen options={{
        title: 'Inbox',
        headerShown: false,
      }} />
      <ConnectivityBanner style={styles.connection} />
      {itemStatus === 'LoadingFirstPage' ? <ScreenLoading variant="inbox" /> : (
        <FlatList
          style={styles.screenContent}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[styles.list, { paddingBottom: bottomContentInset }]}
          data={visibleItems}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          renderItem={({ index, item }) => {
            const section = dayLabel(item.createdAt);
            const previousSection = index > 0 && visibleItems
              ? dayLabel(visibleItems[index - 1].createdAt)
              : null;
            return (
              <View style={styles.daySection}>
                {section !== previousSection ? (
                  <ThemedText accessibilityRole="header" style={styles.dayHeading} themeColor="textSecondary" type="captionBold">
                    {section}
                  </ThemedText>
                ) : null}
                <AttentionRow
                  invitationBusy={invitationBusy}
                  item={item}
                  onInvitationDecision={(invitationId, decision) => {
                    setInvitationBusy(`${invitationId}:${decision}`);
                    void decideInvitation({ invitationId, decision })
                      .then((result) => {
                        if (typeof result === 'object' && result !== null && 'status' in result && result.status === 'expired') {
                          throw new Error('invitation_expired');
                        }
                        showToast({ title: decision === 'accept' ? 'Company joined' : 'Invitation declined', tone: 'success' });
                      })
                      .catch(() => showToast({ title: 'Invitation unavailable', message: 'It expired or your access changed.', tone: 'error' }))
                      .finally(() => setInvitationBusy(null));
                  }}
                  onPress={() => openItem(item)}
                />
              </View>
            );
          }}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.intro}>
                <View style={styles.titleLine}>
                  <ThemedText accessibilityRole="header" numberOfLines={1} style={styles.title} type="display">Inbox</ThemedText>
                  <View style={styles.headerActions}>
                    <View accessibilityLabel={`${visibleItems.length}${itemStatus === 'CanLoadMore' ? ' or more' : ''} new updates`} accessible style={[styles.updateCount, { backgroundColor: theme.backgroundElement }]}>
                      <ThemedText themeColor="textSecondary" type="captionBold">{visibleItems.length}{itemStatus === 'CanLoadMore' ? '+' : ''} new</ThemedText>
                    </View>
                    <IconButton accessibilityLabel="Notification settings" icon="bell-outline" onPress={() => router.push('/notifications')} />
                  </View>
                </View>
                <ThemedText themeColor="textSecondary" type="small">Updates across your work</ThemedText>
              </View>
              <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder }]}>
                <PlatformIcon color={theme.textTertiary} name="search" size={19} />
                <ThemedTextInput accessibilityLabel="Search inbox" autoCapitalize="none" autoCorrect={false} keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'} maxLength={120} maxFontSizeMultiplier={MaxFontScale} onChangeText={setSearch} placeholder="Search updates" placeholderTextColor={theme.textTertiary} returnKeyType="search" style={[styles.searchInput, { color: theme.text }]} value={search} />
                {search ? <Pressable accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => setSearch('')} style={styles.clearSearch}><PlatformIcon color={theme.textSecondary} name="close" size={18} /></Pressable> : null}
              </View>
              <ScrollView accessibilityLabel="Inbox filters" accessibilityRole="tablist" contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
                {(['all', 'mentions', 'replies', 'tasks'] as const).map((value) => (
                  <CompactPillButton
                    accessibilityRole="tab"
                    accessibilityState={{ selected: filter === value }}
                    accessibilityLabel={value === 'all' ? 'All' : value === 'mentions' ? 'Mentions' : value === 'replies' ? 'Replies' : 'Tasks'}
                    key={value}
                    onPress={() => setFilter(value)}
                    pillStyle={{
                      backgroundColor: filter === value ? theme.accentSoft : theme.homeSurface,
                      borderColor: filter === value ? 'transparent' : theme.homeBorder,
                    }}
                    pressedPillStyle={{ backgroundColor: theme.homeBackground, borderColor: 'transparent' }}
                  >
                    <ThemedText style={{ color: filter === value ? theme.text : theme.textSecondary }} type="captionBold">{value === 'all' ? 'All' : value === 'mentions' ? 'Mentions' : value === 'replies' ? 'Replies' : 'Tasks'}</ThemedText>
                  </CompactPillButton>
                ))}
                <CompactPillButton
                  accessibilityLabel="More Inbox filters"
                  accessibilityRole="button"
                  onPress={() => setFilterSheetOpen(true)}
                  pillStyle={{
                    backgroundColor: filter === 'suggestions' || filter === 'invitations' ? theme.accentSoft : theme.homeSurface,
                    borderColor: filter === 'suggestions' || filter === 'invitations' ? 'transparent' : theme.homeBorder,
                  }}
                  pressedPillStyle={{ backgroundColor: theme.homeBackground, borderColor: 'transparent' }}
                >
                  <ThemedText style={{ color: filter === 'suggestions' || filter === 'invitations' ? theme.text : theme.textSecondary }} type="captionBold">{filter === 'suggestions' ? 'Suggestions' : filter === 'invitations' ? 'Invitations' : 'More'}</ThemedText>
                </CompactPillButton>
              </ScrollView>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon={search ? 'search' : 'check-circle'}
              title={search ? 'No matching updates' : emptyCopy[filter].title}
              body={search ? 'Try a different name, Project, Channel, or update.' : emptyCopy[filter].body}
            />
          }
          ListFooterComponent={itemStatus === 'LoadingMore' ? <View style={styles.footer}><ActivityIndicator color={theme.accentStrong} /></View> : null}
          onEndReached={() => { if (itemStatus === 'CanLoadMore') loadMoreItems(10); }}
          onEndReachedThreshold={0.6}
        />
      )}
      <OptionsSheet onClose={() => setFilterSheetOpen(false)} title="Filter Inbox" visible={filterSheetOpen}>
        <SheetSection title="Show">
          {([
            ['all', 'All attention', 'inbox'],
            ['mentions', 'Mentions', 'message'],
            ['replies', 'Direct replies', 'reply'],
            ['tasks', 'Task updates', 'task'],
            ['suggestions', 'Task suggestions', 'lightbulb-outline'],
            ['invitations', 'Invitations', 'account-group'],
          ] as const).map(([key, label, icon]) => (
            <SheetRow
              icon={icon}
              key={key}
              label={label}
              selected={filter === key}
              onPress={() => { setFilter(key); setFilterSheetOpen(false); }}
            />
          ))}
        </SheetSection>
      </OptionsSheet>
    </ThemedView>
  );
}

function AttentionRow({ invitationBusy, item, onInvitationDecision, onPress }: {
  invitationBusy: string | null;
  item: AttentionItem;
  onInvitationDecision: (invitationId: Id<'companyInvitations'>, decision: 'accept' | 'decline') => void;
  onPress: () => void;
}) {
  const theme = useTheme();
  const invitationBusyForItem = Boolean(item.kind === 'invitation'
    && invitationBusy?.startsWith(`${item.invitationId}:`));
  if (item.kind !== 'invitation') {
    const notificationTone = item.kind === 'message'
      ? item.eventType === 'mention'
        ? { background: theme.workflowBacklogSoft, foreground: theme.workflowBacklog }
        : { background: theme.backgroundElement, foreground: theme.info }
      : item.kind === 'suggestion'
        ? { background: theme.accentSoft, foreground: theme.accentStrong }
        : item.eventType === 'overdue'
          ? { background: theme.dangerSoft, foreground: theme.danger }
          : { background: theme.backgroundElement, foreground: theme.textSecondary };
    const title = item.kind === 'task' ? item.taskTitle : item.kind === 'message'
      ? `${item.senderName} ${item.eventType === 'mention' ? 'mentioned you' : item.eventType === 'direct_reply' ? 'replied to you' : item.eventType === 'thread_activity' ? 'updated a thread' : 'posted a message'}`
      : item.title;
    const preview = item.kind === 'task' ? eventCopy(item.eventType) : item.preview;
    const state = item.kind === 'task'
      ? eventCopy(item.eventType)
      : item.kind === 'message'
        ? item.eventType === 'mention' ? 'Mention' : item.eventType === 'direct_reply' ? 'Reply' : 'Unread'
        : 'Suggestion';
    const context = [
      item.companyName,
      item.projectName,
      item.kind === 'task' ? null : item.kind === 'message' ? `#${item.groupName}` : 'Suggestion',
    ].filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index).join(' · ');
    const threadId = item.kind === 'message' ? item.threadId : undefined;
    const sourceLabel = item.kind === 'message' ? threadId ? 'Thread' : 'Channel' : null;
    return (
      <Pressable
        accessibilityHint={item.kind === 'message' ? item.threadId ? 'Opens the conversation thread' : 'Opens the Channel message' : 'Opens the attention item'}
        accessibilityLabel={`${title}. ${context}. ${sourceLabel ? `${sourceLabel}. ` : ''}${state}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.activityRow, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent', borderBottomColor: theme.hairline }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: notificationTone.background }]}>
          <PlatformIcon color={notificationTone.foreground} name={item.kind === 'task' ? 'task' : item.kind === 'message' ? 'message' : 'lightbulb-outline'} size={20} />
        </View>
        <View style={styles.activityCopy}>
          <View style={styles.activityTitleLine}>
            <ThemedText numberOfLines={1} style={styles.activityTitle} type="smallBold">{title}</ThemedText>
            <View style={[styles.unreadDot, { backgroundColor: theme.accentStrong }]} />
            <ThemedText themeColor="textTertiary" type="caption">{relativeTime(item.createdAt)}</ThemedText>
          </View>
          <ThemedText numberOfLines={2} themeColor="textSecondary" type="caption">{preview}</ThemedText>
          <ThemedText themeColor="textSecondary" type="caption">{context}</ThemedText>
        </View>
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}: ${item.preview}`}
        android_ripple={{ color: theme.backgroundSelected }}
        onPress={onPress}
        style={({ pressed }) => [styles.cardPressable, pressed && { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
          <PlatformIcon color={theme.accentStrong} name="office-building" size={20} />
        </View>
        <View style={styles.body}>
          <View style={styles.metaRow}>
            <ThemedText themeColor="textSecondary" type="captionBold" style={styles.project}>
              {[item.companyName, item.projectName, 'Invitation'].filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index).join(' · ')}
            </ThemedText>
            <ThemedText themeColor="textTertiary" type="caption">{relativeTime(item.createdAt)}</ThemedText>
          </View>
          <ThemedText numberOfLines={2} type="title">{item.title}</ThemedText>
          <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">
            {item.preview}
          </ThemedText>
        </View>
        <PlatformIcon color={theme.textTertiary} name="chevron-right" size={18} />
      </Pressable>
      <View style={styles.invitationActions}>
          <ActionButton
            disabled={invitationBusyForItem}
            label="Decline"
            loading={invitationBusy === `${item.invitationId}:decline`}
            onPress={() => onInvitationDecision(item.invitationId, 'decline')}
            style={styles.invitationButton}
            variant="secondary"
          />
          <ActionButton
            disabled={invitationBusyForItem}
            label="Accept"
            loading={invitationBusy === `${item.invitationId}:accept`}
            onPress={() => onInvitationDecision(item.invitationId, 'accept')}
            style={styles.invitationButton}
          />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activityCopy: { flex: 1, gap: 3, minWidth: 0 },
  activityRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.three, minHeight: 88, paddingVertical: Spacing.three },
  activityTitle: { flex: 1 },
  activityTitleLine: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  connection: { marginHorizontal: Spacing.four, marginTop: Spacing.two },
  dayHeading: { marginBottom: Spacing.one, marginTop: Spacing.two },
  daySection: { gap: Spacing.one },
  body: { flex: 1, gap: 2, minWidth: 0 },
  card: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardPressable: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minHeight: 76, padding: Spacing.three },
  filters: { flexDirection: 'row', gap: Spacing.one, paddingRight: Spacing.two },
  footer: { alignItems: 'center', minHeight: TouchTarget, paddingVertical: Spacing.two },
  header: { gap: Spacing.three, paddingBottom: Spacing.two },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  iconWrap: { alignItems: 'center', borderRadius: Radius.medium, height: 40, justifyContent: 'center', width: 40 },
  invitationActions: { borderTopColor: 'rgba(128,128,128,0.18)', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.one, justifyContent: 'flex-end', padding: Spacing.two },
  invitationButton: { flex: 1, paddingHorizontal: Spacing.three },
  intro: { gap: Spacing.one, paddingBottom: Spacing.two },
  list: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  project: { flex: 1 },
  rowDetails: { gap: Spacing.one, minWidth: 0 },
  rowStatusMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, justifyContent: 'space-between' },
  screen: { flex: 1 },
  screenContent: { flex: 1 },
  search: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, paddingLeft: Spacing.three },
  searchInput: { ...Typography.body, flex: 1, minHeight: TouchTarget, paddingVertical: Spacing.two },
  clearSearch: { alignItems: 'center', height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  sourceMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, minWidth: 0 },
  sourcePill: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexShrink: 0, gap: 4, minHeight: 24, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  title: { flex: 1, minWidth: 0 },
  titleLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'space-between', width: '100%' },
  unreadDot: { borderRadius: Radius.pill, height: 7, width: 7 },
  updateCount: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, justifyContent: 'center', minHeight: 30, paddingHorizontal: Spacing.two },
});
