import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useNetworkState } from 'expo-network';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarInset } from '@/hooks/use-bottom-tab-inset';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, Platform, Pressable, StyleSheet, View, type FlatListProps, type ListRenderItem } from 'react-native';
import { KeyboardEvents, KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { parseMentions } from '@track/shared';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { ActionButton } from '@/components/action-button';
import { Composer } from '@/components/composer';
import { ConnectivityBanner } from '@/components/connectivity-banner';
import { ConversationLoading } from '@/components/conversation-loading';
import { EmptyState } from '@/components/empty-state';
import { PendingMessageBubble } from '@/components/chat/pending-attachment-message';
import { ChatHeaderBackground } from '@/components/chat/chat-header-background';
import {
  JumpToLatestEntering,
  JumpToLatestExiting,
  PendingMessageEntering,
} from '@/components/chat/message-motion';
import { ForwardMessageSheet } from '@/components/forward-message-sheet';
import { IconButton } from '@/components/icon-button';
import { IOSGlassContainer } from '@/components/ios-glass-material';
import { MessageActions } from '@/components/message-actions';
import { MessageReportSheet, type ReportReason } from '@/components/message-report-sheet';
import { MessageTaskReviewSheet } from '@/components/message-task-review-sheet';
import { OptionsSheet, SheetInput, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon, type IconName } from '@/components/platform-icon';
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
import { pendingMessageAcknowledgementKey, type PendingMessage } from '@/lib/pending-messages';
import { usePendingMessageReconciliation } from '@/hooks/use-pending-message-reconciliation';
import { buildMentionCandidates } from '@/lib/mention-autocomplete';
import { useReleaseConfigState } from '@/lib/release-config';
import { taskDetailHref, type MobileTaskIdentity } from '@/lib/task-navigation';
import { assistantTaskDraft, messageTaskDraft, type ReviewableMessageTaskDraft } from '@/lib/message-task-draft';
import { threadConversationHref } from '@/lib/thread-navigation';
import { threadSlug } from '@/lib/thread-name';
import { setActivePushContext } from '@/lib/push-presentation';
import { useComposerDraft } from '@/hooks/use-composer-draft';
import { AnimatedPressable, usePressFeedback } from '@/hooks/use-press-feedback';
import { shouldShowJumpToLatest } from '@/lib/thread-list';
import { TaskLinkBatchProvider } from '@/lib/task-link-context';
import { communicationErrorMessage, taskErrorMessage } from '@/lib/user-facing-error';
import { archivePresentation } from '@/lib/archive-presentation';
import { groupThreadTimeline } from '@/lib/grouped-thread-items';

function ThreadHeaderButton({ accessibilityLabel, icon, onPress }: { accessibilityLabel: string; icon: IconName; onPress: () => void }) {
  if (Platform.OS !== 'ios') return <IconButton accessibilityLabel={accessibilityLabel} icon={icon} onPress={onPress} />;

  return <IconButton accessibilityLabel={accessibilityLabel} appearance="glass" icon={icon} onPress={onPress} />;
}

export default function ThreadScreen() {
  const theme = useTheme();
  const composerClosedOffset = useBottomTabBarInset();
  const safeAreaInsets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { showToast } = useAppToast();
  const router = useRouter();
  const { animatedStyle: jumpButtonPressStyle, onPressIn: jumpButtonPressIn, onPressOut: jumpButtonPressOut } = usePressFeedback({ pressedScale: 0.96 });
  const network = useNetworkState();
  const isOffline = network.isConnected === false || network.isInternetReachable === false;
  const { config: releaseConfig, isLoading: releaseConfigLoading } = useReleaseConfigState();
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
  const deleteMessages = useMutation(api.messages.removeMany);
  const hideDeletedMessages = useMutation(api.messages.hideDeletedForMe);
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
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
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
  const [messageSelectionMode, setMessageSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<Id<'messages'>>>(() => new Set());
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<GroupedThreadItem | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [taskReviewDraft, setTaskReviewDraft] = useState<ReviewableMessageTaskDraft | null>(null);
  const [taskReviewError, setTaskReviewError] = useState<string | null>(null);
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(0);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DetailedMessage | null>(null);
  const [editBody, setEditBody] = useState('');
  const exitMessageSelection = useCallback(() => {
    setMessageSelectionMode(false);
    setSelectedMessageIds(new Set());
    setActionsOpen(false);
    setActionTarget(null);
  }, []);
  const beginMessageSelection = useCallback((item: GroupedThreadItem) => {
    if (item.kind !== 'message') return;
    hapticLight();
    setSelectedMessageIds(new Set([item.item.message._id]));
    setMessageSelectionMode(true);
    setActionTarget(item);
    setActionsOpen(false);
  }, []);
  const toggleMessageSelection = useCallback((item: GroupedThreadItem) => {
    if (item.kind !== 'message') return;
    const id = item.item.message._id;
    const next = new Set(selectedMessageIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedMessageIds(next);
    setActionTarget(next.size ? item : null);
    if (!next.size) setMessageSelectionMode(false);
  }, [selectedMessageIds]);
  useEffect(() => {
    if (Platform.OS !== 'android' || !messageSelectionMode) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      exitMessageSelection();
      return true;
    });
    return () => subscription.remove();
  }, [messageSelectionMode, exitMessageSelection]);
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
  const scrollAfterSendMessageIdRef = useRef<string | null>(null);
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
  const readReceipts = useQuery(
    api.channelThreads.readReceiptSequences,
    queryArgs && !readOnly ? queryArgs : 'skip',
  );
  const pinToLatest = useCallback(() => {
    if (!atBottomRef.current) return;
    const pin = () => {
      const contentHeight = scrollMetricsRef.current.contentHeight;
      if (contentHeight > 0) listRef.current?.scrollToOffset({ animated: false, offset: contentHeight });
      else listRef.current?.scrollToEnd({ animated: false });
    };
    pin();
    requestAnimationFrame(pin);
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
  const scrollToLatest = useCallback((animated = false) => {
    atBottomRef.current = true;
    setNewReplyCount(0);
    if (!animated) setShowJumpToLatest(false);
    const pin = () => {
      const contentHeight = scrollMetricsRef.current.contentHeight;
      if (contentHeight > 0) listRef.current?.scrollToOffset({ animated, offset: contentHeight });
      else listRef.current?.scrollToEnd({ animated });
    };
    pin();
    if (!animated) {
      requestAnimationFrame(pin);
    }
  }, []);
  const updateJumpToLatest = useCallback(() => {
    const { contentHeight, offsetY, viewportHeight } = scrollMetricsRef.current;
    const distanceFromBottom = Math.max(0, contentHeight - offsetY - viewportHeight);
    atBottomRef.current = distanceFromBottom <= 80;
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

  const pendingMessageIdsSignature = pendingMessageAcknowledgementKey(pendingMessages);
  const pendingMessageIds = useMemo(
    () => new Set(pendingMessageIdsSignature ? pendingMessageIdsSignature.split('\0') : []),
    [pendingMessageIdsSignature],
  );

  const threadItems = useMemo<GroupedThreadItem[]>(() => groupThreadTimeline({
    assistantStreams: (assistantStreams ?? []) as Doc<'assistantStreams'>[],
    messages: (messages ?? []) as DetailedMessage[],
    missingAuthorKey: 'unknown',
    pendingMessageIds,
  }), [assistantStreams, messages, pendingMessageIds]);
  const selectedMessages = useMemo(
    () => threadItems.filter((item): item is Extract<GroupedThreadItem, { kind: 'message' }> =>
      item.kind === 'message' && selectedMessageIds.has(item.item.message._id),
    ),
    [selectedMessageIds, threadItems],
  );
  const canDeleteSelectedForEveryone = !readOnly && selectedMessages.length > 0 && selectedMessages.every(({ item }) =>
    !item.message.deletedAt &&
    item.message.authorId === trackUserId &&
    (!pmid || !item.message.authorProjectMemberId || item.message.authorProjectMemberId === pmid),
  );
  const canHideSelectedForMe = selectedMessages.length > 0 && selectedMessages.every(({ item }) => Boolean(item.message.deletedAt));
  const canRemoveSelectedMessages = canDeleteSelectedForEveryone || canHideSelectedForMe;
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
  usePendingMessageReconciliation(messages as DetailedMessage[] | undefined, pendingMessages, setPendingMessages);
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
    const pendingId = payload.messageId ? null : `pending-${sendKey.current}`;
    if (pendingId) {
      atBottomRef.current = true;
      setNewReplyCount(0);
      setShowJumpToLatest(false);
      scrollAfterSendMessageIdRef.current = pendingId;
      setPendingMessages((pending) => pending.some((message) => message.id === pendingId)
        ? pending
        : [...pending, { attachments: payload.attachments, id: pendingId, body, at: Date.now() }]);
    }
    setBusy(true);
    setError(null);
    try {
      const result = await sendComposerMessage({
        ...payload,
        body,
        idempotencyKey: sendKey.current,
        onMessageCreated: (messageId) => {
          if (!pendingId) return;
          setPendingMessages((pending) => pending.map((message) => message.id === pendingId
            ? { ...message, messageId: String(messageId) }
            : message));
        },
        reportProgress: (attachmentId, progress) => {
          payload.reportProgress(attachmentId, progress);
          if (!pendingId) return;
          setPendingMessages((pending) => pending.map((message) => message.id === pendingId
            ? { ...message, attachments: message.attachments?.map((file) => file.id === attachmentId ? { ...file, progress } : file) }
            : message));
        },
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
            attachments: input.attachments,
            idempotencyKey: input.idempotencyKey,
            body: input.body,
            mentions: resolveMentionIds(input.body, memberItems),
            mentionedProjectMemberIds: resolveMentionProjectMemberIds(input.body, memberItems),
            replyToMessageId: input.replyToMessageId,
            notificationPreview: input.body,
          }),
        },
      });

      const sentMessageId = result.messageId;
      if (pendingId) {
        if (sentMessageId) {
          const failedIds = new Set(result.failedIds);
          setPendingMessages((pending) => pending.map((message) => message.id === pendingId
            ? {
                ...message,
                attachments: message.attachments?.filter((file) => !failedIds.has(file.id)),
                messageId: String(sentMessageId),
              }
            : message));
        } else {
          setPendingMessages((pending) => pending.filter((message) => message.id !== pendingId));
        }
      }
      if (sentMessageId && parseMentions(body).includes('track')) {
        requestTrackResponse(sentMessageId, body);
      }
      if (result.failedIds.length === 0) {
        sendKey.current = null;
        sendSignatureRef.current = null;
      }
      return result;
    } catch (sendError) {
      if (pendingId) {
        if (scrollAfterSendMessageIdRef.current === pendingId) scrollAfterSendMessageIdRef.current = null;
        setPendingMessages((pending) => pending.filter((message) => message.id !== pendingId));
      }
      throw sendError;
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

  const buildMessageActions = useCallback((actionTarget: GroupedThreadItem) => {
    if (actionTarget.kind === 'date-sep') return [];
    const selectAction = actionTarget.kind === 'message' && (!readOnly || Boolean(actionTarget.item.message.deletedAt)) ? [{
      label: 'Select message',
      icon: 'check-box-outline' as const,
      onPress: () => beginMessageSelection(actionTarget),
    }] : [];
    if (actionTarget.kind === 'message' && actionTarget.item.message.deletedAt) return selectAction;
    const copyText = actionTarget.kind === 'message'
      ? actionTarget.item.message.body.trim()
      : actionTarget.stream.status === 'failed' ? '' : actionTarget.stream.answer.trim();
    return [
      ...selectAction,
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
      ...(!readOnly && actionTarget.kind === 'message' ? [{ label: 'Reply', icon: 'reply' as const, onPress: () => setReplyTo(actionTarget.item) }] : []),
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
        label: 'Delete for everyone',
        icon: 'trash-can-outline' as const,
        destructive: true,
        onPress: () => beginMessageSelection(actionTarget),
      }] : []),
      { label: 'Report', icon: 'flag' as const, onPress: () => { setReportError(null); setReportTarget(actionTarget); } },
    ];
  }, [beginMessageSelection, copyMessageText, gid, pendingTrackPrompts, pid, pmid, readOnly, releaseConfig.tasks, requestTrackResponse, retryAssistantAnswer, setReplyTo, trackUserId]);
  const messageActions = useMemo(() => actionTarget ? buildMessageActions(actionTarget) : [], [actionTarget, buildMessageActions]);

  const deleteSelectedMessages = useCallback(() => {
    if (!trackUserId || !canRemoveSelectedMessages || bulkDeleteBusy) return;
    const messageIds = selectedMessages.map(({ item }) => item.message._id);
    const selectedIds = new Set(messageIds);
    const hideForMe = canHideSelectedForMe;
    const title = hideForMe
      ? messageIds.length === 1 ? 'Delete this message for me?' : `Delete ${messageIds.length} messages for me?`
      : messageIds.length === 1 ? 'Delete this message for everyone?' : `Delete ${messageIds.length} messages for everyone?`;
    const confirmLabel = hideForMe ? 'Delete for me' : 'Delete for everyone';
    const detail = hideForMe
      ? 'These deleted-message notices will be hidden only for you.'
      : 'The selected message content and attachments will be removed for everyone. You can’t undo this.';
    Alert.alert(title, detail, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: () => {
          setBulkDeleteBusy(true);
          const scope = { messageIds, actorId: trackUserId, actingCompanyId: cid, projectMemberId: pmid };
          const request = hideForMe ? hideDeletedMessages(scope) : deleteMessages(scope);
          void request.then(() => {
            if (replyMessageId && selectedIds.has(replyMessageId)) setReplyTo(null);
            exitMessageSelection();
            showToast({
              title: hideForMe ? 'Hidden for you' : messageIds.length === 1 ? 'Message deleted' : 'Messages deleted',
              message: hideForMe
                ? `${messageIds.length} deleted ${messageIds.length === 1 ? 'message is' : 'messages are'} hidden only for you.`
                : `${messageIds.length} ${messageIds.length === 1 ? 'message was' : 'messages were'} deleted for everyone.`,
              tone: 'success',
            });
          }).catch((caught) => {
            setError(communicationErrorMessage(caught, 'delete these messages'));
          }).finally(() => setBulkDeleteBusy(false));
        },
      },
    ]);
  }, [bulkDeleteBusy, canHideSelectedForMe, canRemoveSelectedMessages, cid, deleteMessages, exitMessageSelection, hideDeletedMessages, pmid, replyMessageId, selectedMessages, setReplyTo, showToast, trackUserId]);

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
        contextActions={Platform.OS === 'ios' && item.kind === 'message' ? buildMessageActions(item) : undefined}
        isFirstInGroup={item.isFirstInGroup}
        isOwnMessage={item.kind === 'message' && item.item.author?._id === trackUserId}
        item={item}
        selected={item.kind === 'message' && selectedMessageIds.has(item.item.message._id)}
        selectionMode={messageSelectionMode}
        onPressMessage={messageSelectionMode && item.kind === 'message' ? () => toggleMessageSelection(item) : undefined}
        readReceipts={readReceipts}
        onLongPress={() => {
          if (item.kind === 'message' && messageSelectionMode) {
            toggleMessageSelection(item);
            return;
          }
          hapticLight();
          setActionTarget(item);
          setActionsOpen(true);
        }}
        onSwipeReply={readOnly || messageSelectionMode || item.kind !== 'message' ? undefined : () => setReplyTo(item.item)}
        onSwipeForward={!readOnly && !messageSelectionMode && item.kind === 'message' && !item.item.message.deletedAt ? () => { hapticLight(); setForwardError(null); setForwardTarget(item.item); } : undefined}
        onSwipeReport={messageSelectionMode ? undefined : () => { void submitSwipeReport(item); }}
        onPressReply={!messageSelectionMode && item.kind === 'message' && item.item.replyTo ? () => {
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
  }, [beginMessageSelection, buildMessageActions, highlightedMessageId, messageSelectionMode, pid, readOnly, releaseConfig.tasks, scrollToMessage, selectedMessageIds, setReplyTo, submitSwipeReport, taskIdentity, toggleMessageSelection, trackUserId]);

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

  if (releaseConfigLoading && isOffline) {
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
  if (releaseConfigLoading) {
    return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Thread' }} /><ConversationLoading label="Loading thread" variant="thread" /></ThemedView>;
  }
  if (!releaseConfig.threads || (navigation && !navigation.available) || thread === null) {
    return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Thread unavailable' }} /><EmptyState body={navigationUnavailableCopy(Boolean(cid))} icon="thread" title="Thread unavailable or access changed" /></ThemedView>;
  }
  if (isOffline && thread === undefined) {
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
  const connectedThreadName = `#${threadSlug(thread.thread.name)}`;
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

  const goBackToChannel = () => {
    if (router.canGoBack()) router.back();
    else if (pid && gid) router.replace(channelHref(pid, gid, context) as never);
  };
  const hasThreadTools = !navigation.archived
    || Boolean(source && !('unavailable' in source) && pid && gid)
    || Boolean(firstLinkedTask && pid);
  const headerSelectionActions = selectedMessages.length === 1 && !selectedMessages[0]?.item.message.deletedAt
    ? messageActions.filter((action) => ['Reply', 'Forward'].includes(action.label))
    : [];

  return (
    <ThemedView style={[styles.screen, { backgroundColor: theme.homeSurface }]}>
      <Stack.Screen options={{
        headerShown: Platform.OS !== 'ios',
        headerTransparent: true,
        headerBlurEffect: 'none',
        headerBackground: () => <ChatHeaderBackground />,
        headerTitle: () => messageSelectionMode ? (
          <ThemedText accessibilityLabel={`${selectedMessages.length} ${selectedMessages.length === 1 ? 'message' : 'messages'} selected`} type="title">{selectedMessages.length}</ThemedText>
        ) : <View style={[styles.headerIdentity, Platform.OS === 'android' && styles.iosHeaderIdentity, { backgroundColor: Platform.OS === 'android' ? theme.homeSurface : 'transparent', borderColor: theme.homeBorder }]}>
          <View style={[styles.headerMark, { backgroundColor: Platform.OS === 'ios' ? 'transparent' : theme.accentSoft }]}><PlatformIcon color={theme.accentStrong} name="thread" size={18} /></View>
          <View style={styles.headerTitle}>
            <ThemedText numberOfLines={1} type="title">{thread.thread.name}</ThemedText>
            <ThemedText accessibilityLabel={`Thread ${connectedThreadName} in Channel #${channelName}`} numberOfLines={1} themeColor="textSecondary" type="caption">{connectedThreadName}</ThemedText>
          </View>
        </View>,
        headerLeft: () => messageSelectionMode
          ? <IconButton accessibilityLabel="Cancel message selection" appearance="surface" icon="close" onPress={exitMessageSelection} />
          : <IconButton accessibilityLabel="Back to Channel" appearance="surface" icon="arrow-left" onPress={goBackToChannel} />,
        headerRight: messageSelectionMode ? () => <View style={styles.headerActions}>
          {headerSelectionActions.map((action) => action.icon ? <IconButton
            accessibilityLabel={action.label}
            appearance="surface"
            icon={action.icon}
            key={action.label}
            onPress={() => {
              exitMessageSelection();
              action.onPress();
            }}
          /> : null)}
          {canRemoveSelectedMessages ? <IconButton
            accessibilityLabel={`Delete ${selectedMessages.length} ${selectedMessages.length === 1 ? 'message' : 'messages'} ${canHideSelectedForMe ? 'for me' : 'for everyone'}`}
            appearance="surface"
            icon="trash-can-outline"
            loading={bulkDeleteBusy}
            onPress={deleteSelectedMessages}
          /> : null}
        </View> : hasThreadTools ? () => <IconButton accessibilityLabel="Thread options" appearance="surface" icon="dots-horizontal" onPress={() => setToolsOpen(true)} /> : undefined,
      }} />
      {Platform.OS === 'ios' ? <IOSGlassContainer spacing={Spacing.two} style={[styles.iosHeader, { backgroundColor: 'transparent', paddingTop: safeAreaInsets.top + Spacing.one }]}>
        {messageSelectionMode ? <>
          <ThreadHeaderButton accessibilityLabel="Cancel message selection" icon="close" onPress={exitMessageSelection} />
          <View style={styles.selectionHeaderTitle}>
            <ThemedText accessibilityLabel={`${selectedMessages.length} ${selectedMessages.length === 1 ? 'message' : 'messages'} selected`} type="title">{selectedMessages.length}</ThemedText>
          </View>
          <View style={styles.headerActions}>
            {headerSelectionActions.map((action) => action.icon ? <IconButton
              accessibilityLabel={action.label}
              appearance="glass"
              icon={action.icon}
              key={action.label}
              onPress={() => { exitMessageSelection(); action.onPress(); }}
            /> : null)}
            {canRemoveSelectedMessages ? <IconButton
              accessibilityLabel={`Delete ${selectedMessages.length} ${selectedMessages.length === 1 ? 'message' : 'messages'} ${canHideSelectedForMe ? 'for me' : 'for everyone'}`}
              appearance="glass"
              icon="trash-can-outline"
              loading={bulkDeleteBusy}
              onPress={deleteSelectedMessages}
            /> : null}
          </View>
        </> : <>
        <ThreadHeaderButton accessibilityLabel="Back to Channel" icon="arrow-left" onPress={goBackToChannel} />
        <View style={[styles.headerIdentity, styles.iosHeaderIdentity, { backgroundColor: 'transparent', borderColor: theme.homeBorder }]}>
          <View style={[styles.headerMark, { backgroundColor: 'transparent' }]}><PlatformIcon color={theme.accentStrong} name="thread" size={18} /></View>
          <View style={styles.headerTitle}>
            <ThemedText numberOfLines={1} type="title">{thread.thread.name}</ThemedText>
            <ThemedText accessibilityLabel={`Thread ${connectedThreadName} in Channel #${channelName}`} numberOfLines={1} themeColor="textSecondary" type="caption">{connectedThreadName}</ThemedText>
          </View>
        </View>
        {hasThreadTools ? <ThreadHeaderButton accessibilityLabel="Thread options" icon="dots-horizontal" onPress={() => setToolsOpen(true)} /> : <View style={styles.headerButtonSpacer} />}
        </>}
      </IOSGlassContainer> : null}
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
          contentContainerStyle={[styles.list, { paddingBottom: composerOverlayHeight + Spacing.two }]}
          contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'never' : 'automatic'}
          showsVerticalScrollIndicator={false}
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
          ListFooterComponent={pendingMessages.length ? (
            <View>
              {pendingMessages.map((message) => (
                <Animated.View
                  entering={reducedMotion ? undefined : PendingMessageEntering}
                  key={message.id}
                  onLayout={() => {
                    if (scrollAfterSendMessageIdRef.current !== message.id) return;
                    scrollAfterSendMessageIdRef.current = null;
                    scrollToLatest();
                  }}
                >
                  <PendingMessageBubble at={message.at} attachments={message.attachments} body={message.body} offline={network.isConnected === false || network.isInternetReachable === false} />
                </Animated.View>
              ))}
            </View>
          ) : null}
          onScrollToIndexFailed={({ averageItemLength, index }) => requestAnimationFrame(() => {
            if (index >= threadItems.length - 1) {
              listRef.current?.scrollToOffset({ animated: false, offset: averageItemLength * index });
              requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
              return;
            }
            listRef.current?.scrollToIndex({ animated: false, index, viewPosition: 0.5 });
          })}
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
            if ((!targetMessageId || positionedTargetMessageIdRef.current === targetMessageId) && wasAtBottom) {
              scrollToLatest();
            }
          }}
          ref={listRef}
          // Matches conversation.tsx: Android cell clipping leaves stale colors after a theme change.
          removeClippedSubviews={false}
          renderItem={renderItem}
          viewabilityConfig={viewabilityConfig}
        />
      </TaskLinkBatchProvider>
      {showJumpToLatest ? <AnimatedPressable
        accessibilityLabel={`Jump to latest replies${newReplyCount ? `, ${newReplyCount} new replies` : ''}`}
        accessibilityRole="button"
        entering={reducedMotion ? undefined : JumpToLatestEntering}
        exiting={reducedMotion ? undefined : JumpToLatestExiting}
        onPressIn={jumpButtonPressIn}
        onPressOut={jumpButtonPressOut}
        onPress={() => { hapticLight(); scrollToLatest(!reducedMotion); }}
        style={[styles.jumpToLatest, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline, bottom: composerOverlayHeight + Spacing.two }, jumpButtonPressStyle]}
      >
        <PlatformIcon color={theme.text} name="chevron-down" size={20} />
        {newReplyCount ? <ThemedText style={[styles.jumpToLatestCount, { color: theme.text }]} type="captionBold">{newReplyCount > 99 ? '99+' : newReplyCount}</ThemedText> : null}
      </AnimatedPressable> : null}
      {!readOnly ? <KeyboardStickyView
        offset={{ closed: -composerClosedOffset, opened: 0 }}
        style={styles.composerOverlay}>
        <View
          onLayout={({ nativeEvent }) => {
            const height = Math.ceil(nativeEvent.layout.height);
            setComposerOverlayHeight((current) => current === height ? current : height);
          }}
        >
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
        </View>
      </KeyboardStickyView> : null}
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
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  headerButtonSpacer: { width: TouchTarget },
  iosHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingBottom: Spacing.two, paddingHorizontal: Spacing.three },
  iosHeaderIdentity: { alignSelf: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flex: 1, maxWidth: 230, minWidth: 0, overflow: 'hidden' },
  selectionHeaderTitle: { alignItems: 'center', flex: 1, minWidth: 0 },
  jumpToLatest: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, boxShadow: '0 3px 10px rgba(0,0,0,0.14)', flexDirection: 'row', gap: Spacing.one, height: TouchTarget, justifyContent: 'center', minWidth: TouchTarget, paddingHorizontal: Spacing.two, position: 'absolute', right: Spacing.three },
  jumpToLatestCount: { textAlign: 'center' },
  headerIdentity: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: Spacing.two, maxWidth: 230, minHeight: TouchTarget, minWidth: 0, paddingHorizontal: Spacing.two },
  headerMark: { alignItems: 'center', borderRadius: Radius.pill, flexShrink: 0, height: 34, justifyContent: 'center', width: 34 },
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
