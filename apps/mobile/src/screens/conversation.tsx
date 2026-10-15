import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useNetworkState } from 'expo-network';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, Platform, Pressable, StyleSheet, View, type FlatListProps, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarInset } from '@/hooks/use-bottom-tab-inset';
import * as Clipboard from 'expo-clipboard';
import { KeyboardEvents, KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { parseMentions, resolveDistinctChannelIconKeys } from '@track/shared';
import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { ActionButton } from '@/components/action-button';
import { useTrackUser } from '@/contexts/track-user-context';
import { useAppToast } from '@/components/app-toast';
import { Composer } from '@/components/composer';
import { ConnectivityBanner } from '@/components/connectivity-banner';
import { ConversationLoading } from '@/components/conversation-loading';
import { PendingMessageBubble } from '@/components/chat/pending-attachment-message';
import { ChatHeaderBackground } from '@/components/chat/chat-header-background';
import {
  JumpToLatestEntering,
  JumpToLatestExiting,
  PendingMessageEntering,
} from '@/components/chat/message-motion';
import { ChannelHeaderIdentity, ChannelPickerPill, ConversationSearchPill } from '@/components/chat/conversation-header-controls';
import { EntityMark } from '@/components/entity-mark';
import { IconButton } from '@/components/icon-button';
import { MessageActions } from '@/components/message-actions';
import { ForwardMessageSheet } from '@/components/forward-message-sheet';
import { MessageReportSheet, type ReportReason } from '@/components/message-report-sheet';
import { MessageTaskReviewSheet } from '@/components/message-task-review-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { TaskInlineCards } from '@/components/task-inline-cards';
import { TaskLinkBatchProvider } from '@/lib/task-link-context';
import { DateSeparator, ThreadRow, type DetailedMessage, type GroupedThreadItem, resolveMentionIds } from '@/components/thread-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { OptionsSheet, SheetInput, SheetSection, SheetRow } from '@/components/options-sheet';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { sendComposerMessage, type ComposerSubmission, type ComposerSubmissionResult } from '@/lib/attachment-upload';
import { hapticLight, hapticMedium, hapticSuccess } from '@/lib/haptics';
import { idempotencyKey } from '@/lib/idempotency';
import { useTheme } from '@/hooks/use-theme';
import { channelHref, navigationUnavailableCopy, projectChannelsHref } from '@/lib/company-navigation';
import { buildMentionCandidates } from '@/lib/mention-autocomplete';
import { groupThreadTimeline } from '@/lib/grouped-thread-items';
import { shouldShowJumpToLatest } from '@/lib/thread-list';
import { canOpenExistingThread, useReleaseConfigState } from '@/lib/release-config';
import type { MobileTaskIdentity } from '@/lib/task-navigation';
import { assistantTaskDraft, messageTaskDraft, type ReviewableMessageTaskDraft } from '@/lib/message-task-draft';
import { threadConversationHref } from '@/lib/thread-navigation';
import { setActivePushContext } from '@/lib/push-presentation';
import { communicationErrorMessage, taskErrorMessage } from '@/lib/user-facing-error';
import { useComposerDraft } from '@/hooks/use-composer-draft';
import { AnimatedPressable, usePressFeedback } from '@/hooks/use-press-feedback';
import { pendingMessageAcknowledgementKey, type PendingMessage } from '@/lib/pending-messages';
import { usePendingMessageReconciliation } from '@/hooks/use-pending-message-reconciliation';
import { archivePresentation } from '@/lib/archive-presentation';
import { isAutoAttachmentBody } from '@/lib/attachment-presentation';

export default function ConversationScreen() {
  const theme = useTheme();
  const composerClosedOffset = useBottomTabBarInset();
  const conversationHeaderTint = Platform.OS === 'android' ? theme.homeSurface : 'transparent';
  const { animatedStyle: channelHeaderPressStyle, onPressIn: channelHeaderPressIn, onPressOut: channelHeaderPressOut } = usePressFeedback({ pressedScale: 0.985 });
  const { animatedStyle: jumpButtonPressStyle, onPressIn: jumpButtonPressIn, onPressOut: jumpButtonPressOut } = usePressFeedback({ pressedScale: 0.96 });
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();
  const network = useNetworkState();
  const router = useRouter();
  const { trackUserId } = useTrackUser();
  const { config: releaseConfig, isLoading: releaseConfigLoading } = useReleaseConfigState();
  const { groupId, projectId, companyId, membershipId, archive, messageId } = useLocalSearchParams<{ groupId: string; projectId: string; companyId?: string; membershipId?: string; archive?: string; messageId?: string }>();

  const sendMessage = useMutation(api.messages.send);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const claimUploadIntent = useMutation(api.messages.claimUploadIntent);
  const attachFile = useMutation(api.messages.attachFile);
  const askTrack = useAction(api.assistant.ask);
  const markRead = useMutation(api.mobile.markGroupRead);
  const setLastActive = useMutation(api.mobile.setLastActiveContext);
  const setGlobalNotif = useMutation(api.notifications.setGlobalMode);
  const setGroupNotif = useMutation(api.notifications.setGroupMode);
  const createReport = useMutation(api.reports.create);
  const forwardMessage = useMutation(api.messages.forwardMessage);
  const createTask = useMutation(api.tasks.create);
  const deleteMessages = useMutation(api.messages.removeMany);
  const hideDeletedMessages = useMutation(api.messages.hideDeletedForMe);
  const editMessage = useMutation(api.messages.edit);

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
  const archiveContext = archive === '1' || navigation?.readStateImmutable === true || navigation?.project?.status === 'archived';
  const readOnly = archiveContext || navigation?.archived === true;
  const archiveBanner = readOnly ? archivePresentation(navigation?.archiveDetails ?? null) : null;
  const channelContext = useMemo(() => cid && pmid ? { archived: archiveContext, companyId: cid, membershipId: pmid } : null, [archiveContext, cid, pmid]);
  // Memoised so composing a message does not rebuild every row's identity props.
  const taskIdentity = useMemo<MobileTaskIdentity | null>(() => cid && pmid ? {
    archived: readOnly,
    companyId: cid,
    membershipId: pmid,
  } : null, [cid, pmid, readOnly]);

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
  const assistantPage = usePaginatedQuery(
    api.assistant.listForGroupPage,
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
  const readReceipts = useQuery(
    api.messages.readReceiptSequences,
    trackUserId && gid && navigation?.available && !readOnly
      ? { userId: trackUserId, groupId: gid, actingCompanyId: cid, projectMemberId: pmid }
      : 'skip',
  );
  const messages = messagePage.status === 'LoadingFirstPage' ? undefined : messagePage.results;
  const assistantStreams = assistantPage.status === 'LoadingFirstPage' ? undefined : assistantPage.results;
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
  const [channelSearchOpen, setChannelSearchOpen] = useState(false);
  const [channelSearchText, setChannelSearchText] = useState('');
  const channelSearchQuery = channelSearchText.trim();
  const channelSearch = useQuery(api.search.project,
    trackUserId && pid && gid && navigation?.available && channelSearchOpen && channelSearchQuery.length >= 2
      ? {
          actingCompanyId: cid,
          filter: 'messages',
          groupId: gid,
          limit: 12,
          projectId: pid,
          projectMemberId: pmid,
          query: channelSearchQuery,
          userId: trackUserId,
        }
      : 'skip',
  );
  const listRef = useRef<FlatList<GroupedThreadItem>>(null);
  /** Tracks whether the reader is pinned to the newest message, so arriving messages never yank them off history. */
  const atBottomRef = useRef(true);
  const screenActiveRef = useRef(false);
  const viewedMessageIdRef = useRef<Id<'messages'> | null>(null);
  const acknowledgedMessageIdRef = useRef<Id<'messages'> | null>(null);
  const acknowledgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<Id<'messages'> | null>(null);
  const handledTargetMessageIdRef = useRef<Id<'messages'> | null>(null);
  const positionedTargetMessageIdRef = useRef<Id<'messages'> | null>(null);
  const scrollAfterSendMessageIdRef = useRef<string | null>(null);
  const pinToLatestAfterSendRef = useRef(false);
  const pinToLatestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(0);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const scrollMetricsRef = useRef({ contentHeight: 0, offsetY: 0, viewportHeight: 0 });
  const knownMessageIdsRef = useRef<Set<Id<'messages'>> | null>(null);
  const knownAssistantStreamsRef = useRef<Map<Id<'assistantStreams'>, string> | null>(null);
  const newestFeedTimeRef = useRef(0);


  const sendKey = useRef<string | null>(null);
  const sendSignatureRef = useRef<string | null>(null);
  const [replySelection, setReplySelection] = useState<{ scopeKey: string; message: DetailedMessage } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creatingTaskKey, setCreatingTaskKey] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [pendingTrackPrompts, setPendingTrackPrompts] = useState<Set<Id<'messages'>>>(new Set());
  const pendingTrackPromptIdsRef = useRef(new Set<Id<'messages'>>());
  const [toolsOpen, setToolsOpen] = useState(false);
  const [groupSwitchOpen, setGroupSwitchOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<GroupedThreadItem | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<GroupedThreadItem | null>(null);
  const [messageSelectionMode, setMessageSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<Id<'messages'>>>(() => new Set());
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [taskReviewDraft, setTaskReviewDraft] = useState<ReviewableMessageTaskDraft | null>(null);
  const [taskReviewError, setTaskReviewError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<DetailedMessage | null>(null);
  const [editBody, setEditBody] = useState('');
  const exitMessageSelection = useCallback(() => {
    setMessageSelectionMode(false);
    setSelectedMessageIds(new Set());
    setActionSheetOpen(false);
    setActionTarget(null);
  }, []);
  const beginMessageSelection = useCallback((item: GroupedThreadItem) => {
    if (item.kind !== 'message' || (readOnly && !item.item.message.deletedAt)) return;
    hapticLight();
    setSelectedMessageIds(new Set([item.item.message._id]));
    setMessageSelectionMode(true);
    setActionTarget(item);
    setActionSheetOpen(false);
  }, [readOnly]);
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
    if (Platform.OS !== 'android' || (!messageSelectionMode && !channelSearchOpen)) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (messageSelectionMode) {
        exitMessageSelection();
      } else {
        setChannelSearchOpen(false);
        setChannelSearchText('');
      }
      return true;
    });
    return () => subscription.remove();
  }, [messageSelectionMode, channelSearchOpen, exitMessageSelection]);
  const [editBusy, setEditBusy] = useState(false);
  const [forwardTarget, setForwardTarget] = useState<DetailedMessage | null>(null);
  const [forwardBusyGroupId, setForwardBusyGroupId] = useState<Id<'groups'> | null>(null);
  const [forwardError, setForwardError] = useState<string | null>(null);
  /**
   * Rows that render task cards below them; those cards interrupt author
   * grouping. Rows only report while mounted, so scrolling never regroups.
   */
  const [cardRowIds, setCardRowIds] = useState<ReadonlySet<string>>(() => new Set());
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
  const trackCardRow = useCallback((rowId: string, hasCards: boolean) => {
    setCardRowIds((prev) => {
      if (prev.has(rowId) === hasCards) return prev;
      const next = new Set(prev);
      if (hasCards) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  }, []);

  const groupItems = useMemo(() => (groups ?? []) as { group: Doc<'groups'>; membership: Doc<'groupMembers'>; lastMessage: Doc<'messages'> | null; unreadCount: number }[], [groups]);
  const channelIconKeys = useMemo(() => resolveDistinctChannelIconKeys(groupItems.map(({ group }) => ({
    id: String(group._id),
    iconKey: group.markIconKey,
    name: group.name,
  }))), [groupItems]);
  const memberItems = useMemo(() => projectMembers ?? [], [projectMembers]);
  const activeGroupMark = groupItems.find((g) => g.group._id === gid)?.group;
  const activeGroup = activeGroupMark ?? navigation?.channel ?? null;
  const activeGroupIconKey = channelIconKeys.get(String(activeGroup?._id ?? gid)) ?? activeGroupMark?.markIconKey;
  const globalMode = notifSettings?.global?.globalMode ?? 'all';
  const groupMode = notifSettings?.groups?.find((g) => g.groupId === gid)?.mode ?? 'inherit';

  const pendingMessageIdsSignature = pendingMessageAcknowledgementKey(pendingMessages);
  const pendingMessageIds = useMemo(
    () => new Set(pendingMessageIdsSignature ? pendingMessageIdsSignature.split('\0') : []),
    [pendingMessageIdsSignature],
  );

  const threadItems = useMemo<GroupedThreadItem[]>(() => groupThreadTimeline({
    assistantStreams: (assistantStreams ?? []) as Doc<'assistantStreams'>[],
    cardRowIds,
    deduplicateAssistantStreams: true,
    messages: (messages ?? []) as DetailedMessage[],
    missingAuthorKey: 'anon',
    pendingMessageIds,
  }), [assistantStreams, cardRowIds, messages, pendingMessageIds]);
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
    if (!atBottomRef.current && !pinToLatestAfterSendRef.current) return;
    const pin = () => {
      const contentHeight = scrollMetricsRef.current.contentHeight;
      if (contentHeight > 0) listRef.current?.scrollToOffset({ animated: false, offset: contentHeight });
      else listRef.current?.scrollToEnd({ animated: false });
    };
    pin();
    requestAnimationFrame(pin);
  }, []);
  const scrollToLatest = useCallback((animated = false) => {
    atBottomRef.current = true;
    setNewMessageCount(0);
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
    if (atBottomRef.current) setNewMessageCount(0);
    setShowJumpToLatest(shouldShowJumpToLatest(distanceFromBottom));
  }, []);
  const stopFollowingAfterUserScroll = useCallback(() => {
    atBottomRef.current = false;
    pinToLatestAfterSendRef.current = false;
    scrollAfterSendMessageIdRef.current = null;
    if (pinToLatestTimeoutRef.current) clearTimeout(pinToLatestTimeoutRef.current);
    pinToLatestTimeoutRef.current = null;
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
    if (!targetMessageId) {
      handledTargetMessageIdRef.current = null;
      positionedTargetMessageIdRef.current = null;
      return;
    }
    if (targetMessageId !== handledTargetMessageIdRef.current) {
      handledTargetMessageIdRef.current = null;
      positionedTargetMessageIdRef.current = null;
    }
    if (handledTargetMessageIdRef.current === targetMessageId) return;
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
    const index = threadItemsRef.current.findIndex((item) => item.kind === 'message' && item.item.message._id === messageId);
    if (index >= 0) {
      setHighlightedMessageId(messageId);
      listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 });
      return;
    }
    if (pid && gid) router.replace(channelHref(pid, gid, channelContext, messageId) as never);
  }, [channelContext, gid, pid, router]);

  const hasMoreMessages = messagePage.status === 'CanLoadMore' || assistantPage.status === 'CanLoadMore';
  const loadingOlderMessages = messagePage.status === 'LoadingMore' || assistantPage.status === 'LoadingMore';
  const loadOlderMessages = useCallback(() => {
    if (!hasMoreMessages || loadingOlderMessages) return;
    if (messagePage.status === 'CanLoadMore') messagePage.loadMore(120);
    if (assistantPage.status === 'CanLoadMore') assistantPage.loadMore(120);
  }, [assistantPage, hasMoreMessages, loadingOlderMessages, messagePage]);

  const copyMessageText = useCallback(async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      showToast({ title: 'Copied', message: 'Message text copied to your clipboard.', tone: 'success' });
    } catch {
      showToast({ title: 'Could not copy', message: 'Try selecting the message text and copying it again.', tone: 'error' });
    }
  }, [showToast]);

  const requestTrackResponse = useCallback((promptMessageId: Id<'messages'>, question: string) => {
    if (readOnly || !trackUserId || !pid || !gid) return;
    if (pendingTrackPromptIdsRef.current.has(promptMessageId)) return;
    pendingTrackPromptIdsRef.current.add(promptMessageId);
    setPendingTrackPrompts((current) => new Set(current).add(promptMessageId));
    void askTrack({
      actingCompanyId: cid,
      groupId: gid,
      projectId: pid,
      projectMemberId: pmid,
      promptMessageId,
      question,
      requesterId: trackUserId,
    }).catch(() => {
      showToast({ title: 'Track could not start', message: 'Your message is still in the Channel. Use its message actions to retry Track; it was not sent again.', tone: 'error' });
    }).finally(() => {
      pendingTrackPromptIdsRef.current.delete(promptMessageId);
      setPendingTrackPrompts((current) => {
        const next = new Set(current);
        next.delete(promptMessageId);
        return next;
      });
    });
  }, [askTrack, cid, gid, pid, pmid, readOnly, showToast, trackUserId]);

  const retryAssistantAnswer = useCallback((stream: Doc<'assistantStreams'>) => {
    const prompt = threadItems.find((entry) => entry.kind === 'message' && entry.item.message._id === stream.promptMessageId);
    if (!prompt || prompt.kind !== 'message') {
      showToast({ title: 'Question unavailable', message: 'The original question is not loaded in this Channel.', tone: 'error' });
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
    const existingThread = actionTarget.kind === 'message' ? actionTarget.item.channelThread : null;
    const copyText = actionTarget.kind === 'message'
      ? actionTarget.item.message.body.trim()
      : actionTarget.stream.status === 'failed' ? '' : actionTarget.stream.answer.trim();
    return [
      ...selectAction,
      ...(copyText ? [{
        label: 'Copy message',
        icon: 'content-copy' as const,
        onPress: () => { void copyMessageText(copyText); },
      }] : []),
      ...(actionTarget.kind === 'message' &&
        !readOnly &&
        parseMentions(actionTarget.item.message.body).includes('track') &&
        !actionTarget.item.message.trackInvocationId &&
        !pendingTrackPrompts.has(actionTarget.item.message._id) ? [{
        label: 'Retry Track response',
        icon: 'refresh' as const,
        onPress: () => requestTrackResponse(actionTarget.item.message._id, actionTarget.item.message.body),
      }] : []),
      ...(canOpenExistingThread(releaseConfigLoading, releaseConfig.threads) && actionTarget.kind === 'message' && existingThread && pid && gid ? [{
        label: 'Open thread',
        icon: 'thread' as const,
        onPress: () => {
          router.push(threadConversationHref(pid, gid, existingThread.threadId, cid && pmid ? { companyId: cid, membershipId: pmid, archived: archiveContext } : null) as never);
        },
      }] : []),
      ...(!readOnly ? [{
        label: 'Reply',
        icon: 'reply' as const,
        onPress: () => {
          if (actionTarget.kind === 'message') setReplyTo(actionTarget.item);
        },
      }] : []),
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
      ...(!readOnly && actionTarget.kind === 'message' ? [{
        label: 'Forward',
        icon: 'forward' as const,
        onPress: () => {
          setForwardError(null);
          setForwardTarget(actionTarget.item);
        },
      }] : []),
      ...(!readOnly && actionTarget.kind === 'assistant' && actionTarget.stream.status === 'failed' && actionTarget.stream.promptMessageId && !pendingTrackPrompts.has(actionTarget.stream.promptMessageId) ? [{
        label: 'Retry Track response',
        icon: 'refresh' as const,
        onPress: () => retryAssistantAnswer(actionTarget.stream),
      }] : []),
      ...(!readOnly &&
        actionTarget.kind === 'message' &&
        actionTarget.item.message.authorId === trackUserId &&
        (!pmid || !actionTarget.item.message.authorProjectMemberId ||
          actionTarget.item.message.authorProjectMemberId === pmid) ? [{
        label: 'Edit message',
        icon: 'edit' as const,
        onPress: () => {
          const target = actionTarget.item;
          const attachmentNames = target.attachments.map(({ attachment }) => attachment.filename);
          const emptyAttachmentBody = target.attachments.length > 0 && isAutoAttachmentBody(target.message.body, attachmentNames);
          setEditTarget(target);
          setEditBody(emptyAttachmentBody ? '' : target.message.body);
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
      {
        label: 'Report',
        icon: 'flag' as const,
        onPress: () => { setReportError(null); setReportTarget(actionTarget); },
      },
    ];
  }, [archiveContext, beginMessageSelection, cid, copyMessageText, gid, pendingTrackPrompts, pid, pmid, readOnly, releaseConfig.tasks, releaseConfig.threads, releaseConfigLoading, requestTrackResponse, retryAssistantAnswer, router, setReplyTo, showToast, trackUserId]);
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
          }).catch(() => {
            showToast({ title: 'Messages not deleted', message: 'Check your connection and try again.', tone: 'error' });
          }).finally(() => setBulkDeleteBusy(false));
        },
      },
    ]);
  }, [bulkDeleteBusy, canHideSelectedForMe, canRemoveSelectedMessages, cid, deleteMessages, exitMessageSelection, hideDeletedMessages, pmid, replyMessageId, selectedMessages, setReplyTo, showToast, trackUserId]);

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

  usePendingMessageReconciliation(messages as DetailedMessage[] | undefined, pendingMessages, setPendingMessages);

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
      const newIncomingMessages = messageItems.filter(({ message }) => (
        !previousMessageIds.has(message._id) &&
        message.authorId !== trackUserId &&
        message.createdAt >= previousNewestTime
      ));
      const newAssistantAnswers = streams.filter((stream) => {
        const previous = previousStreams.get(stream._id);
        const completed = stream.status === 'completed' && Boolean(stream.answer.trim());
        return completed && (
          previous === 'queued' ||
          previous === 'running' ||
          (!previous && stream.createdAt >= previousNewestTime)
        );
      });

      if (screenActiveRef.current) {
        if (newIncomingMessages.length) hapticLight();
        if (newAssistantAnswers.length) hapticSuccess();
      }
      if (!atBottomRef.current && (newIncomingMessages.length || newAssistantAnswers.length)) {
        setNewMessageCount((count) => count + newIncomingMessages.length + newAssistantAnswers.length);
      }

      knownMessageIdsRef.current = new Set([...previousMessageIds, ...currentMessageIds]);
      knownAssistantStreamsRef.current = new Map([...previousStreams, ...currentStreams]);
    } else {
      knownMessageIdsRef.current = currentMessageIds;
      knownAssistantStreamsRef.current = currentStreams;
    }
    newestFeedTimeRef.current = newestTime;
  }, [assistantStreams, messages, trackUserId]);

  useEffect(() => () => {
    if (acknowledgeTimeoutRef.current) clearTimeout(acknowledgeTimeoutRef.current);
    if (pinToLatestTimeoutRef.current) clearTimeout(pinToLatestTimeoutRef.current);
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
    if (!trackUserId || !gid || readOnly || !screenActiveRef.current) return;
    if (viewedMessageId === acknowledgedMessageIdRef.current) return;
    viewedMessageIdRef.current = viewedMessageId;
    if (acknowledgeTimeoutRef.current) return;
    acknowledgeTimeoutRef.current = setTimeout(() => {
      acknowledgeTimeoutRef.current = null;
      const nextMessageId = viewedMessageIdRef.current;
      if (!nextMessageId || !trackUserId || !gid || readOnly || !screenActiveRef.current || nextMessageId === acknowledgedMessageIdRef.current) return;
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
  }, [cid, gid, markRead, pmid, readOnly, trackUserId]);

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
    if (!trackUserId || !pid || !gid || readOnly) throw new Error('channel_unavailable');
    if (screenActiveRef.current) hapticMedium();
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
      pinToLatestAfterSendRef.current = true;
      if (pinToLatestTimeoutRef.current) clearTimeout(pinToLatestTimeoutRef.current);
      pinToLatestTimeoutRef.current = setTimeout(() => {
        pinToLatestAfterSendRef.current = false;
        if (scrollAfterSendMessageIdRef.current === pendingId) scrollAfterSendMessageIdRef.current = null;
        pinToLatestTimeoutRef.current = null;
      }, 900);
      setNewMessageCount(0);
      setShowJumpToLatest(false);
      scrollAfterSendMessageIdRef.current = pendingId;
      setPendingMessages((prev) => [...prev, {
        attachments: payload.attachments,
        at: Date.now(),
        body,
        id: pendingId,
      }]);
    }
    setBusy('send');
    try {
      const result = await sendComposerMessage({
        ...payload,
        body,
        idempotencyKey: sendKey.current,
        onMessageCreated: (messageId) => {
          if (!pendingId) return;
          setPendingMessages((prev) => prev.map((pending) => pending.id === pendingId
            ? { ...pending, messageId: String(messageId) }
            : pending));
        },
        reportProgress: (attachmentId, progress) => {
          payload.reportProgress(attachmentId, progress);
          if (!pendingId) return;
          setPendingMessages((prev) => prev.map((pending) => pending.id === pendingId
            ? { ...pending, attachments: pending.attachments?.map((file) => file.id === attachmentId ? { ...file, progress } : file) }
            : pending));
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
            userId: trackUserId,
            actingCompanyId: cid,
            projectMemberId: pmid,
          }),
          sendMessage: (input) => sendMessage({
            projectId: pid, groupId: gid, authorId: trackUserId,
            actingCompanyId: cid, projectMemberId: pmid,
            attachments: input.attachments,
            idempotencyKey: input.idempotencyKey,
            body: input.body, mentions: resolveMentionIds(input.body, memberItems),
            replyToMessageId: input.replyToMessageId,
            notificationPreview: input.body,
          }),
        },
      });

      const sentMessageId = result.messageId;
      if (pendingId) {
        if (sentMessageId) {
          const failedIds = new Set(result.failedIds);
          setPendingMessages((prev) => prev.map((pending) => pending.id === pendingId
            ? {
                ...pending,
                attachments: pending.attachments?.filter((file) => !failedIds.has(file.id)),
                messageId: String(sentMessageId),
              }
            : pending));
        } else {
          setPendingMessages((prev) => prev.filter((pending) => pending.id !== pendingId));
        }
      }
      if (result.messageId && parseMentions(body).includes('track')) {
        requestTrackResponse(result.messageId, body);
      }
      if (result.failedIds.length === 0) {
        sendKey.current = null;
        sendSignatureRef.current = null;
      }
      return result;
    } catch (failure) {
      if (pendingId) {
        if (scrollAfterSendMessageIdRef.current === pendingId) {
          scrollAfterSendMessageIdRef.current = null;
          pinToLatestAfterSendRef.current = false;
          if (pinToLatestTimeoutRef.current) clearTimeout(pinToLatestTimeoutRef.current);
          pinToLatestTimeoutRef.current = null;
        }
        setPendingMessages((prev) => prev.filter((p) => p.id !== pendingId));
      }
      throw failure;
    } finally {
      setBusy(null);
    }
  }

  async function submitReport(reason: ReportReason, note: string) {
    if (!trackUserId || !pid || !reportTarget || reportTarget.kind === 'date-sep' || busy === 'report') return;
    setReportError(null);
    hapticLight();
    try {
      await withBusy('report', async () => createReport({
        projectId: pid, reporterId: trackUserId, groupId: gid,
        actingCompanyId: cid, projectMemberId: pmid,
        targetType: reportTarget.kind === 'assistant' ? 'assistant_answer' : 'message',
        targetMessageId: reportTarget.kind === 'message' ? reportTarget.item.message._id : undefined,
        targetAssistantStreamId: reportTarget.kind === 'assistant' ? reportTarget.stream._id : undefined,
        reason, note,
      }));
      setReportTarget(null);
      showToast({ icon: 'flag', message: 'Thanks. The report was submitted for review.', title: 'Message reported', tone: 'success' });
    } catch (failure) {
      setReportError(communicationErrorMessage(failure, 'submit this report'));
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

  async function handleForward(
    target: { group: { _id: Id<'groups'>; name: string } },
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

  const renderItem = useCallback<ListRenderItem<GroupedThreadItem>>(({ item }) => {
    if (item.kind === 'date-sep') return <DateSeparator label={item.label} />;
    const isOwnMessage = item.kind === 'message' && item.item.author?._id === trackUserId;
    return (
      <View>
        <ThreadRow
          highlighted={item.kind === 'message' && item.item.message._id === highlightedMessageId}
          contextActions={Platform.OS === 'ios' && item.kind === 'message' ? buildMessageActions(item) : undefined}
          item={item}
          isFirstInGroup={item.isFirstInGroup}
          isOwnMessage={isOwnMessage}
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
            setActionSheetOpen(true);
          }}
          onSwipeReply={readOnly || messageSelectionMode ? undefined : () => {
            hapticLight();
            if (item.kind === 'message') setReplyTo(item.item);
          }}
          onSwipeForward={!readOnly && !messageSelectionMode && item.kind === 'message' && !item.item.message.deletedAt ? () => {
            hapticLight();
            setForwardError(null);
            setForwardTarget(item.item);
          } : undefined}
          onSwipeReport={messageSelectionMode ? undefined : () => {
            hapticLight();
            setReportTarget(item);
          }}
          onOpenThread={!messageSelectionMode && canOpenExistingThread(releaseConfigLoading, releaseConfig.threads) && pid && gid && item.kind === 'message' && item.item.channelThread ? () => {
            router.push(threadConversationHref(pid, gid, item.item.channelThread!.threadId, cid && pmid ? { companyId: cid, membershipId: pmid, archived: archiveContext } : null) as never);
          } : undefined}
          onPressReply={!messageSelectionMode && item.kind === 'message' && item.item.replyTo ? () => {
            const quotedId = item.item.replyTo?.messageId;
            if (quotedId) scrollToMessage(quotedId);
          } : undefined}
        />
        {releaseConfig.tasks && pid ? <TaskInlineCards
          assistantStreamId={item.kind === 'assistant' ? item.stream._id : undefined}
          identity={taskIdentity}
          isOwnMessage={isOwnMessage}
          messageId={item.kind === 'message' ? item.item.message._id : undefined}
          onCardsChange={trackCardRow}
          projectId={pid}
          readOnly={readOnly}
        /> : null}
      </View>
    );
  }, [archiveContext, beginMessageSelection, buildMessageActions, channelContext, cid, gid, highlightedMessageId, messageSelectionMode, pid, pmid, readOnly, releaseConfig.tasks, releaseConfig.threads, releaseConfigLoading, router, scrollToMessage, selectedMessageIds, setReplyTo, taskIdentity, toggleMessageSelection, trackCardRow, trackUserId]);

  const isOffline = network.isConnected === false || network.isInternetReachable === false;
  if (navigation && !navigation.available) return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Channel unavailable' }} /><View style={styles.empty}><ThemedText type="subtitle">Channel unavailable</ThemedText><ThemedText style={{ color: theme.textSecondary }}>{navigationUnavailableCopy(Boolean(cid))}</ThemedText></View></ThemedView>;
  if (isOffline && messages === undefined) return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Channel unavailable' }} /><View style={styles.empty}><ThemedText type="subtitle">Channel unavailable offline</ThemedText><ThemedText style={{ color: theme.textSecondary }}>Connect to the internet to load this Channel.</ThemedText><Pressable accessibilityRole="button" onPress={() => pid && gid && router.replace(channelHref(pid, gid, channelContext))} style={[styles.retry, { backgroundColor: theme.accent }]}><ThemedText style={{ color: theme.accentInk }} type="smallBold">Try again</ThemedText></Pressable></View></ThemedView>;
  const initialConversationDataLoading = messages === undefined || (!isOffline && (assistantStreams === undefined || groups === undefined));
  if (navigation === undefined || (navigation.available && initialConversationDataLoading)) return <ThemedView style={styles.screen}><Stack.Screen options={{ title: 'Conversation' }} /><ConversationLoading label={`Loading ${activeGroup?.name ?? 'conversation'}`} /></ThemedView>;

  const taskLinkMessageIds = threadItems.flatMap((entry) => entry.kind === 'message' ? [entry.item.message._id] : []);
  const taskLinkAssistantStreamIds = threadItems.flatMap((entry) => entry.kind === 'assistant' ? [entry.stream._id] : []);
  const headerSelectionActions = selectedMessages.length === 1
    ? messageActions.filter((action) => ['Reply', 'Forward'].includes(action.label))
    : [];

  return (
    <ThemedView style={[styles.screen, { backgroundColor: theme.homeSurface }]}>
      <Stack.Screen
        options={{
          contentStyle: { backgroundColor: theme.homeSurface },
          headerShown: Platform.OS !== 'ios',
          headerTransparent: true,
          headerBackVisible: false,
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerBlurEffect: 'none',
          headerBackground: () => <ChatHeaderBackground />,
          headerLeft: () => messageSelectionMode ? <IconButton
            accessibilityLabel="Cancel message selection"
            appearance="surface"
            icon="close"
            onPress={exitMessageSelection}
          /> : <Pressable
            accessibilityLabel={channelSearchOpen ? 'Close message search' : 'Back to conversations'}
            accessibilityRole="button"
            onPress={() => {
              hapticLight();
              if (channelSearchOpen) {
                setChannelSearchOpen(false);
                setChannelSearchText('');
                return;
              }
              if (router.canGoBack()) router.back();
              else router.replace(pid ? projectChannelsHref(pid, channelContext) as never : '/conversations' as never);
            }}
            style={({ pressed }) => [styles.headerCircle, { backgroundColor: pressed ? theme.backgroundSelected : conversationHeaderTint, borderColor: theme.homeBorder }]}
          >
            <PlatformIcon color={theme.textSecondary} name="arrow-left" size={20} />
          </Pressable>,
          headerRight: () => messageSelectionMode ? (
            <View style={styles.headerActions}>
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
            </View>
          ) : channelSearchOpen ? null : (
            <View style={styles.headerActions}>
              <IconButton
                accessibilityLabel="Search messages in this Channel"
                appearance="surface"
                icon="search"
                onPress={() => {
                  hapticLight();
                  setChannelSearchOpen(true);
                  setChannelSearchText('');
                }}
              />
              {!readOnly ? <IconButton
                accessibilityLabel="Channel options"
              appearance="surface"
                icon="dots-horizontal"
                onPress={() => { hapticLight(); setToolsOpen(true); }}
              /> : null}
            </View>
          ),
          headerTitle: () => messageSelectionMode ? (
            <ThemedText accessibilityLabel={`${selectedMessages.length} ${selectedMessages.length === 1 ? 'message' : 'messages'} selected`} type="title">{selectedMessages.length}</ThemedText>
          ) : channelSearchOpen ? (
            <View style={[styles.androidSearchField, { backgroundColor: conversationHeaderTint, borderColor: theme.homeBorder }]}>
              <PlatformIcon color={theme.textSecondary} name="search" size={18} />
              <ThemedTextInput accessibilityLabel="Search messages in this Channel" autoCapitalize="none" autoCorrect={false} autoFocus maxLength={200} onChangeText={setChannelSearchText} placeholder="Search messages" returnKeyType="search" style={[styles.searchTextInput, { color: theme.text }]} value={channelSearchText} />
              {channelSearchText ? <Pressable accessibilityLabel="Clear message search" accessibilityRole="button" hitSlop={8} onPress={() => setChannelSearchText('')}><PlatformIcon color={theme.textSecondary} name="close" size={17} /></Pressable> : null}
            </View>
          ) : (
            <AnimatedPressable
              accessibilityHint="Opens the Channel picker"
              accessibilityLabel={`Choose Channel. Current Channel: ${activeGroup?.name ?? 'Conversation'}`}
              accessibilityRole="button"
              hitSlop={4}
              onPressIn={channelHeaderPressIn}
              onPressOut={channelHeaderPressOut}
              onPress={() => { hapticLight(); setGroupSwitchOpen(true); }}
              style={[styles.channelHeaderButton, { backgroundColor: conversationHeaderTint, borderColor: theme.homeBorder }, channelHeaderPressStyle]}
            >
              <ChannelHeaderIdentity
                colorKey={activeGroupMark?.markColorKey}
                groupId={String(activeGroup?._id ?? gid)}
                iconKey={activeGroupIconKey}
                key={String(activeGroup?._id ?? gid)}
                name={activeGroup?.name ?? 'Conversation'}
              />
              <PlatformIcon color={theme.textSecondary} name="chevron-down" size={15} />
            </AnimatedPressable>
          ),
        }}
      />

      {Platform.OS === 'ios' ? <View style={[styles.iosHeader, { backgroundColor: conversationHeaderTint, paddingTop: insets.top }]}>
        {messageSelectionMode ? <View style={styles.iosHeaderRow}>
          <IconButton accessibilityLabel="Cancel message selection" appearance="glass" icon="close" onPress={exitMessageSelection} />
          <View style={styles.iosHeaderTitle}>
            <ThemedText accessibilityLabel={`${selectedMessages.length} ${selectedMessages.length === 1 ? 'message' : 'messages'} selected`} type="title">{selectedMessages.length}</ThemedText>
          </View>
          <View style={styles.iosHeaderActions}>
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
        </View> : channelSearchOpen ? <View style={styles.iosHeaderRow}>
          <IconButton accessibilityLabel="Close message search" appearance="glass" icon="arrow-left" onPress={() => { setChannelSearchOpen(false); setChannelSearchText(''); }} />
          <ConversationSearchPill onChangeText={setChannelSearchText} onClear={() => setChannelSearchText('')} query={channelSearchText} />
        </View> : <View style={styles.iosHeaderRow}>
          <IconButton
            accessibilityLabel="Back to conversations"
            appearance="glass"
            icon="arrow-left"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace(pid ? projectChannelsHref(pid, channelContext) as never : '/conversations' as never);
            }}
          />
          <View style={styles.iosHeaderTitle}>
            <ChannelPickerPill
              accessibilityLabel={`Choose Channel. Current Channel: ${activeGroup?.name ?? 'Conversation'}`}
              colorKey={activeGroupMark?.markColorKey}
              groupId={String(activeGroup?._id ?? gid)}
              iconKey={activeGroupIconKey}
              name={activeGroup?.name ?? 'Conversation'}
              onPress={() => { hapticLight(); setGroupSwitchOpen(true); }}
            />
          </View>
          <View style={styles.iosHeaderActions}>
            <IconButton
              accessibilityLabel="Search messages in this Channel"
              appearance="glass"
              icon="search"
              onPress={() => {
                setChannelSearchOpen(true);
                setChannelSearchText('');
              }}
            />
            {!readOnly ? <IconButton
              accessibilityLabel="Channel options"
              appearance="glass"
              icon="dots-horizontal"
              onPress={() => setToolsOpen(true)}
            /> : null}
          </View>
        </View>}
      </View> : null}

      <ConnectivityBanner message="You’re offline. Cached messages stay available; sending will retry when you reconnect." style={styles.connection} />
      <View style={styles.flex}>
      {channelSearchOpen ? (
        <FlatList
          contentContainerStyle={[styles.searchResultsList, { paddingBottom: composerOverlayHeight + Spacing.four }]}
          data={channelSearch?.messages ?? []}
          keyExtractor={(hit) => String(hit.messageId)}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.searchResultsEmpty}>
              <ThemedText themeColor="textSecondary" type="small">
                {channelSearchQuery.length < 2
                  ? 'Enter at least two characters to search this Channel.'
                  : channelSearch === undefined
                    ? 'Searching messages…'
                    : 'No messages match in this Channel.'}
              </ThemedText>
            </View>
          }
          renderItem={({ item: hit }) => {
            const isOwnHit = hit.authorId === trackUserId;
            return (
              <Pressable
                accessibilityLabel={`Message from ${hit.title}. ${hit.preview}. Open message.`}
                accessibilityRole="button"
                onPress={() => {
                  hapticLight();
                  setChannelSearchOpen(false);
                  if (!pid || !gid) return;
                  if (hit.threadId) router.push(threadConversationHref(pid, gid, hit.threadId, channelContext, hit.messageId) as never);
                  else router.replace(channelHref(pid, gid, channelContext, hit.messageId) as never);
                }}
                style={({ pressed }) => [
                  styles.channelSearchResult,
                  isOwnHit ? styles.channelSearchResultOwn : styles.channelSearchResultOther,
                  {
                    backgroundColor: pressed ? theme.backgroundSelected : theme.homeSurface,
                    borderColor: theme.homeBorder,
                  },
                ]}
              >
                <View style={styles.channelSearchResultMeta}>
                  <ThemedText numberOfLines={1} style={styles.channelSearchAuthor} type="smallBold">{hit.title}</ThemedText>
                  <ThemedText style={styles.channelSearchTime} themeColor="textTertiary" type="caption">
                    {new Date(hit.createdAt).toLocaleTimeString([], { hour: '2-digit', hourCycle: 'h23', minute: '2-digit' })}
                  </ThemedText>
                </View>
                <ThemedText numberOfLines={4} themeColor="textSecondary" type="small">{hit.preview}</ThemedText>
                <ThemedText numberOfLines={1} style={styles.channelSearchSubtitle} themeColor="textTertiary" type="caption">{hit.subtitle}</ThemedText>
              </Pressable>
            );
          }}
          style={styles.searchResultsScroll}
        />
      ) : (
      <Animated.View style={styles.flex}>
      <TaskLinkBatchProvider
        assistantStreamIds={taskLinkAssistantStreamIds}
        enabled={releaseConfig.tasks}
        identity={taskIdentity}
        messageIds={taskLinkMessageIds}
      >
      <FlatList
          ref={listRef}
          contentContainerStyle={[styles.thread, { paddingBottom: composerOverlayHeight + Spacing.two }]}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          data={threadItems}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
          onScrollToIndexFailed={({ averageItemLength, index }) => requestAnimationFrame(() => {
            if (index >= threadItems.length - 1) {
              listRef.current?.scrollToOffset({ animated: false, offset: averageItemLength * index });
              requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
              return;
            }
            listRef.current?.scrollToIndex({ animated: false, index, viewPosition: 0.5 });
          })}
          initialNumToRender={24}
          keyExtractor={(item) => item.key}
          maxToRenderPerBatch={16}
          onLayout={({ nativeEvent }) => {
            scrollMetricsRef.current.viewportHeight = nativeEvent.layout.height;
            updateJumpToLatest();
          }}
          onScrollBeginDrag={stopFollowingAfterUserScroll}
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
          onViewableItemsChanged={onViewableItemsChanged}
          scrollEventThrottle={16}
          onContentSizeChange={(_width, height) => {
            const wasAtBottom = atBottomRef.current;
            scrollMetricsRef.current.contentHeight = height;
            updateJumpToLatest();
            if ((!targetMessageId || positionedTargetMessageIdRef.current === targetMessageId) && (wasAtBottom || pinToLatestAfterSendRef.current)) {
              scrollToLatest();
            }
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
                  <Animated.View
                    entering={reducedMotion ? undefined : PendingMessageEntering}
                    key={m.id}
                    onLayout={() => {
                      if (scrollAfterSendMessageIdRef.current !== m.id) return;
                      scrollToLatest();
                    }}
                  >
                  <PendingMessageBubble at={m.at} attachments={m.attachments} body={m.body} offline={isOffline} />
                  </Animated.View>
                ))}
              </View>
            ) : null
          }
        />
      </TaskLinkBatchProvider>
      </Animated.View>
      )}
      {showJumpToLatest && !channelSearchOpen ? (
        <AnimatedPressable
          accessibilityLabel={`Jump to latest messages${newMessageCount ? `, ${newMessageCount} new messages` : ''}`}
          accessibilityRole="button"
          entering={reducedMotion ? undefined : JumpToLatestEntering}
          exiting={reducedMotion ? undefined : JumpToLatestExiting}
          onPressIn={jumpButtonPressIn}
          onPressOut={jumpButtonPressOut}
          onPress={() => {
            hapticLight();
            scrollToLatest(!reducedMotion);
          }}
          style={[styles.jumpToLatest, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline, bottom: composerOverlayHeight + Spacing.four }, jumpButtonPressStyle]}>
          <PlatformIcon color={theme.text} name="chevron-down" size={20} />
          {newMessageCount ? <ThemedText style={[styles.jumpToLatestCount, { color: theme.text }]} type="captionBold">{newMessageCount > 99 ? '99+' : newMessageCount}</ThemedText> : null}
        </AnimatedPressable>
      ) : null}
      </View>

      {archiveBanner ? <View style={[styles.archiveBanner, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.archiveTitle} type="smallBold">{archiveBanner.title}</ThemedText><ThemedText style={styles.archiveDescription} themeColor="textSecondary" type="small">{archiveBanner.description}</ThemedText></View> : <KeyboardStickyView
        offset={{ closed: -composerClosedOffset, opened: 0 }}
        style={styles.composerOverlay}>
        <View
          onLayout={({ nativeEvent }) => {
            if (composerExpanded) return;
            const height = Math.ceil(nativeEvent.layout.height);
            setComposerOverlayHeight((current) => current === height ? current : height);
          }}
          style={[composerExpanded && { backgroundColor: theme.homeSurface }, composerExpanded && styles.composerExpandedOverlay]}>
          {/* Keep the message list visible above the keyboard while typing. */}
          <Composer
            activeGroupName={activeGroup?.name ?? null}
            busy={busy === 'send'}
            expandOnKeyboard={false}
            mentionCandidatesHasMore={projectMembersPage.status === 'CanLoadMore'}
            mentionCandidatesLoading={projectMembersPage.status === 'LoadingMore'}
            mentionCandidates={mentionCandidates}
            onCancelReply={() => setReplyTo(null)}
            onChangeText={setComposer}
            onExpandedChange={setComposerExpanded}
            onFocus={scrollToLatest}
            onLoadMoreMentionCandidates={() => {
              if (projectMembersPage.status === 'CanLoadMore') projectMembersPage.loadMore(100);
            }}
            onSendMessage={handleSendMessage}
            replyTo={replyTo}
            value={composer}
          />
        </View>
      </KeyboardStickyView>}

      <OptionsSheet onClose={() => setGroupSwitchOpen(false)} title="Switch Channel" visible={groupSwitchOpen}>
        <SheetSection>
          {groupItems.map((item) => (
            <SheetRow
              leading={<EntityMark colorKey={item.group.markColorKey} iconKey={channelIconKeys.get(String(item.group._id)) ?? item.group.markIconKey} id={String(item.group._id)} kind="channel" name={item.group.name} size={36} />}
              key={item.group._id}
              label={item.group.name}
              selected={item.group._id === gid}
              onPress={() => {
                setGroupSwitchOpen(false);
                hapticLight();
                router.replace(channelHref(pid!, item.group._id, channelContext) as never);
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

      <OptionsSheet onClose={() => setToolsOpen(false)} title={activeGroup?.name ? `${activeGroup.name} notifications` : 'Notifications'} visible={toolsOpen}>
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
              icon={mode === 'all' ? 'bell-outline' : mode === 'mentions' ? 'at-sign' : 'bell-off-outline'}
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
              icon={mode === 'inherit' ? 'refresh' : mode === 'all' ? 'bell-outline' : mode === 'mentions' ? 'at-sign' : 'bell-off-outline'}
              label={mode === 'inherit' ? 'Follow global' : mode === 'all' ? 'All messages' : mode === 'mentions' ? 'Mentions only' : 'Off'}
              selected={groupMode === mode}
              onPress={() => trackUserId && gid && void setGroupNotif({ userId: trackUserId, groupId: gid, actingCompanyId: cid, projectMemberId: pmid, mode })}
            />
          ))}
        </SheetSection>
      </OptionsSheet>

      <MessageReportSheet
        busy={busy === 'report'}
        error={reportError}
        onClose={() => { if (busy !== 'report') setReportTarget(null); }}
        onSubmit={(reason, note) => void submitReport(reason, note)}
        visible={Boolean(reportTarget)}
      />

      <MessageActions
        visible={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        actions={messageActions}
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
        groups={groupItems}
        message={forwardTarget}
        onClose={() => { if (!forwardBusyGroupId) setForwardTarget(null); }}
        onForward={(target, note) => { void handleForward(target, note); }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  archiveBanner: { alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  archiveDescription: { maxWidth: 420, textAlign: 'center' },
  archiveTitle: { textAlign: 'center' },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  androidSearchField: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, height: 40, paddingHorizontal: Spacing.three, width: '100%' },
  channelSearchResult: { borderCurve: 'continuous', borderRadius: Radius.xlarge, borderWidth: StyleSheet.hairlineWidth, elevation: 1, gap: Spacing.one, maxWidth: '84%', minHeight: TouchTarget, justifyContent: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, shadowColor: '#000', shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.04, shadowRadius: 2 },
  channelSearchResultMeta: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  channelSearchAuthor: { flex: 1, minWidth: 0 },
  channelSearchTime: { fontSize: 10, fontVariant: ['tabular-nums'], lineHeight: 12 },
  channelSearchSubtitle: { marginTop: Spacing.half },
  channelSearchResultOwn: { alignSelf: 'flex-end', borderBottomRightRadius: Radius.small },
  channelSearchResultOther: { alignSelf: 'flex-start', borderBottomLeftRadius: Radius.small },
  searchTextInput: { flex: 1, fontSize: 16, minWidth: 0, paddingHorizontal: 0, paddingVertical: 0 },
  searchResultsEmpty: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.six, paddingVertical: Spacing.four },
  searchResultsList: { flexGrow: 1, gap: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  searchResultsScroll: { flex: 1 },
  editAction: { flex: 1 },
  editActions: { flexDirection: 'row', gap: Spacing.two },
  empty: { alignItems: 'center', padding: Spacing.six },
  flex: { flex: 1 },
  connection: { marginHorizontal: Spacing.three, marginTop: Spacing.two },
  composerOverlay: { bottom: 0, left: 0, position: 'absolute', right: 0, zIndex: 2 },
  composerExpandedOverlay: { bottom: 0, left: 0, right: 0, top: 0, zIndex: 4 },
  jumpToLatest: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 3px 10px rgba(0,0,0,0.14)',
    elevation: 3,
    flexDirection: 'row',
    gap: Spacing.one,
    height: TouchTarget,
    justifyContent: 'center',
    minWidth: TouchTarget,
    paddingHorizontal: Spacing.two,
    position: 'absolute',
    right: Spacing.three,
    zIndex: 3,
  },
  jumpToLatestCount: { textAlign: 'center' },
  loadMore: { alignItems: 'center', minHeight: TouchTarget, justifyContent: 'center', padding: Spacing.two },
  headerCircle: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: TouchTarget, justifyContent: 'center', overflow: 'hidden', width: TouchTarget },
  iosHeaderActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  iosHeader: { flexShrink: 0 },
  iosHeaderRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, height: TouchTarget, paddingHorizontal: Spacing.three },
  iosHeaderTitle: { alignItems: 'center', flex: 1, minWidth: 0 },
  channelHeaderButton: { alignItems: 'center', alignSelf: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexShrink: 1, gap: Spacing.two, maxWidth: 280, minHeight: TouchTarget, minWidth: 0, overflow: 'hidden', paddingHorizontal: Spacing.three },
  retry: { alignItems: 'center', borderRadius: Radius.medium, justifyContent: 'center', minHeight: TouchTarget, marginTop: Spacing.three, paddingHorizontal: Spacing.four },
  screen: { flex: 1 },
  thread: { paddingBottom: Spacing.two, paddingTop: Spacing.two },
});
