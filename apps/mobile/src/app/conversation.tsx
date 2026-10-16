import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useNetworkState } from 'expo-network';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, View, type FlatListProps, type ListRenderItem } from 'react-native';
import { KeyboardEvents } from 'react-native-keyboard-controller';
import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { useTrackUser } from '@/contexts/track-user-context';
import { Composer } from '@/components/composer';
import { MessageActions } from '@/components/message-actions';
import { PlatformIcon } from '@/components/platform-icon';

import { DateSeparator, ThreadRow, type DetailedMessage, type GroupedThreadItem, resolveMentionIds } from '@/components/thread-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { OptionsSheet, SheetSection, SheetRow } from '@/components/options-sheet';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { sendComposerMessage, type ComposerSubmission, type ComposerSubmissionResult } from '@/lib/attachment-upload';
import { hapticLight, hapticMedium, hapticDestructive } from '@/lib/haptics';
import { idempotencyKey } from '@/lib/idempotency';
import { useTheme } from '@/hooks/use-theme';
import { channelHref, navigationUnavailableCopy } from '@/lib/company-navigation';
import { buildMentionCandidates } from '@/lib/mention-autocomplete';

import { setActivePushContext } from '@/lib/push-presentation';
import { useComposerDraft } from '@/hooks/use-composer-draft';

/** WhatsApp-style grouping gap: a longer pause re-states who is speaking. */
const FIVE_MINUTES = 5 * 60 * 1000;

const reportReasons = ['inaccurate', 'unsafe', 'spam', 'harassment', 'privacy', 'other'] as const;

const reportReasonLabels: Record<(typeof reportReasons)[number], string> = {
  harassment: 'Harassment',
  inaccurate: 'Inaccurate',
  other: 'Something else',
  privacy: 'Privacy',
  spam: 'Spam',
  unsafe: 'Unsafe',
};

type PendingMessage = { id: string; body: string; at: number };

function dateSepLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ConversationScreen() {
  const theme = useTheme();
  const network = useNetworkState();
  const router = useRouter();
  const { trackUserId } = useTrackUser();
  const { groupId, projectId, companyId, membershipId, archive, messageId } = useLocalSearchParams<{ groupId: string; projectId: string; companyId?: string; membershipId?: string; archive?: string; messageId?: string }>();

  const sendMessage = useMutation(api.messages.send);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const claimUploadIntent = useMutation(api.messages.claimUploadIntent);
  const attachFile = useMutation(api.messages.attachFile);
  const markRead = useMutation(api.mobile.markGroupRead);
  const setLastActive = useMutation(api.mobile.setLastActiveContext);
  const setGlobalNotif = useMutation(api.notifications.setGlobalMode);
  const setGroupNotif = useMutation(api.notifications.setGroupMode);
  const createReport = useMutation(api.reports.create);

  const deleteMessage = useMutation(api.messages.remove);

  const gid = groupId as Id<'groups'> | undefined;
  const pid = projectId as Id<'projects'> | undefined;
  const cid = companyId as Id<'companies'> | undefined;
  const pmid = membershipId as Id<'projectMembers'> | undefined;
  const targetMessageId = messageId as Id<'messages'> | undefined;
  useFocusEffect(useCallback(() => {
    if (pid && gid) setActivePushContext({ projectId: pid, groupId: gid });
    return () => setActivePushContext(null);
  }, [gid, pid]));
  const navigation = useQuery(api.mobile.resolveNavigation, trackUserId && pid && gid ? { userId: trackUserId, projectId: pid, groupId: gid, actingCompanyId: cid, projectMemberId: pmid } : 'skip');
  const readOnly = archive === '1' || navigation?.archived === true;
  // Memoised so composing a message does not rebuild every row's identity props.

  const groupsPage = usePaginatedQuery(
    api.mobile.listGroupsPage,
    trackUserId && pid && navigation?.available
      ? { userId: trackUserId, projectId: pid, actingCompanyId: cid, projectMemberId: pmid }
      : 'skip',
    { initialNumItems: 100 },
  );
  const groups = groupsPage.status === 'LoadingFirstPage' ? undefined : groupsPage.results;
  const messagePage = usePaginatedQuery(
    api.messages.listPage,
    trackUserId && gid && navigation?.available
      ? {
          userId: trackUserId,
          groupId: gid,
          actingCompanyId: cid,
          projectMemberId: pmid,
          targetMessageId,
        }
      : 'skip',
    { initialNumItems: 120 },
  );
  const messages = messagePage.status === 'LoadingFirstPage' ? undefined : messagePage.results;
  const notifSettings = useQuery(api.notifications.getSettings, trackUserId ? { userId: trackUserId, projectMemberId: pmid } : 'skip');
  const projectMembersPage = usePaginatedQuery(
    api.mobile.listProjectMembersPage,
    trackUserId && pid && navigation?.available
      ? { userId: trackUserId, projectId: pid, actingCompanyId: cid, projectMemberId: pmid }
      : 'skip',
    { initialNumItems: 100 },
  );
  const projectMembers = projectMembersPage.status === 'LoadingFirstPage'
    ? undefined
    : projectMembersPage.results;

  const listRef = useRef<FlatList<GroupedThreadItem>>(null);
  /** Tracks whether the reader is pinned to the newest message, so arriving messages never yank them off history. */
  const atBottomRef = useRef(true);
  const screenActiveRef = useRef(false);
  const viewedMessageIdRef = useRef<Id<'messages'> | null>(null);
  const acknowledgedMessageIdRef = useRef<Id<'messages'> | null>(null);
  const acknowledgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const sendKey = useRef<string | null>(null);
  const sendSignatureRef = useRef<string | null>(null);
  const [replySelection, setReplySelection] = useState<{ scopeKey: string; message: DetailedMessage } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [groupSwitchOpen, setGroupSwitchOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<GroupedThreadItem | null>(null);
  const [reportReason, setReportReason] = useState<(typeof reportReasons)[number]>('inaccurate');
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<GroupedThreadItem | null>(null);

  const composerDraftScope = useMemo(() => trackUserId && pid && gid ? {
    actorId: trackUserId,
    actingCompanyId: cid,
    projectMemberId: pmid,
    projectId: pid,
    groupId: gid,
  } : null, [cid, gid, pid, pmid, trackUserId]);
  const composerDraft = useComposerDraft(composerDraftScope);
  const composer = composerDraft.draft.composer;
  const setComposer = useCallback((nextComposer: string) => {
    composerDraft.setDraft((current) => current.composer === nextComposer
      ? current
      : { ...current, composer: nextComposer });
  }, [composerDraft]);

  const groupItems = useMemo(() => (groups ?? []) as { group: Doc<'groups'>; membership: Doc<'groupMembers'>; lastMessage: Doc<'messages'> | null; unreadCount: number }[], [groups]);
  const memberItems = useMemo(() => projectMembers ?? [], [projectMembers]);
  const activeGroup = groupItems.find((g) => g.group._id === gid)?.group ?? null;
  const globalMode = notifSettings?.global?.globalMode ?? 'all';
  const groupMode = notifSettings?.groups?.find((g) => g.groupId === gid)?.mode ?? 'inherit';

  const threadItems = useMemo<GroupedThreadItem[]>(() => {
    const msgs = [...((messages ?? []) as DetailedMessage[]).reverse()].map((item) => ({
      kind: 'message' as const, key: item.message._id, at: item.message.createdAt, item, isFirstInGroup: true,
    }));
    const sorted = [...msgs];
    // eslint-disable-next-line unicorn/no-array-sort -- reason: Copy first to preserve immutability while supporting the web ES2022 target.
    sorted.sort((a, b) => a.at - b.at);

    const result: GroupedThreadItem[] = [];
    let lastDateStr = '';
    let lastAuthorKey = '';
    let lastAt = 0;
    /** Anything between two messages — a date pill — starts a new group. */
    let interrupted = true;

    for (const raw of sorted) {
      const dateStr = new Date(raw.at).toDateString();
      if (dateStr !== lastDateStr) {
        result.push({ kind: 'date-sep', key: `sep-${raw.at}`, at: raw.at, label: dateSepLabel(raw.at) });
        lastDateStr = dateStr;
        interrupted = true;
      }

      const authorKey = raw.item.author?._id ?? 'anon';
      const tooLong = raw.at - lastAt > FIVE_MINUTES;
      const isFirstInGroup = interrupted || authorKey !== lastAuthorKey || tooLong;

      result.push({ ...raw, isFirstInGroup });
      lastAuthorKey = authorKey;
      lastAt = raw.at;
      interrupted = false;
    }

    return result;
  }, [messages]);
  const draftReply = useMemo(() => {
    const pendingReplyId = composerDraft.draft.replyToMessageId;
    if (!pendingReplyId) return null;
    const reply = threadItems.find(
      (item) => item.kind === 'message' && item.item.message._id === pendingReplyId,
    );
    return reply?.kind === 'message' ? reply.item : null;
  }, [composerDraft.draft.replyToMessageId, threadItems]);
  const replyTo = replySelection?.scopeKey === composerDraft.scopeKey
    ? replySelection.message
    : draftReply;
  const replyMessageId = replyTo?.message._id;
  const setReplyTo = useCallback((nextReply: DetailedMessage | null) => {
    const replyToMessageId = nextReply?.message._id ?? null;
    composerDraft.setDraft((current) => current.replyToMessageId === replyToMessageId
      ? current
      : { ...current, replyToMessageId });
    setReplySelection(nextReply && composerDraft.scopeKey
      ? { scopeKey: composerDraft.scopeKey, message: nextReply }
      : null);
  }, [composerDraft]);
  // Lets a row jump to its quoted message without rebuilding every row when the thread grows.
  const threadItemsRef = useRef<GroupedThreadItem[]>(threadItems);
  useEffect(() => {
    threadItemsRef.current = threadItems;
  }, [threadItems]);

  const mentionCandidates = useMemo(() => buildMentionCandidates(memberItems), [memberItems]);

  /** The composer grows over the list when the keyboard opens; follow it down. */
  const pinToLatest = useCallback(() => {
    if (!atBottomRef.current) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    const subscriptions = [
      KeyboardEvents.addListener('keyboardWillShow', pinToLatest),
      KeyboardEvents.addListener('keyboardDidShow', pinToLatest),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [pinToLatest]);

  useEffect(() => {
    if (!targetMessageId) return;
    const index = threadItems.findIndex((item) => item.kind === 'message' && item.item.message._id === targetMessageId);
    if (index < 0) return;
    requestAnimationFrame(() => listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 }));
  }, [targetMessageId, threadItems]);

  const hasMoreMessages = messagePage.status === 'CanLoadMore' || messagePage.status === 'LoadingMore';
  const loadingOlderMessages = messagePage.status === 'LoadingMore';
  const loadOlderMessages = useCallback(() => {
    if (!hasMoreMessages || loadingOlderMessages) return;
    messagePage.loadMore(120);
  }, [hasMoreMessages, loadingOlderMessages, messagePage]);

  const messageActions = useMemo(() => {
    if (!actionTarget || actionTarget.kind === 'date-sep') return [];
    return [
      ...(!readOnly ? [{
        label: 'Reply',
        icon: 'arrow-up' as const,
        onPress: () => {
          setReplyTo(actionTarget.item);
        },
      }] : []),
      ...(!readOnly &&
        actionTarget.item.message.authorId === trackUserId &&
        (!pmid || !actionTarget.item.message.authorProjectMemberId ||
          actionTarget.item.message.authorProjectMemberId === pmid) ? [{
        label: 'Delete message',
        icon: 'trash-can-outline' as const,
        destructive: true,
        onPress: () => {
          Alert.alert(
            'Delete message?',
            'This can’t be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  setBusy(`delete-${actionTarget.item.message._id}`);
                  void deleteMessage({
                    messageId: actionTarget.item.message._id,
                    actorId: trackUserId,
                    actingCompanyId: cid,
                    projectMemberId: pmid,
                  }).then(() => {
                    if (replyMessageId === actionTarget.item.message._id) setReplyTo(null);
                  }).catch(() => {
                    Alert.alert('Message not deleted', 'Check your connection and try again.');
                  }).finally(() => setBusy(null));
                },
              },
            ],
          );
        },
      }] : []),
      {
        label: 'Report',
        icon: 'trash-can-outline' as const,
        destructive: true,
        onPress: () => setReportTarget(actionTarget),
      },
    ];
  }, [actionTarget, cid, deleteMessage, pmid, readOnly, replyMessageId, setReplyTo, trackUserId]);

  // Clear pending messages when the real message arrives from the server
  useEffect(() => {
    if (!pendingMessages.length || !messages) return;
    const now = Date.now();
    const recentBodies = new Set(
      (messages as DetailedMessage[])
        .filter((m) => now - m.message.createdAt < 30_000)
        .map((m) => m.message.body),
    );
    setPendingMessages((prev) => prev.filter((p) => !recentBodies.has(p.body)));
  }, [messages, pendingMessages.length]);

  useEffect(() => () => {
    if (acknowledgeTimeoutRef.current) clearTimeout(acknowledgeTimeoutRef.current);
  }, []);

  useFocusEffect(useCallback(() => {
    screenActiveRef.current = true;
    return () => {
      screenActiveRef.current = false;
    };
  }, []));

  useEffect(() => {
    if (!trackUserId || !pid || !gid || !navigation?.available) return;
    void setLastActive({
      userId: trackUserId, projectId: pid, groupId: gid,
      actingCompanyId: cid, projectMemberId: pmid,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    }).catch(() => undefined);
  }, [cid, gid, navigation?.available, pid, pmid, setLastActive, trackUserId]);

  const acknowledgeViewedMessage = useCallback((viewedMessageId: Id<'messages'>) => {
    if (!trackUserId || !gid || !screenActiveRef.current || navigation?.readStateImmutable) return;
    if (viewedMessageId === acknowledgedMessageIdRef.current) return;
    viewedMessageIdRef.current = viewedMessageId;
    if (acknowledgeTimeoutRef.current) return;
    acknowledgeTimeoutRef.current = setTimeout(() => {
      acknowledgeTimeoutRef.current = null;
      const nextMessageId = viewedMessageIdRef.current;
      if (!nextMessageId || !trackUserId || !gid || !screenActiveRef.current || nextMessageId === acknowledgedMessageIdRef.current) return;
      acknowledgedMessageIdRef.current = nextMessageId;
      void markRead({
        userId: trackUserId,
        groupId: gid,
        actingCompanyId: cid,
        projectMemberId: pmid,
        lastReadMessageId: nextMessageId,
      }).catch(() => {
        acknowledgedMessageIdRef.current = null;
      });
    }, 150);
  }, [cid, gid, markRead, navigation?.readStateImmutable, pmid, trackUserId]);

  const onViewableItemsChanged = useCallback<NonNullable<FlatListProps<GroupedThreadItem>['onViewableItemsChanged']>>(({ viewableItems }) => {
    const visibleMessages = viewableItems
      .filter((token) => token.isViewable && token.item.kind === 'message')
      .map((token) => token.item);
    // eslint-disable-next-line unicorn/no-array-sort -- reason: Copy first to preserve immutability while supporting the web ES2022 target.
    visibleMessages.sort((left, right) => left.at - right.at);
    const lastVisible = visibleMessages.at(-1);
    if (lastVisible?.kind === 'message') acknowledgeViewedMessage(lastVisible.item.message._id);
  }, [acknowledgeViewedMessage]);
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 60 }), []);

  async function withBusy(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  }

  async function handleSendMessage(payload: ComposerSubmission): Promise<ComposerSubmissionResult> {
    if (!trackUserId || !pid || !gid) return { failedIds: payload.attachments.map((a) => a.id), messageId: null };
    hapticMedium();
    const body = payload.body.trim();
    const replyToMessageId = replyTo?.message._id;
    const sendSignature = JSON.stringify({
      attachmentIds: payload.attachments.map((attachment) => attachment.id),
      body,
      replyToMessageId: replyToMessageId ?? null,
    });
    if (!sendKey.current || sendSignatureRef.current !== sendSignature) {
      sendKey.current = idempotencyKey();
      sendSignatureRef.current = sendSignature;
    }
    // Only text-only sends get an optimistic row; attachment sends show their own progress.
    const pendingId = body && payload.attachments.length === 0 ? Date.now().toString() : null;
    if (pendingId) setPendingMessages((prev) => [...prev, { id: pendingId, body, at: Date.now() }]);

    setBusy('send');
    try {
      const result = await sendComposerMessage({
        ...payload,
        body,
        idempotencyKey: sendKey.current,
        replyToMessageId,
        target: {
          attachFile: (input) => attachFile({
            projectId: pid, groupId: gid, userId: trackUserId,
            actingCompanyId: cid, projectMemberId: pmid,
            messageId: input.messageId,
            uploadIntentId: input.uploadIntentId,
            storageId: input.storageId,
            filename: input.filename, contentType: input.contentType,
            size: input.size, kind: input.kind, durationMs: input.durationMs,
          }),
          claimUploadIntent: (input) => claimUploadIntent({
            intentId: input.intentId,
            storageId: input.storageId,
            userId: trackUserId,
            actingCompanyId: cid,
            projectMemberId: pmid,
          }),
          generateUploadUrl: (input) => generateUploadUrl({
            ...input,
            groupId: gid,
            userId: trackUserId,
            actingCompanyId: cid,
            projectMemberId: pmid,
          }),
          sendMessage: (input) => sendMessage({
            projectId: pid, groupId: gid, authorId: trackUserId,
            actingCompanyId: cid, projectMemberId: pmid,
            idempotencyKey: input.idempotencyKey,
            body: input.body, mentions: resolveMentionIds(input.body, memberItems),
            replyToMessageId: input.replyToMessageId,
            notificationPreview: input.body,
          }),
        },
      });

      if (result.failedIds.length === 0) {
        sendKey.current = null;
        sendSignatureRef.current = null;
      }
      return result;
    } catch {
      if (pendingId) setPendingMessages((prev) => prev.filter((p) => p.id !== pendingId));
      Alert.alert('Message not sent', 'Check your connection and try again.');
      return { failedIds: payload.attachments.map((a) => a.id), messageId: null };
    } finally {
      setBusy(null);
    }
  }

  async function submitReport() {
    if (!trackUserId || !pid || !reportTarget || reportTarget.kind === 'date-sep') return;
    hapticDestructive();
    await withBusy('report', async () => {
      await createReport({
        projectId: pid, reporterId: trackUserId, groupId: gid,
        actingCompanyId: cid, projectMemberId: pmid,
        targetType: 'message',
        targetMessageId: reportTarget.item.message._id,
        reason: reportReason, note: '',
      });
      setReportTarget(null);
    });
  }

  const renderItem = useCallback<ListRenderItem<GroupedThreadItem>>(({ item }) => {
    if (item.kind === 'date-sep') return <DateSeparator label={item.label} />;
    const isOwnMessage = item.item.author?._id === trackUserId;
    return (
      <View>
        <ThreadRow
          item={item}
          isFirstInGroup={item.isFirstInGroup}
          isOwnMessage={isOwnMessage}
          onLongPress={() => {
            hapticLight();
            setActionTarget(item);
            setActionSheetOpen(true);
          }}
          onSwipeReply={readOnly ? undefined : () => {
            hapticLight();
            setReplyTo(item.item);
          }}

          onPressReply={item.item.replyTo ? () => {
            const quotedId = item.item.replyTo?.messageId;
            if (!quotedId) return;
            const index = threadItemsRef.current.findIndex((entry) => entry.kind === 'message' && entry.item.message._id === quotedId);
            if (index >= 0) listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 });
            else router.setParams({ messageId: quotedId });
          } : undefined}
        />

      </View>
    );
  }, [readOnly, router, setReplyTo, trackUserId]);

  if (navigation && !navigation.available) return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Channel unavailable' }} /><View style={styles.empty}><ThemedText type="subtitle">Channel unavailable</ThemedText><ThemedText style={{ color: theme.textSecondary }}>{navigationUnavailableCopy(Boolean(cid))}</ThemedText></View></ThemedView>;
  if ((network.isConnected === false || network.isInternetReachable === false) && messages === undefined) return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Channel unavailable' }} /><View style={styles.empty}><ThemedText type="subtitle">Offline</ThemedText><ThemedText style={{ color: theme.textSecondary }}>This Channel is not available on the device yet.</ThemedText><Pressable accessibilityRole="button" onPress={() => pid && gid && router.replace(channelHref(pid, gid, cid && pmid ? { archived: readOnly, companyId: cid, membershipId: pmid } : null))} style={[styles.retry, { backgroundColor: theme.accent }]}><ThemedText style={{ color: Colors.light.text }} type="smallBold">Retry</ThemedText></Pressable></View></ThemedView>;
  if (navigation === undefined || (navigation.available && messages === undefined)) return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Conversation' }} /><View style={styles.empty}><ThemedText style={{ color: theme.textSecondary }} type="small">Opening authorized conversation…</ThemedText></View></ThemedView>;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen
        options={{
          headerTransparent: Platform.OS === 'ios',
          headerBlurEffect: 'systemMaterial',
          headerTitle: () => (
            <Pressable
              hitSlop={8}
              onPress={() => { hapticLight(); setGroupSwitchOpen(true); }}
              style={styles.headerTitle}>
              <ThemedText numberOfLines={1} type="smallBold">{activeGroup?.name ?? 'Conversation'}</ThemedText>
              <PlatformIcon color={theme.textSecondary} name="chevron-down" size={16} />
            </Pressable>
          ),
          headerRight: () => !readOnly ? (
            <Pressable
              accessibilityLabel="Notifications"
              android_ripple={{ color: theme.backgroundSelected, borderless: true }}
              hitSlop={8}
              onPress={() => { hapticLight(); setToolsOpen(true); }}
              style={styles.headerButton}>
              <PlatformIcon color={theme.text} name="dots-horizontal" size={22} />
            </Pressable>
          ) : null,
        }}
      />

      <View style={styles.flex}>

      <FlatList
          ref={listRef}
          contentContainerStyle={styles.thread}
          contentInsetAdjustmentBehavior="automatic"
          data={threadItems}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
          onScrollToIndexFailed={({ index }) => requestAnimationFrame(() => listRef.current?.scrollToIndex({ animated: false, index, viewPosition: 0.5 }))}
          initialNumToRender={24}
          keyExtractor={(item) => item.key}
          maxToRenderPerBatch={16}
          onScroll={({ nativeEvent }) => {
            const distanceFromBottom = nativeEvent.contentSize.height - nativeEvent.contentOffset.y - nativeEvent.layoutMeasurement.height;
            atBottomRef.current = distanceFromBottom < 80;
            setShowJumpToLatest(distanceFromBottom > 320);
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (!targetMessageId && atBottomRef.current) listRef.current?.scrollToEnd({ animated: true });
          }}
          removeClippedSubviews={false}
          renderItem={renderItem}
          viewabilityConfig={viewabilityConfig}
          style={styles.flex}
          windowSize={9}
          ListEmptyComponent={
            messages !== undefined ? (
              <View style={styles.empty}>
                <ThemedText style={{ color: theme.textSecondary }} type="small">Start the conversation</ThemedText>
              </View>
            ) : null
          }
          ListHeaderComponent={hasMoreMessages ? (
            <Pressable
              accessibilityRole="button"
              disabled={loadingOlderMessages}
              onPress={loadOlderMessages}
              style={styles.loadMore}
            >
              <ThemedText type="smallBold">{loadingOlderMessages ? 'Loading older messages…' : 'Load older messages'}</ThemedText>
            </Pressable>
          ) : null}
          ListFooterComponent={
            pendingMessages.length > 0 ? (
              <View>
                {pendingMessages.map((m) => (
                  <View key={m.id} style={styles.pendingRow}>
                    <View style={styles.pendingAvatarSpacer} />
                    <View style={styles.pendingBody}>
                      <PlatformIcon color={theme.textSecondary} name="clock-outline" size={12} />
                      <ThemedText style={styles.pendingText} type="small">{m.body}</ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            ) : null
          }
        />

      {showJumpToLatest ? (
        <Pressable
          accessibilityLabel="Jump to latest messages"
          accessibilityRole="button"
          onPress={() => {
            hapticLight();
            atBottomRef.current = true;
            setShowJumpToLatest(false);
            listRef.current?.scrollToEnd({ animated: true });
          }}
          style={[styles.jumpToLatest, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
          <PlatformIcon color={theme.text} name="chevron-down" size={22} />
        </Pressable>
      ) : null}
      </View>

      {readOnly ? <View style={[styles.archiveBanner, { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold">Read-only Company exit archive</ThemedText><ThemedText style={{ color: theme.textSecondary }} type="small">Messages stop at the Company exit cutoff.</ThemedText></View> : <Composer
        activeGroupName={activeGroup?.name ?? null}
        busy={busy === 'send'}
        mentionCandidatesHasMore={projectMembersPage.status === 'CanLoadMore'}
        mentionCandidatesLoading={projectMembersPage.status === 'LoadingMore'}
        mentionCandidates={mentionCandidates}
        onCancelReply={() => setReplyTo(null)}
        onChangeText={setComposer}
        onFocus={() => {
          atBottomRef.current = true;
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
        }}
        onLoadMoreMentionCandidates={() => {
          if (projectMembersPage.status === 'CanLoadMore') projectMembersPage.loadMore(100);
        }}
        onSendMessage={handleSendMessage}
        replyTo={replyTo}
        value={composer}
      />}

      <OptionsSheet onClose={() => setGroupSwitchOpen(false)} title="Switch Channel" visible={groupSwitchOpen}>
        <SheetSection>
          {groupItems.map((item) => (
            <SheetRow
              key={item.group._id}
              label={item.group.name}
              selected={item.group._id === gid}
              onPress={() => {
                setGroupSwitchOpen(false);
                hapticLight();
                router.replace(channelHref(pid!, item.group._id, cid && pmid ? { archived: readOnly, companyId: cid, membershipId: pmid } : null) as never);
              }}
            />
          ))}
          {groupsPage.status === 'CanLoadMore' || groupsPage.status === 'LoadingMore' ? (
            <SheetRow
              label={groupsPage.status === 'LoadingMore' ? 'Loading more Channels…' : 'Load more Channels'}
              onPress={groupsPage.status === 'CanLoadMore' ? () => groupsPage.loadMore(100) : undefined}
            />
          ) : null}
        </SheetSection>
      </OptionsSheet>

      <OptionsSheet onClose={() => setToolsOpen(false)} title="Notifications" visible={toolsOpen}>
        <SheetSection>
          <SheetRow
            icon="bell-outline"
            label="Manage notification settings"
            onPress={() => {
              setToolsOpen(false);
              router.push('/notifications');
            }}
          />
        </SheetSection>

        <SheetSection title="Global">
          {(['all', 'mentions', 'none'] as const).map((mode) => (
            <SheetRow
              key={mode}
              label={mode === 'all' ? 'All messages' : mode === 'mentions' ? 'Mentions only' : 'Off'}
              selected={globalMode === mode}
              onPress={() => trackUserId && void setGlobalNotif({ userId: trackUserId, mode })}
            />
          ))}
        </SheetSection>
        <SheetSection title="This Channel">
          {(['inherit', 'all', 'mentions', 'none'] as const).map((mode) => (
            <SheetRow
              key={mode}
              label={mode === 'inherit' ? 'Follow global' : mode === 'all' ? 'All messages' : mode === 'mentions' ? 'Mentions only' : 'Off'}
              selected={groupMode === mode}
              onPress={() => trackUserId && gid && void setGroupNotif({ userId: trackUserId, groupId: gid, actingCompanyId: cid, projectMemberId: pmid, mode })}
            />
          ))}
        </SheetSection>
      </OptionsSheet>

      <OptionsSheet onClose={() => setReportTarget(null)} title="Report" visible={Boolean(reportTarget)}>
        <SheetSection title="Reason">
          <View style={styles.reasonGrid}>
            {reportReasons.map((r) => (
              <Pressable
                key={r}
                onPress={() => setReportReason(r)}
                style={[styles.reasonChip, { backgroundColor: reportReason === r ? theme.backgroundSelected : theme.backgroundElement }]}>
                <ThemedText type="small">{reportReasonLabels[r]}</ThemedText>
              </Pressable>
            ))}
          </View>
        </SheetSection>
        <Pressable
          disabled={busy === 'report'}
          onPress={() => void submitReport()}
          style={[styles.reportButton, { backgroundColor: busy === 'report' ? theme.hairline : theme.danger }]}>
          <ThemedText style={{ color: theme.background }} type="smallBold">Submit report</ThemedText>
        </Pressable>
      </OptionsSheet>

      <MessageActions
        visible={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        actions={messageActions}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  archiveBanner: { gap: Spacing.one, padding: Spacing.three },
  empty: { alignItems: 'center', padding: Spacing.six },
  flex: { flex: 1 },
  jumpToLatest: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: Spacing.three,
    elevation: 3,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: Spacing.three,
    width: 40,
  },
  loadMore: { alignItems: 'center', minHeight: TouchTarget, justifyContent: 'center', padding: Spacing.two },
  headerButton: { alignItems: 'center', height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  headerTitle: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  pendingAvatarSpacer: { width: 36 },
  pendingBody: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: Spacing.two, minWidth: 0, opacity: 0.6 },
  pendingRow: { flexDirection: 'row', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 2 },
  pendingText: { flex: 1 },
  reasonChip: { borderRadius: 8, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, padding: Spacing.three },
  retry: { alignItems: 'center', borderRadius: 9, justifyContent: 'center', minHeight: TouchTarget, marginTop: Spacing.three, paddingHorizontal: Spacing.four },
  reportButton: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', minHeight: 46, paddingHorizontal: Spacing.four },
  screen: { flex: 1 },
  thread: { paddingBottom: Spacing.two, paddingTop: Spacing.two },
});
