import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useNetworkState } from 'expo-network';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, View, type FlatListProps, type ListRenderItem } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { Composer } from '@/components/composer';
import { EmptyState } from '@/components/empty-state';
import { MessageActions } from '@/components/message-actions';
import { OptionsSheet, SheetInput, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';

import { ThreadRow, type DetailedMessage, type GroupedThreadItem, resolveMentionIds, resolveMentionProjectMemberIds } from '@/components/thread-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, TouchTarget } from '@/constants/theme';
import { useTrackUser } from '@/contexts/track-user-context';
import { useTheme } from '@/hooks/use-theme';
import { channelHref, navigationUnavailableCopy } from '@/lib/company-navigation';
import { sendComposerMessage, type ComposerSubmission, type ComposerSubmissionResult } from '@/lib/attachment-upload';
import { hapticLight } from '@/lib/haptics';
import { idempotencyKey } from '@/lib/idempotency';
import { buildMentionCandidates } from '@/lib/mention-autocomplete';
import { useReleaseConfig } from '@/lib/release-config';

import { threadConversationHref } from '@/lib/thread-navigation';
import { setActivePushContext } from '@/lib/push-presentation';
import { useComposerDraft } from '@/hooks/use-composer-draft';


export default function ThreadScreen() {
  const theme = useTheme();
  const router = useRouter();
  const network = useNetworkState();
  const releaseConfig = useReleaseConfig();
  const { trackUserId } = useTrackUser();
  const { groupId, projectId, threadId, companyId, membershipId, archive, messageId } = useLocalSearchParams<{
    groupId: string;
    projectId: string;
    threadId: string;
    companyId?: string;
    membershipId?: string;
    archive?: string;
    messageId?: string;
  }>();
  const gid = groupId as Id<'groups'> | undefined;
  const pid = projectId as Id<'projects'> | undefined;
  const tid = threadId as Id<'channelThreads'> | undefined;
  const targetMessageId = messageId as Id<'messages'> | undefined;
  const cid = companyId as Id<'companies'> | undefined;
  const pmid = membershipId as Id<'projectMembers'> | undefined;
  useFocusEffect(useCallback(() => {
    if (pid && gid && tid) setActivePushContext({ projectId: pid, groupId: gid, threadId: tid });
    return () => setActivePushContext(null);
  }, [gid, pid, tid]));
  const context = cid && pmid ? { companyId: cid, membershipId: pmid, archived: archive === '1' } : null;
  const navigation = useQuery(api.mobile.resolveNavigation, releaseConfig.threads && trackUserId && pid && gid
    ? { userId: trackUserId, projectId: pid, groupId: gid, actingCompanyId: cid, projectMemberId: pmid }
    : 'skip');
  const queryArgs = useMemo(() => trackUserId && tid && navigation?.available
    ? { userId: trackUserId, threadId: tid, actingCompanyId: cid, projectMemberId: pmid }
    : null, [cid, navigation?.available, pmid, tid, trackUserId]);
  const thread = useQuery(api.channelThreads.get, queryArgs ?? 'skip');
  const { results: messages, status: messagePageStatus, loadMore: loadMoreMessages } = usePaginatedQuery(
    api.channelThreads.listMessagePage,
    queryArgs ? { ...queryArgs, targetMessageId } : 'skip',
    { initialNumItems: 50 },
  );
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
  const sendMessage = useMutation(api.messages.send);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const claimUploadIntent = useMutation(api.messages.claimUploadIntent);
  const attachFile = useMutation(api.messages.attachFile);
  const markRead = useMutation(api.channelThreads.markRead);
  const setFollowing = useMutation(api.channelThreads.setFollowing);
  const setStatus = useMutation(api.channelThreads.setStatus);
  const rename = useMutation(api.channelThreads.rename);
  const createReport = useMutation(api.reports.create);

  const deleteMessage = useMutation(api.messages.remove);
  const sendSignatureRef = useRef<string | null>(null);
  const [replySelection, setReplySelection] = useState<{ scopeKey: string; message: DetailedMessage } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [actionTarget, setActionTarget] = useState<GroupedThreadItem | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const hasMoreThreadItems = messagePageStatus === 'CanLoadMore' || messagePageStatus === 'LoadingMore';
  const composerDraftScope = useMemo(() => trackUserId && pid && gid && tid ? {
    actorId: trackUserId,
    actingCompanyId: cid,
    projectMemberId: pmid,
    projectId: pid,
    groupId: gid,
    threadId: tid,
  } : null, [cid, gid, pid, pmid, tid, trackUserId]);
  const composerDraft = useComposerDraft(composerDraftScope);
  const composer = composerDraft.draft.composer;
  const setComposer = useCallback((nextComposer: string) => {
    composerDraft.setDraft((current) => current.composer === nextComposer
      ? current
      : { ...current, composer: nextComposer });
  }, [composerDraft]);
  const sendKey = useRef<string | null>(null);
  const listRef = useRef<FlatList<GroupedThreadItem>>(null);
  const screenActiveRef = useRef(false);
  const lastViewedSequenceRef = useRef(0);
  const lastAcknowledgedSequenceRef = useRef(0);
  const acknowledgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memberItems = useMemo(() => projectMembers ?? [], [projectMembers]);
  const mentionCandidates = useMemo(() => buildMentionCandidates(memberItems), [memberItems]);
  const readOnly = archive === '1' || navigation?.archived === true || thread?.thread.status === 'archived';


  useEffect(() => {
    if (thread) setRenameValue(thread.thread.name);
  }, [thread]);
  useEffect(() => {
    return () => {
      if (acknowledgeTimeoutRef.current) clearTimeout(acknowledgeTimeoutRef.current);
    };
  }, []);
  useFocusEffect(useCallback(() => {
    screenActiveRef.current = true;
    return () => {
      screenActiveRef.current = false;
    };
  }, []));

  const acknowledgeViewedMessage = useCallback((sequence: number) => {
    if (!queryArgs || !screenActiveRef.current || navigation?.readStateImmutable) return;
    if (!Number.isInteger(sequence) || sequence <= lastAcknowledgedSequenceRef.current) return;
    lastViewedSequenceRef.current = Math.max(lastViewedSequenceRef.current, sequence);
    if (acknowledgeTimeoutRef.current) return;
    acknowledgeTimeoutRef.current = setTimeout(() => {
      acknowledgeTimeoutRef.current = null;
      const nextSequence = lastViewedSequenceRef.current;
      if (!nextSequence || !screenActiveRef.current || nextSequence <= lastAcknowledgedSequenceRef.current) return;
      lastAcknowledgedSequenceRef.current = nextSequence;
      void markRead({ ...queryArgs, viewedChannelSequence: nextSequence }).catch(() => {
        lastAcknowledgedSequenceRef.current = Math.min(lastAcknowledgedSequenceRef.current, nextSequence - 1);
      });
    }, 150);
  }, [markRead, navigation?.readStateImmutable, queryArgs]);

  const onViewableItemsChanged = useCallback<NonNullable<FlatListProps<GroupedThreadItem>['onViewableItemsChanged']>>(({ viewableItems }) => {
    const visibleMessages = viewableItems
      .filter((token) => token.isViewable && token.item.kind === 'message')
      .map((token) => token.item);
    // eslint-disable-next-line unicorn/no-array-sort -- reason: Copy first to preserve immutability while supporting the web ES2022 target.
    visibleMessages.sort((left, right) => left.at - right.at);
    const lastVisible = visibleMessages.at(-1);
    if (lastVisible?.kind === 'message') acknowledgeViewedMessage(lastVisible.item.message.channelSequence ?? 0);
  }, [acknowledgeViewedMessage]);
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 60 }), []);

  const threadItems = useMemo<GroupedThreadItem[]>(() => {
    const uniqueMessages = [...new Map(
      ((messages ?? []) as DetailedMessage[]).map((item) => [item.message._id, item] as const),
    ).values()];
    // eslint-disable-next-line unicorn/no-array-reverse -- reason: Reverse a newly copied array for the existing message ordering while supporting the web ES2022 target.
    const messageItems = uniqueMessages.reverse().map((item) => ({
      kind: 'message' as const,
      key: item.message._id,
      at: item.message.createdAt,
      item,
      isFirstInGroup: true,
    }));
    // eslint-disable-next-line unicorn/no-array-sort -- reason: Copy first to preserve immutability while supporting the web ES2022 target.
    const sortedItems = [...messageItems];
    sortedItems.sort((a, b) => a.at - b.at);
    return sortedItems;
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
  useEffect(() => {
    if (!targetMessageId) return;
    const index = threadItems.findIndex((item) => item.kind === 'message' && item.item.message._id === targetMessageId);
    if (index < 0) return;
    requestAnimationFrame(() => listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 }));
  }, [targetMessageId, threadItems]);

  async function handleSendMessage(payload: ComposerSubmission): Promise<ComposerSubmissionResult> {
    if (!trackUserId || !pid || !gid || !tid || readOnly) {
      return { failedIds: payload.attachments.map((a) => a.id), messageId: null };
    }
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
    setBusy(true);
    setError(null);
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
            channelThreadId: tid,
            userId: trackUserId,
            actingCompanyId: cid,
            projectMemberId: pmid,
          }),
          sendMessage: (input) => sendMessage({
            projectId: pid,
            groupId: gid,
            channelThreadId: tid,
            authorId: trackUserId,
            actingCompanyId: cid,
            projectMemberId: pmid,
            idempotencyKey: input.idempotencyKey,
            body: input.body,
            mentions: resolveMentionIds(input.body, memberItems),
            mentionedProjectMemberIds: resolveMentionProjectMemberIds(input.body, memberItems),
            replyToMessageId: input.replyToMessageId,
            notificationPreview: input.body,
          }),
        },
      });

      // Only retire the idempotency key once every attachment landed; a retry reuses the same message.
      if (result.failedIds.length === 0) {
        sendKey.current = null;
        sendSignatureRef.current = null;
      }
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll('_', ' ') : "Couldn't save");
      return { failedIds: payload.attachments.map((a) => a.id), messageId: null };
    } finally {
      setBusy(false);
    }
  }

  const messageActions = useMemo(() => {
    if (!actionTarget || actionTarget.kind === 'date-sep') return [];
    return [
      ...(!readOnly ? [{ label: 'Reply', icon: 'arrow-up' as const, onPress: () => setReplyTo(actionTarget.item) }] : []),
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
                  setBusy(true);
                  setError(null);
                  void deleteMessage({
                    messageId: actionTarget.item.message._id,
                    actorId: trackUserId,
                    actingCompanyId: cid,
                    projectMemberId: pmid,
                  }).then(() => {
                    if (replyMessageId === actionTarget.item.message._id) setReplyTo(null);
                    setNotice('Message deleted.');
                  }).catch((caught) => {
                    setError(caught instanceof Error ? caught.message.replaceAll('_', ' ') : "Couldn't delete message");
                  }).finally(() => setBusy(false));
                },
              },
            ],
          );
        },
      }] : []),
      { label: 'Report', icon: 'trash-can-outline' as const, destructive: true, onPress: () => {
        if (!trackUserId || !pid) return;
        void createReport({
          projectId: pid,
          reporterId: trackUserId,
          actingCompanyId: cid,
          projectMemberId: pmid,
          targetType: 'message',
          targetMessageId: actionTarget.item.message._id,
          reason: 'other',
        });
      } },
    ];
  }, [actionTarget, cid, createReport, deleteMessage, pid, pmid, readOnly, replyMessageId, setReplyTo, trackUserId]);

  const renderItem = useCallback<ListRenderItem<GroupedThreadItem>>(({ item }) => {
    if (item.kind === 'date-sep') return null;
    return <>
      <ThreadRow
        isFirstInGroup={item.isFirstInGroup}
        isOwnMessage={item.item.author?._id === trackUserId}
        item={item}
        onLongPress={() => { hapticLight(); setActionTarget(item); setActionsOpen(true); }}
        onSwipeReply={readOnly ? undefined : () => setReplyTo(item.item)}
      />

    </>;
  }, [readOnly, setReplyTo, trackUserId]);

  async function changeFollowing() {
    if (!queryArgs || !thread) return;
    setError(null);
    try {
      await setFollowing({ ...queryArgs, following: !thread.following });
      setNotice(thread.following ? 'Thread unfollowed.' : 'Thread followed.');
      setToolsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll('_', ' ') : "Couldn't update follow state");
    }
  }

  async function changeStatus() {
    if (!queryArgs || !thread) return;
    setError(null);
    try {
      const result = await setStatus({ ...queryArgs, expectedRevision: thread.thread.revision, status: thread.thread.status === 'active' ? 'archived' : 'active' });
      setNotice(result.conflict ? 'Thread changed elsewhere. Refreshed current state.' : result.status === 'archived' ? 'Thread archived.' : 'Thread reopened.');
      setToolsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll('_', ' ') : "Couldn't update thread");
    }
  }

  async function saveRename() {
    if (!queryArgs || !thread) return;
    setError(null);
    try {
      const result = await rename({ ...queryArgs, expectedRevision: thread.thread.revision, name: renameValue });
      setNotice(result.conflict ? 'Thread changed elsewhere. Refresh and retry.' : 'Thread renamed.');
      setToolsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll('_', ' ') : "Couldn't rename thread");
    }
  }

  if (!releaseConfig.threads || (navigation && !navigation.available) || thread === null) {
    return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Thread unavailable' }} /><EmptyState body={navigationUnavailableCopy(Boolean(cid))} icon="forum-outline" title="Thread unavailable or access changed" /></ThemedView>;
  }
  if ((network.isConnected === false || network.isInternetReachable === false) && thread === undefined) {
    return <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: 'Thread unavailable' }} />
      <EmptyState body="You're offline and this thread isn't available on this device." icon="forum-outline" title="Offline unavailable" />
      <Pressable
        accessibilityRole="button"
        onPress={() => pid && gid && tid && router.replace(threadConversationHref(pid, gid, tid, context, targetMessageId) as never)}
        style={[styles.retry, { backgroundColor: theme.accent }]}>
        <ThemedText style={{ color: Colors.light.text }} type="smallBold">Retry</ThemedText>
      </Pressable>
    </ThemedView>;
  }
  if (!trackUserId || navigation === undefined || thread === undefined) {
    return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Thread' }} /><EmptyState body="Opening the authorized conversation…" icon="forum-outline" title="Loading thread" /></ThemedView>;
  }
  const source = thread.source


  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{
        title: thread.thread.name,
        headerRight: () => <Pressable accessibilityLabel="Thread options" hitSlop={8} onPress={() => setToolsOpen(true)} style={styles.headerButton}><PlatformIcon color={theme.text} name="dots-horizontal" size={22} /></Pressable>,
      }} />
      {source ? <Pressable
        onPress={() => pid && gid && router.push(channelHref(
          pid,
          gid,
          context,
          'unavailable' in source ? undefined : source.messageId,
        ) as never)}
        style={[styles.source, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText style={{ color: theme.textSecondary }} type="captionBold">Reference message</ThemedText>
        <ThemedText numberOfLines={2} type="small">{'unavailable' in source ? 'Reference message unavailable.' : source.body || 'Attachment message'}</ThemedText>
      </Pressable> : null}
      {notice ? <ThemedText accessibilityLiveRegion="polite" style={[styles.notice, { color: theme.success }]} type="small">{notice}</ThemedText> : null}
      {error ? <ThemedText accessibilityLiveRegion="assertive" style={[styles.error, { color: theme.danger }]} type="small">{error}. Your unsent reply is still here.</ThemedText> : null}
      {readOnly ? <View style={[styles.archive, { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold">Archived thread</ThemedText><ThemedText style={{ color: theme.textSecondary }} type="small">This conversation is read-only.</ThemedText></View> : null}

      <FlatList
          contentContainerStyle={styles.list}
          style={styles.flex}
          data={threadItems}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.key}
          ListEmptyComponent={messagePageStatus === 'LoadingFirstPage'
            ? <ThemedText style={{ color: theme.textSecondary, padding: Spacing.three }}>Loading replies…</ThemedText>
            : <EmptyState body="Start the focused conversation." icon="forum-outline" title="No replies yet" />}
          ListHeaderComponent={hasMoreThreadItems ? <Pressable
            accessibilityRole="button"
            disabled={messagePageStatus === 'LoadingMore'}
            onPress={() => {
              if (messagePageStatus === 'CanLoadMore') loadMoreMessages(50);
            }}
            style={styles.loadMore}>
            <ThemedText type="smallBold">Load older replies</ThemedText>
          </Pressable> : null}
          onScrollToIndexFailed={({ index }) => requestAnimationFrame(() => listRef.current?.scrollToIndex({ animated: false, index, viewPosition: 0.5 }))}
          onViewableItemsChanged={onViewableItemsChanged}
          ref={listRef}
          // Matches conversation.tsx: Android cell clipping leaves stale colors after a theme change.
          removeClippedSubviews={false}
          renderItem={renderItem}
          viewabilityConfig={viewabilityConfig}
        />

      {!readOnly ? <Composer
        activeGroupName={thread.thread.name}
        busy={busy}
        mentionCandidatesHasMore={projectMembersPage.status === 'CanLoadMore'}
        mentionCandidatesLoading={projectMembersPage.status === 'LoadingMore'}
        mentionCandidates={mentionCandidates}
        onCancelReply={() => setReplyTo(null)}
        onChangeText={setComposer}
        onFocus={() => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))}
        onLoadMoreMentionCandidates={() => {
          if (projectMembersPage.status === 'CanLoadMore') projectMembersPage.loadMore(100);
        }}
        onSendMessage={handleSendMessage}
        replyTo={replyTo}
        value={composer}
      /> : null}
      <OptionsSheet onClose={() => setToolsOpen(false)} title="Thread" visible={toolsOpen}>
        <SheetSection>
          {!navigation.archived ? <SheetRow label={thread.following ? 'Unfollow' : 'Follow'} icon="bell-outline" onPress={() => void changeFollowing()} /> : null}
          {thread.canManage && !navigation.archived ? <SheetRow
            label={thread.thread.status === 'active' ? 'Archive' : 'Reopen'}
            icon="clock-outline"
            onPress={() => void changeStatus()}
          /> : null}
        </SheetSection>
        {thread.canManage && !navigation.archived ? <SheetSection title="Rename">
          <SheetInput label="THREAD NAME" onChangeText={setRenameValue} value={renameValue} />
          <SheetRow label="Save name" icon="check-circle" onPress={() => void saveRename()} />
        </SheetSection> : null}
      </OptionsSheet>
      <MessageActions actions={messageActions} onClose={() => setActionsOpen(false)} visible={actionsOpen} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  archive: { gap: 2, padding: Spacing.three },
  error: { padding: Spacing.three },
  flex: { flex: 1 },
  headerButton: { alignItems: 'center', height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  list: { flexGrow: 1, paddingVertical: Spacing.two },
  loadMore: { alignItems: 'center', minHeight: TouchTarget, justifyContent: 'center', padding: Spacing.two },
  notice: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  retry: { alignItems: 'center', alignSelf: 'center', borderRadius: 9, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.four },
  screen: { flex: 1 },
  source: { gap: 3, margin: Spacing.three, marginBottom: 0, padding: Spacing.three, borderRadius: 10 },
});
