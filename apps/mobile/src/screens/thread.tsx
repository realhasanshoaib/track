import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useNetworkState } from 'expo-network';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, View, type FlatListProps, type ListRenderItem } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { parseMentions } from '@track/shared';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { ActionButton } from '@/components/action-button';
import { Composer } from '@/components/composer';
import { ConnectivityBanner } from '@/components/connectivity-banner';
import { ConversationLoading } from '@/components/conversation-loading';
import { EmptyState } from '@/components/empty-state';
import { ForwardMessageSheet } from '@/components/forward-message-sheet';
import { IconButton } from '@/components/icon-button';
import { MessageActions } from '@/components/message-actions';
import { MessageReportSheet, type ReportReason } from '@/components/message-report-sheet';
import { MessageTaskReviewSheet } from '@/components/message-task-review-sheet';
import { OptionsSheet, SheetInput, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { TaskInlineCards } from '@/components/task-inline-cards';
import { ThreadRow, DateSeparator, type DetailedMessage, type GroupedThreadItem, resolveMentionIds, resolveMentionProjectMemberIds } from '@/components/thread-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTrackUser } from '@/contexts/track-user-context';
import { useAppToast } from '@/components/app-toast';
import { useTheme } from '@/hooks/use-theme';
import { channelHref, navigationUnavailableCopy } from '@/lib/company-navigation';
import { sendComposerMessage, type ComposerSubmission, type ComposerSubmissionResult } from '@/lib/attachment-upload';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { idempotencyKey } from '@/lib/idempotency';
import { buildMentionCandidates } from '@/lib/mention-autocomplete';
import { useReleaseConfig } from '@/lib/release-config';
import { taskDetailHref, type MobileTaskIdentity } from '@/lib/task-navigation';
import { assistantTaskDraft, messageTaskDraft, type ReviewableMessageTaskDraft } from '@/lib/message-task-draft';
import { threadConversationHref } from '@/lib/thread-navigation';
import { setActivePushContext } from '@/lib/push-presentation';
import { useComposerDraft } from '@/hooks/use-composer-draft';
import { shouldShowJumpToLatest } from '@/lib/thread-list';
import { TaskLinkBatchProvider } from '@/lib/task-link-context';
import { communicationErrorMessage, taskErrorMessage } from '@/lib/user-facing-error';
import { archivePresentation } from '@/lib/archive-presentation';

const FIVE_MINUTES = 5 * 60 * 1000;

function dateSepLabel(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ThreadScreen() {
  const theme = useTheme();
  const { showToast } = useAppToast();
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
  const navigation = useQuery(api.mobile.resolveNavigation, releaseConfig.threads && trackUserId && pid && gid
    ? { userId: trackUserId, projectId: pid, groupId: gid, actingCompanyId: cid, projectMemberId: pmid }
    : 'skip');
  const archiveContext = archive === '1' || navigation?.readStateImmutable === true || navigation?.project?.status === 'archived';
  const context = cid && pmid ? { companyId: cid, membershipId: pmid, archived: archiveContext } : null;
  const groups = useQuery(api.mobile.listGroups, releaseConfig.threads && trackUserId && pid && navigation?.available
    ? { userId: trackUserId, projectId: pid, actingCompanyId: cid, projectMemberId: pmid }
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
  const assistantPage = usePaginatedQuery(
    api.assistant.listForThreadPage,
    queryArgs ? { ...queryArgs, targetMessageId } : 'skip',
    { initialNumItems: 50 },
  );
  const assistantStreams = assistantPage.status === 'LoadingFirstPage' ? undefined : assistantPage.results;
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
  const askTrack = useAction(api.assistant.ask);
  const markRead = useMutation(api.channelThreads.markRead);
  const setFollowing = useMutation(api.channelThreads.setFollowing);
  const setStatus = useMutation(api.channelThreads.setStatus);
  const rename = useMutation(api.channelThreads.rename);
  const forwardMessage = useMutation(api.messages.forwardMessage);
  const createReport = useMutation(api.reports.create);
  const createTask = useMutation(api.tasks.create);
  const deleteMessage = useMutation(api.messages.remove);
  const editMessage = useMutation(api.messages.edit);
  const sendSignatureRef = useRef<string | null>(null);
  const [replySelection, setReplySelection] = useState<{ scopeKey: string; message: DetailedMessage } | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<Id<'messages'> | null>(null);
  const handledTargetMessageIdRef = useRef<Id<'messages'> | null>(null);
  const positionedTargetMessageIdRef = useRef<Id<'messages'> | null>(null);
  const atBottomRef = useRef(true);
  const scrollMetricsRef = useRef({ contentHeight: 0, offsetY: 0, viewportHeight: 0 });
  const knownMessageIdsRef = useRef<Set<Id<'messages'>> | null>(null);
  const knownAssistantStreamsRef = useRef<Map<Id<'assistantStreams'>, string> | null>(null);
  const newestFeedTimeRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [pendingTrackPrompts, setPendingTrackPrompts] = useState<Set<Id<'messages'>>>(new Set());
  const pendingTrackPromptIdsRef = useRef(new Set<Id<'messages'>>());
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newReplyCount, setNewReplyCount] = useState(0);
  const [creatingTaskKey, setCreatingTaskKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [actionTarget, setActionTarget] = useState<GroupedThreadItem | null>(null);
  const [reportTarget, setReportTarget] = useState<GroupedThreadItem | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [taskReviewDraft, setTaskReviewDraft] = useState<ReviewableMessageTaskDraft | null>(null);
  const [taskReviewError, setTaskReviewError] = useState<string | null>(null);
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(0);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DetailedMessage | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [forwardTarget, setForwardTarget] = useState<DetailedMessage | null>(null);
  const [forwardBusyGroupId, setForwardBusyGroupId] = useState<string | null>(null);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const hasMoreThreadItems = messagePageStatus === 'CanLoadMore' || assistantPage.status === 'CanLoadMore';
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
  const scrollToLatestAfterSendRef = useRef(false);
  const screenActiveRef = useRef(false);
  const lastViewedSequenceRef = useRef(0);
  const lastAcknowledgedSequenceRef = useRef(0);
  const acknowledgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memberItems = useMemo(() => projectMembers ?? [], [projectMembers]);
  const mentionCandidates = useMemo(() => buildMentionCandidates(memberItems), [memberItems]);
  const readOnly = archiveContext || navigation?.archived === true || thread?.thread.status === 'archived';
  const threadArchiveDetails = navigation?.archiveDetails ?? (thread?.thread.status === 'archived'
    ? { kind: 'thread' as const, cutoffAt: thread.thread.archivedAt ?? null, reason: null }
    : null);
  const archiveBanner = readOnly ? archivePresentation(threadArchiveDetails) : null;
  const scrollToLatest = useCallback(() => {
    atBottomRef.current = true;
    setNewReplyCount(0);
    listRef.current?.scrollToEnd({ animated: true });
  }, []);
  const updateJumpToLatest = useCallback(() => {
    const { contentHeight, offsetY, viewportHeight } = scrollMetricsRef.current;
    const distanceFromBottom = Math.max(0, contentHeight - offsetY - viewportHeight);
    atBottomRef.current = distanceFromBottom < 80;
    if (atBottomRef.current) setNewReplyCount(0);
    setShowJumpToLatest(shouldShowJumpToLatest(distanceFromBottom));
  }, []);
  const taskIdentity = useMemo<MobileTaskIdentity | null>(() => cid && pmid ? {
    archived: readOnly,
    companyId: cid,
    membershipId: pmid,
  } : null, [cid, pmid, readOnly]);

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
    if (!queryArgs || readOnly || !screenActiveRef.current) return;
    if (!Number.isInteger(sequence) || sequence <= lastAcknowledgedSequenceRef.current) return;
    lastViewedSequenceRef.current = Math.max(lastViewedSequenceRef.current, sequence);
    if (acknowledgeTimeoutRef.current) return;
    acknowledgeTimeoutRef.current = setTimeout(() => {
      acknowledgeTimeoutRef.current = null;
      const nextSequence = lastViewedSequenceRef.current;
      if (!nextSequence || readOnly || !screenActiveRef.current || nextSequence <= lastAcknowledgedSequenceRef.current) return;
      lastAcknowledgedSequenceRef.current = nextSequence;
      void markRead({ ...queryArgs, viewedChannelSequence: nextSequence }).catch(() => {
        lastAcknowledgedSequenceRef.current = Math.min(lastAcknowledgedSequenceRef.current, nextSequence - 1);
      });
    }, 150);
  }, [markRead, queryArgs, readOnly]);

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
    const assistantItems = ((assistantStreams ?? []) as Doc<'assistantStreams'>[]).map((stream) => ({
      kind: 'assistant' as const,
      key: stream._id,
      at: stream.createdAt,
      stream,
      isFirstInGroup: true,
    }));
    const sortedItems = [...messageItems, ...assistantItems];
    // eslint-disable-next-line unicorn/no-array-sort -- reason: Copy first to preserve immutability while supporting the web ES2022 target.
    sortedItems.sort((a, b) => a.at - b.at);
    const result: GroupedThreadItem[] = [];
    let lastDate = '';
    let lastAuthor = '';
    let lastAt = 0;
    let interrupted = true;
    for (const item of sortedItems) {
      const date = new Date(item.at).toDateString();
      if (date !== lastDate) {
        result.push({ kind: 'date-sep', key: `sep-${item.at}`, at: item.at, label: dateSepLabel(item.at) });
        lastDate = date;
        interrupted = true;
      }
      const author = item.kind === 'message' ? item.item.author?._id ?? 'unknown' : '__assistant__';
      const isFirstInGroup = interrupted || author !== lastAuthor || item.at - lastAt > FIVE_MINUTES;
      result.push({ ...item, isFirstInGroup });
      lastAuthor = author;
      lastAt = item.at;
      interrupted = false;
    }
    return result;
  }, [assistantStreams, messages]);
  useEffect(() => {
    if (!messages || !assistantStreams) return;
    const messageItems = messages as DetailedMessage[];
    const streams = assistantStreams as Doc<'assistantStreams'>[];
    const previousMessageIds = knownMessageIdsRef.current;
    const previousStreams = knownAssistantStreamsRef.current;
    const previousNewestTime = newestFeedTimeRef.current;
    const currentMessageIds = new Set(messageItems.map(({ message }) => message._id));
    const currentStreams = new Map(streams.map((stream) => [stream._id, stream.status]));
    const newestTime = Math.max(
      previousNewestTime,
      ...messageItems.map(({ message }) => message.createdAt),
      ...streams.map((stream) => stream.createdAt),
    );
    if (previousMessageIds && previousStreams) {
      const newIncomingMessages = messageItems.filter(({ message }) =>
        !previousMessageIds.has(message._id) && message.authorId !== trackUserId && message.createdAt >= previousNewestTime,
      );
      const newAssistantAnswers = streams.filter((stream) => {
        const previous = previousStreams.get(stream._id);
        return stream.status === 'completed' && Boolean(stream.answer.trim()) && (
          previous === 'queued' || previous === 'running' || (!previous && stream.createdAt >= previousNewestTime)
        );
      });
      if (screenActiveRef.current) {
        if (newIncomingMessages.length) hapticLight();
        if (newAssistantAnswers.length) hapticSuccess();
      }
      if (!atBottomRef.current && (newIncomingMessages.length || newAssistantAnswers.length)) {
        setNewReplyCount((count) => count + newIncomingMessages.length + newAssistantAnswers.length);
      }
      knownMessageIdsRef.current = new Set([...previousMessageIds, ...currentMessageIds]);
      knownAssistantStreamsRef.current = new Map([...previousStreams, ...currentStreams]);
    } else {
      knownMessageIdsRef.current = currentMessageIds;
      knownAssistantStreamsRef.current = currentStreams;
    }
    newestFeedTimeRef.current = newestTime;
  }, [assistantStreams, messages, trackUserId]);
  const taskLinkMessageIds = useMemo(() => threadItems.flatMap((item) => item.kind === 'message' ? [item.item.message._id] : []), [threadItems]);
  const linkedTasks = useQuery(
    api.tasks.listForMessages,
    releaseConfig.tasks && taskLinkMessageIds.length
      ? { messageIds: taskLinkMessageIds, actingCompanyId: cid, projectMemberId: pmid }
      : 'skip',
  );
  const firstLinkedTask = linkedTasks?.flatMap((item) => item.tasks)[0]?.task;
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
    if (!targetMessageId) {
      handledTargetMessageIdRef.current = null;
      positionedTargetMessageIdRef.current = null;
      return;
    }
    if (targetMessageId !== handledTargetMessageIdRef.current) {
      handledTargetMessageIdRef.current = null;
      positionedTargetMessageIdRef.current = null;
    }
    if (targetMessageId === handledTargetMessageIdRef.current) return;
    const index = threadItems.findIndex((item) => item.kind === 'message' && item.item.message._id === targetMessageId);
    if (index < 0) return;
    handledTargetMessageIdRef.current = targetMessageId;
    setHighlightedMessageId(targetMessageId);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 });
      positionedTargetMessageIdRef.current = targetMessageId;
    });
  }, [targetMessageId, threadItems]);
  useEffect(() => {
    if (!highlightedMessageId) return;
    const timer = setTimeout(() => setHighlightedMessageId((current) => current === highlightedMessageId ? null : current), 1800);
    return () => clearTimeout(timer);
  }, [highlightedMessageId]);

  const scrollToMessage = useCallback((messageId: Id<'messages'>) => {
    const index = threadItems.findIndex((item) => item.kind === 'message' && item.item.message._id === messageId);
    if (index >= 0) {
      setHighlightedMessageId(messageId);
      listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 });
      return;
    }
    if (pid && gid && tid) router.replace(threadConversationHref(pid, gid, tid, context, messageId) as never);
  }, [context, gid, pid, router, threadItems, tid]);

  async function handleSendMessage(payload: ComposerSubmission): Promise<ComposerSubmissionResult> {
    if (!trackUserId || !pid || !gid || !tid || readOnly) {
      throw new Error('thread_unavailable');
    }
    const body = payload.body.trim();
    const replyToMessageId = payload.replyToMessageId;
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

      if (result.messageId) {
        scrollToLatestAfterSendRef.current = true;
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      }
      if (result.messageId && parseMentions(body).includes('track')) {
        requestTrackResponse(result.messageId, body);
      }
      if (result.failedIds.length === 0) {
        sendKey.current = null;
        sendSignatureRef.current = null;
      }
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function handleForward(
    target: { group: { _id: Id<'groups'>; name: string; kind: string; status?: string }; membership: object },
    note: string,
    audienceExpansionConfirmed = false,
  ) {
    if (!forwardTarget || !trackUserId || !pid) return;
    setForwardBusyGroupId(target.group._id);
    setForwardError(null);
    try {
      await forwardMessage({
        projectId: pid,
        sourceMessageId: forwardTarget.message._id,
        targetGroupId: target.group._id,
        actorId: trackUserId,
        actingCompanyId: cid,
        projectMemberId: pmid,
        body: note.trim() || undefined,
        idempotencyKey: idempotencyKey(),
        audienceExpansionConfirmed,
      });
      setForwardTarget(null);
      showToast({ icon: 'forward', message: `Copied to ${target.group.name}.`, title: 'Message forwarded', tone: 'success' });
    } catch (caught) {
      if (!audienceExpansionConfirmed && String(caught).includes('audience_expansion_confirmation_required')) {
        Alert.alert(
          'This Channel has more members',
          'Some people in the destination Channel may not have access to the original message. Forward it anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Forward anyway', onPress: () => { void handleForward(target, note, true); } },
          ],
        );
        return;
      }
      setForwardError(communicationErrorMessage(caught, 'forward this message'));
    } finally {
      setForwardBusyGroupId(null);
    }
  }

  const submitSwipeReport = useCallback((target: Exclude<GroupedThreadItem, { kind: 'date-sep' }>) => {
    setReportError(null);
    setReportTarget(target);
    hapticLight();
  }, []);

  const copyMessageText = useCallback(async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      showToast({ title: 'Copied', message: 'Message text copied to your clipboard.', tone: 'success' });
    } catch {
      showToast({ title: 'Could not copy', message: 'Try selecting the message text and copying it again.', tone: 'error' });
    }
  }, [showToast]);

  const requestTrackResponse = useCallback((promptMessageId: Id<'messages'>, question: string) => {
    if (readOnly || !trackUserId || !pid || !gid || !tid) return;
    if (pendingTrackPromptIdsRef.current.has(promptMessageId)) return;
    pendingTrackPromptIdsRef.current.add(promptMessageId);
    setPendingTrackPrompts((current) => new Set(current).add(promptMessageId));
    void askTrack({
      actingCompanyId: cid,
      channelThreadId: tid,
      groupId: gid,
      projectId: pid,
      projectMemberId: pmid,
      promptMessageId,
      question,
      requesterId: trackUserId,
    }).catch(() => {
      showToast({ title: 'Track could not start', message: 'Your message is still in the thread. Use its message actions to retry Track; it was not sent again.', tone: 'error' });
    }).finally(() => {
      pendingTrackPromptIdsRef.current.delete(promptMessageId);
      setPendingTrackPrompts((current) => {
        const next = new Set(current);
        next.delete(promptMessageId);
        return next;
      });
    });
  }, [askTrack, cid, gid, pid, pmid, readOnly, showToast, tid, trackUserId]);

  const retryAssistantAnswer = useCallback((stream: Doc<'assistantStreams'>) => {
    const prompt = threadItems.find((entry) => entry.kind === 'message' && entry.item.message._id === stream.promptMessageId);
    if (!prompt || prompt.kind !== 'message') {
      showToast({ title: 'Question unavailable', message: 'The original question is not loaded in this thread.', tone: 'error' });
      return;
    }
    requestTrackResponse(prompt.item.message._id, prompt.item.message.body);
  }, [requestTrackResponse, showToast, threadItems]);

  const messageActions = useMemo(() => {
    if (!actionTarget || actionTarget.kind === 'date-sep') return [];
    const copyText = actionTarget.kind === 'message'
      ? actionTarget.item.message.body.trim()
      : actionTarget.stream.status === 'failed' ? '' : actionTarget.stream.answer.trim();
    return [
      ...(copyText ? [{ label: 'Copy message', icon: 'content-copy' as const, onPress: () => { void copyMessageText(copyText); } }] : []),
      ...(actionTarget.kind === 'message' &&
        !readOnly &&
        parseMentions(actionTarget.item.message.body).includes('track') &&
        !actionTarget.item.message.trackInvocationId &&
        !pendingTrackPrompts.has(actionTarget.item.message._id) ? [{
        label: 'Retry Track response',
        icon: 'refresh' as const,
        onPress: () => requestTrackResponse(actionTarget.item.message._id, actionTarget.item.message.body),
      }] : []),
      ...(!readOnly && actionTarget.kind === 'message' ? [{
        label: 'Forward',
        icon: 'forward' as const,
        onPress: () => { setForwardError(null); setForwardTarget(actionTarget.item); },
      }] : []),
      ...(!readOnly && actionTarget.kind === 'assistant' && actionTarget.stream.status === 'failed' && actionTarget.stream.promptMessageId && !pendingTrackPrompts.has(actionTarget.stream.promptMessageId) ? [{
        label: 'Retry Track response',
        icon: 'refresh' as const,
        onPress: () => retryAssistantAnswer(actionTarget.stream),
      }] : []),
      ...(!readOnly && actionTarget.kind === 'message' ? [{ label: 'Reply', icon: 'arrow-up' as const, onPress: () => setReplyTo(actionTarget.item) }] : []),
      ...(!readOnly && releaseConfig.tasks ? [{
        label: 'Create task',
        icon: 'plus' as const,
        onPress: () => {
          if (!pid || !gid) return;
          const draft = actionTarget.kind === 'message'
            ? messageTaskDraft(actionTarget.item.message.body, actionTarget.item.message._id, actionTarget.key)
            : assistantTaskDraft(actionTarget.stream.answer, actionTarget.stream._id, actionTarget.key);
          setTaskReviewDraft(draft);
          setTaskReviewError(null);
        },
      }] : []),
      ...(!readOnly &&
        actionTarget.kind === 'message' &&
        actionTarget.item.message.authorId === trackUserId &&
        (!pmid || !actionTarget.item.message.authorProjectMemberId ||
          actionTarget.item.message.authorProjectMemberId === pmid) ? [{
        label: 'Edit message',
        icon: 'edit' as const,
        onPress: () => {
          setEditTarget(actionTarget.item);
          setEditBody(actionTarget.item.message.body);
        },
      }] : []),
      ...(!readOnly &&
        actionTarget.kind === 'message' &&
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
                    setError(communicationErrorMessage(caught, 'delete this message'));
                  }).finally(() => setBusy(false));
                },
              },
            ],
          );
        },
      }] : []),
      { label: 'Report', icon: 'flag' as const, onPress: () => { setReportError(null); setReportTarget(actionTarget); } },
    ];
  }, [actionTarget, cid, copyMessageText, deleteMessage, gid, pendingTrackPrompts, pid, pmid, readOnly, releaseConfig.tasks, replyMessageId, requestTrackResponse, retryAssistantAnswer, setReplyTo, trackUserId]);

  async function submitReport(reason: ReportReason, note: string) {
    const target = reportTarget;
    if (!target || target.kind === 'date-sep' || !trackUserId || !pid || reportBusy) return;
    setReportBusy(true);
    setReportError(null);
    try {
      await createReport({
        projectId: pid,
        reporterId: trackUserId,
        actingCompanyId: cid,
        projectMemberId: pmid,
        targetType: target.kind === 'assistant' ? 'assistant_answer' : 'message',
        targetMessageId: target.kind === 'message' ? target.item.message._id : undefined,
        targetAssistantStreamId: target.kind === 'assistant' ? target.stream._id : undefined,
        reason,
        note,
      });
      setReportTarget(null);
      showToast({ icon: 'flag', message: 'Thanks. The report was submitted for review.', title: 'Message reported', tone: 'success' });
    } catch (failure) {
      setReportError(communicationErrorMessage(failure, 'submit this report'));
    } finally {
      setReportBusy(false);
    }
  }

  async function createReviewedTask() {
    const draft = taskReviewDraft;
    if (!draft || !trackUserId || !pid || !gid || creatingTaskKey === draft.idempotencyKey) return;
    setCreatingTaskKey(draft.idempotencyKey);
    setTaskReviewError(null);
    try {
      const task = await createTask({
        projectId: pid,
        groupId: gid,
        title: draft.title.trim(),
        priority: 'none',
        references: draft.references,
        idempotencyKey: draft.idempotencyKey,
        actingCompanyId: cid,
        projectMemberId: pmid,
      });
      setTaskReviewDraft(null);
      showToast({ title: 'Task created', message: `Task ${task.publicKey} is ready to review.`, tone: 'success' });
    } catch (failure) {
      setTaskReviewError(taskErrorMessage(failure, 'The task could not be created. Check your connection and try again.'));
    } finally {
      setCreatingTaskKey(null);
    }
  }

  async function saveMessageEdit() {
    const target = editTarget;
    if (!target || !trackUserId || editBusy || (!editBody.trim() && target.attachments.length === 0)) return;
    setEditBusy(true);
    try {
      await editMessage({
        messageId: target.message._id,
        actorId: trackUserId,
        actingCompanyId: cid,
        projectMemberId: pmid,
        body: editBody.trim(),
      });
      setEditTarget(null);
      showToast({ title: 'Message updated', message: 'Your changes were saved.', tone: 'success' });
    } catch (failure) {
      showToast({ title: 'Message not updated', message: communicationErrorMessage(failure, 'edit this message'), tone: 'error' });
    } finally {
      setEditBusy(false);
    }
  }

  const renderItem = useCallback<ListRenderItem<GroupedThreadItem>>(({ item }) => {
    if (item.kind === 'date-sep') return <DateSeparator label={item.label} />;
    return <>
      <ThreadRow
        highlighted={item.kind === 'message' && item.item.message._id === highlightedMessageId}
        isFirstInGroup={item.isFirstInGroup}
        isOwnMessage={item.kind === 'message' && item.item.author?._id === trackUserId}
        item={item}
        onLongPress={() => { hapticLight(); setActionTarget(item); setActionsOpen(true); }}
        onSwipeReply={readOnly || item.kind !== 'message' ? undefined : () => setReplyTo(item.item)}
        onSwipeForward={!readOnly && item.kind === 'message' ? () => { hapticLight(); setForwardError(null); setForwardTarget(item.item); } : undefined}
        onSwipeReport={() => { void submitSwipeReport(item); }}
        onPressReply={item.kind === 'message' && item.item.replyTo ? () => {
          const quotedId = item.item.replyTo?.messageId;
          if (quotedId) scrollToMessage(quotedId);
        } : undefined}
        variant="thread"
      />
      {releaseConfig.tasks && pid ? <TaskInlineCards
        assistantStreamId={item.kind === 'assistant' ? item.stream._id : undefined}
        identity={taskIdentity}
        messageId={item.kind === 'message' ? item.item.message._id : undefined}
        projectId={pid}
        readOnly={readOnly}
      /> : null}
    </>;
  }, [highlightedMessageId, pid, readOnly, releaseConfig.tasks, scrollToMessage, setReplyTo, submitSwipeReport, taskIdentity, trackUserId]);

  async function changeFollowing() {
    if (!queryArgs || !thread) return;
    setError(null);
    try {
      await setFollowing({ ...queryArgs, following: !thread.following });
      setNotice(thread.following ? 'Thread unfollowed.' : 'Thread followed.');
      setToolsOpen(false);
    } catch (caught) {
      setError(communicationErrorMessage(caught, 'update the follow state'));
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
      setError(communicationErrorMessage(caught, 'update this thread'));
    }
  }

  async function saveRename() {
    if (!queryArgs || !thread) return;
    setError(null);
    try {
      const result = await rename({ ...queryArgs, expectedRevision: thread.thread.revision, name: renameValue });
      setNotice(result.conflict ? 'Thread changed elsewhere. Refresh and retry.' : 'Thread renamed.');
      setToolsOpen(false);
      setRenameOpen(false);
      if (!result.conflict) showToast({ icon: 'check-circle', message: 'The new name is visible to everyone with access.', title: 'Thread renamed', tone: 'success' });
    } catch (caught) {
      setError(communicationErrorMessage(caught, 'rename this thread'));
    }
  }

  if (!releaseConfig.threads || (navigation && !navigation.available) || thread === null) {
    return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Thread unavailable' }} /><EmptyState body={navigationUnavailableCopy(Boolean(cid))} icon="thread" title="Thread unavailable or access changed" /></ThemedView>;
  }
  if ((network.isConnected === false || network.isInternetReachable === false) && thread === undefined) {
    return <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: 'Thread unavailable' }} />
      <EmptyState body="Connect to the internet to load this thread." icon="thread" title="Thread unavailable offline" />
      <Pressable
        accessibilityRole="button"
        onPress={() => pid && gid && tid && router.replace(threadConversationHref(pid, gid, tid, context, targetMessageId) as never)}
        style={[styles.retry, { backgroundColor: theme.accent }]}>
        <ThemedText style={{ color: theme.accentInk }} type="smallBold">Retry</ThemedText>
      </Pressable>
    </ThemedView>;
  }
  if (!trackUserId || navigation === undefined || thread === undefined) {
    return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Thread' }} /><ConversationLoading label="Loading thread" variant="thread" /></ThemedView>;
  }
  const source = thread.source
  const sourceDate = source && !('unavailable' in source) ? source.createdAt : null;
  const taskLinkAssistantStreamIds = threadItems.flatMap((entry) => entry.kind === 'assistant' ? [entry.stream._id] : []);
  const channelName = groups?.find((item) => item.group._id === gid)?.group.name ?? navigation?.channel?.name ?? 'Channel';
  const sourceContextCard = source ? <Pressable
    accessibilityHint="Opens the source message in its Channel"
    accessibilityLabel={`Source message in ${channelName}`}
    accessibilityRole="button"
    onPress={() => pid && gid && router.push(channelHref(
      pid,
      gid,
      context,
      'unavailable' in source ? undefined : source.messageId,
    ) as never)}
    style={({ pressed }) => [
      styles.source,
      { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder },
      pressed && styles.sourcePressed,
    ]}>
    <View style={styles.sourceHeader}>
      <View style={styles.sourceBadges}>
        <View style={[styles.sourceBadge, { backgroundColor: theme.accentSoft }]}>
          <PlatformIcon color={theme.accentStrong} name="reply" size={13} />
          <ThemedText themeColor="accentStrong" type="captionBold">Source</ThemedText>
        </View>
        <View style={[styles.channelBadge, { backgroundColor: theme.backgroundElement }]}>
          <PlatformIcon color={theme.textSecondary} name="channel" size={13} />
          <ThemedText numberOfLines={1} style={styles.sourceChannel} themeColor="textSecondary" type="captionBold">#{channelName}</ThemedText>
        </View>
      </View>
      <View style={styles.sourceMeta}>
        {sourceDate ? <ThemedText themeColor="textTertiary" type="caption">{new Date(sourceDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</ThemedText> : null}
        <PlatformIcon color={theme.textTertiary} name="chevron-right" size={16} />
      </View>
    </View>
    <ThemedText numberOfLines={2} themeColor="textSecondary" type="small">
      {'unavailable' in source ? 'Reference message unavailable.' : source.body || 'Attachment message'}
    </ThemedText>
    {firstLinkedTask ? <View style={[styles.sourceTaskLink, { backgroundColor: theme.accentSoft }]}>
      <PlatformIcon color={theme.accentStrong} name="link" size={13} />
      <ThemedText numberOfLines={1} style={styles.sourceTaskLabel} themeColor="accentStrong" type="captionBold">
        {firstLinkedTask.publicKey} · {firstLinkedTask.title}
      </ThemedText>
    </View> : null}
  </Pressable> : null;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: theme.homeSurface }]}>
      <Stack.Screen options={{
        headerTransparent: true,
        headerBlurEffect: 'none',
        headerBackground: () => <View pointerEvents="none" style={StyleSheet.absoluteFill} />,
        headerTitle: () => <View style={[styles.headerIdentity, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
          <View style={[styles.headerMark, { backgroundColor: Platform.OS === 'ios' ? 'transparent' : theme.accentSoft }]}><PlatformIcon color={theme.accentStrong} name="thread" size={18} /></View>
          <View style={styles.headerTitle}>
            <ThemedText numberOfLines={2} type="title">{thread.thread.name}</ThemedText>
            <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">#{channelName}</ThemedText>
          </View>
        </View>,
        headerLeft: () => <IconButton
          accessibilityLabel="Back to Channel"
          icon="arrow-left"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else if (pid && gid) {
              router.replace(channelHref(pid, gid, context) as never);
            }
          }}
        />,
        headerRight: () => <IconButton accessibilityLabel="Thread options" icon="dots-horizontal" onPress={() => setToolsOpen(true)} />,
      }} />
      <ConnectivityBanner message="You’re offline. Cached replies stay available; sending will retry when you reconnect." style={styles.connection} />
      {notice ? <ThemedText accessibilityLiveRegion="polite" style={[styles.notice, { color: theme.success }]} type="small">{notice}</ThemedText> : null}
      {error ? <ThemedText accessibilityLiveRegion="assertive" style={[styles.error, { color: theme.danger }]} type="small">{error}. Your unsent reply is still here.</ThemedText> : null}
      {archiveBanner ? <View style={[styles.archive, { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold">{archiveBanner.title}</ThemedText><ThemedText style={{ color: theme.textSecondary }} type="small">{archiveBanner.description}</ThemedText></View> : null}
      <TaskLinkBatchProvider
        assistantStreamIds={taskLinkAssistantStreamIds}
        enabled={releaseConfig.tasks}
        identity={taskIdentity}
        messageIds={taskLinkMessageIds}
      >
      <FlatList
          contentContainerStyle={[styles.list, { paddingBottom: composerOverlayHeight + TouchTarget + Spacing.four }]}
          contentInsetAdjustmentBehavior="automatic"
          style={styles.flex}
          data={threadItems}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.key}
          ListEmptyComponent={messagePageStatus === 'LoadingFirstPage' || assistantPage.status === 'LoadingFirstPage'
            ? <ThemedText style={{ color: theme.textSecondary, padding: Spacing.three }}>Loading replies…</ThemedText>
            : <EmptyState body="Start the focused conversation." icon="thread" title="No replies yet" />}
          ListHeaderComponent={<>
            {sourceContextCard}
            {hasMoreThreadItems ? <Pressable
              accessibilityRole="button"
              disabled={messagePageStatus === 'LoadingMore' || assistantPage.status === 'LoadingMore'}
              onPress={() => {
                if (messagePageStatus === 'CanLoadMore') loadMoreMessages(50);
                if (assistantPage.status === 'CanLoadMore') assistantPage.loadMore(50);
              }}
              style={styles.loadMore}>
              <ThemedText type="smallBold">Load older replies</ThemedText>
            </Pressable> : null}
          </>}
          onScrollToIndexFailed={({ index }) => requestAnimationFrame(() => listRef.current?.scrollToIndex({ animated: false, index, viewPosition: 0.5 }))}
          onLayout={({ nativeEvent }) => {
            scrollMetricsRef.current.viewportHeight = nativeEvent.layout.height;
            updateJumpToLatest();
          }}
          onScroll={({ nativeEvent }) => {
            scrollMetricsRef.current.offsetY = nativeEvent.contentOffset.y;
            scrollMetricsRef.current.contentHeight = nativeEvent.contentSize.height;
            scrollMetricsRef.current.viewportHeight = nativeEvent.layoutMeasurement.height;
            updateJumpToLatest();
          }}
          onMomentumScrollEnd={({ nativeEvent }) => {
            scrollMetricsRef.current.offsetY = nativeEvent.contentOffset.y;
            scrollMetricsRef.current.contentHeight = nativeEvent.contentSize.height;
            scrollMetricsRef.current.viewportHeight = nativeEvent.layoutMeasurement.height;
            updateJumpToLatest();
          }}
          scrollEventThrottle={16}
          onViewableItemsChanged={onViewableItemsChanged}
          onContentSizeChange={(_width, height) => {
            const wasAtBottom = atBottomRef.current;
            scrollMetricsRef.current.contentHeight = height;
            updateJumpToLatest();
            if (scrollToLatestAfterSendRef.current) {
              scrollToLatestAfterSendRef.current = false;
              requestAnimationFrame(scrollToLatest);
            } else if ((!targetMessageId || positionedTargetMessageIdRef.current === targetMessageId) && wasAtBottom) {
              listRef.current?.scrollToEnd({ animated: true });
            }
          }}
          ref={listRef}
          // Matches conversation.tsx: Android cell clipping leaves stale colors after a theme change.
          removeClippedSubviews={false}
          renderItem={renderItem}
          viewabilityConfig={viewabilityConfig}
        />
      </TaskLinkBatchProvider>
      {showJumpToLatest ? <Pressable
        accessibilityLabel={`Jump to latest replies${newReplyCount ? `, ${newReplyCount} new replies` : ''}`}
        accessibilityRole="button"
        onPress={() => { hapticLight(); scrollToLatest(); }}
        style={[styles.jumpToLatest, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline, bottom: composerOverlayHeight + Spacing.two }]}
      >
        <PlatformIcon color={theme.text} name="chevron-down" size={20} />
        {newReplyCount ? <ThemedText style={[styles.jumpToLatestCount, { color: theme.text }]} type="captionBold">{newReplyCount > 99 ? '99+' : newReplyCount}</ThemedText> : null}
      </Pressable> : null}
      {!readOnly ? <View
        onLayout={({ nativeEvent }) => {
          const height = Math.ceil(nativeEvent.layout.height);
          setComposerOverlayHeight((current) => current === height ? current : height);
        }}
        style={styles.composerOverlay}>
        <Composer
          activeGroupName={thread.thread.name}
          busy={busy}
          mentionCandidatesHasMore={projectMembersPage.status === 'CanLoadMore'}
          mentionCandidatesLoading={projectMembersPage.status === 'LoadingMore'}
          mentionCandidates={mentionCandidates}
          onCancelReply={() => setReplyTo(null)}
          onChangeText={setComposer}
          onFocus={scrollToLatest}
          onLoadMoreMentionCandidates={() => {
            if (projectMembersPage.status === 'CanLoadMore') projectMembersPage.loadMore(100);
          }}
          onSendMessage={handleSendMessage}
          replyTo={replyTo}
          value={composer}
        />
      </View> : null}
      <OptionsSheet onClose={() => setToolsOpen(false)} title="Thread" visible={toolsOpen}>
        <SheetSection>
          {!navigation.archived ? <SheetRow label={thread.following ? 'Unfollow' : 'Follow'} icon="bell-outline" onPress={() => void changeFollowing()} /> : null}
          {source && !('unavailable' in source) && pid && gid ? <SheetRow
            label="Open source Channel"
            icon="channel"
            onPress={() => { setToolsOpen(false); router.push(channelHref(pid, gid, context, source.messageId) as never); }}
          /> : null}
          {firstLinkedTask && pid ? <SheetRow
            label="View linked Task"
            icon="task"
            onPress={() => { setToolsOpen(false); router.push(taskDetailHref(pid, firstLinkedTask.publicKey, taskIdentity) as never); }}
          /> : null}
          {thread.canManage && !navigation.archived ? <SheetRow label="Rename thread" icon="edit" onPress={() => { setToolsOpen(false); setRenameOpen(true); }} /> : null}
          {thread.canManage && !navigation.archived ? <SheetRow
            label={thread.thread.status === 'active' ? 'Archive' : 'Reopen'}
            icon="clock-outline"
            onPress={() => void changeStatus()}
          /> : null}
        </SheetSection>
      </OptionsSheet>
      <OptionsSheet onClose={() => setRenameOpen(false)} title="Rename thread" visible={renameOpen}>
        <SheetSection>
          <SheetInput autoFocus label="Thread name" maxLength={100} onChangeText={setRenameValue} value={renameValue} />
          <SheetRow label="Save name" icon="check-circle" onPress={() => void saveRename()} />
        </SheetSection>
      </OptionsSheet>
      <MessageActions actions={messageActions} onClose={() => setActionsOpen(false)} visible={actionsOpen} />
      <MessageReportSheet
        busy={reportBusy}
        error={reportError}
        onClose={() => { if (!reportBusy) setReportTarget(null); }}
        onSubmit={(reason, note) => void submitReport(reason, note)}
        visible={Boolean(reportTarget)}
      />
      <MessageTaskReviewSheet
        busy={creatingTaskKey === taskReviewDraft?.idempotencyKey}
        error={taskReviewError}
        onChangeTitle={(title) => setTaskReviewDraft((current) => current ? { ...current, title } : current)}
        onClose={() => { if (!creatingTaskKey) setTaskReviewDraft(null); }}
        onCreate={() => void createReviewedTask()}
        source={taskReviewDraft?.sourceText ?? ''}
        title={taskReviewDraft?.title ?? ''}
        visible={Boolean(taskReviewDraft)}
      />
      <OptionsSheet onClose={() => setEditTarget(null)} title="Edit message" visible={Boolean(editTarget)}>
        <SheetInput autoFocus label="Message" maxLength={10_000} multiline onChangeText={setEditBody} value={editBody} />
        <View style={styles.editActions}>
          <ActionButton disabled={editBusy} label="Cancel" onPress={() => setEditTarget(null)} style={styles.editAction} variant="secondary" />
          <ActionButton
            disabled={editBusy || (!editBody.trim() && !editTarget?.attachments.length)}
            label={editBusy ? 'Saving…' : 'Save changes'}
            loading={editBusy}
            onPress={() => void saveMessageEdit()}
            style={styles.editAction}
          />
        </View>
      </OptionsSheet>
      <ForwardMessageSheet
        busyTargetId={forwardBusyGroupId}
        currentGroupId={gid}
        error={forwardError}
        groups={groups}
        message={forwardTarget}
        onClose={() => { if (!forwardBusyGroupId) setForwardTarget(null); }}
        onForward={(target, note) => { void handleForward(target, note); }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  jumpToLatest: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, boxShadow: '0 3px 10px rgba(0,0,0,0.14)', flexDirection: 'row', gap: Spacing.one, height: TouchTarget, justifyContent: 'center', minWidth: TouchTarget, paddingHorizontal: Spacing.two, position: 'absolute', right: Spacing.three },
  jumpToLatestCount: { textAlign: 'center' },
  headerIdentity: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, maxWidth: 230, minHeight: TouchTarget, paddingHorizontal: Spacing.two },
  headerMark: { alignItems: 'center', borderRadius: Radius.pill, height: 34, justifyContent: 'center', width: 34 },
  archive: { gap: 2, padding: Spacing.three },
  connection: { marginHorizontal: Spacing.three, marginTop: Spacing.two },
  composerOverlay: { bottom: 0, left: 0, position: 'absolute', right: 0, zIndex: 2 },
  editAction: { flex: 1 },
  editActions: { flexDirection: 'row', gap: Spacing.two },
  error: { padding: Spacing.three },
  flex: { flex: 1 },
  headerTitle: { flexShrink: 1, minWidth: 0 },
  list: { flexGrow: 1, paddingVertical: Spacing.two },
  loadMore: { alignItems: 'center', minHeight: TouchTarget, justifyContent: 'center', padding: Spacing.two },
  notice: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  retry: { alignItems: 'center', alignSelf: 'center', borderRadius: 9, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.four },
  screen: { flex: 1 },
  channelBadge: { alignItems: 'center', borderRadius: Radius.pill, flex: 1, flexDirection: 'row', gap: 5, maxWidth: 150, minWidth: 0, paddingHorizontal: Spacing.two, paddingVertical: 4 },
  source: { borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.two, marginHorizontal: Spacing.three, marginTop: Spacing.two, padding: Spacing.three },
  sourceBadge: { alignItems: 'center', borderRadius: Radius.pill, flexDirection: 'row', gap: 5, paddingHorizontal: Spacing.two, paddingVertical: 4 },
  sourceBadges: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: Spacing.one, minWidth: 0 },
  sourceChannel: { flexShrink: 1, minWidth: 0 },
  sourceHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  sourceMeta: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 2 },
  sourcePressed: { opacity: 0.72 },
  sourceTaskLabel: { flex: 1 },
  sourceTaskLink: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.pill, flexDirection: 'row', gap: Spacing.one, maxWidth: '100%', paddingHorizontal: Spacing.two, paddingVertical: 5 },
});
