import type { TaskPriority } from '@track/shared/tasks';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useNetworkState } from 'expo-network';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAwareScrollView, useKeyboardState } from 'react-native-keyboard-controller';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createDraftSubmissionState, createSubmissionGate } from '@/lib/submission-state';
import {
  AccessibilityInfo,
  Clipboard,
  Pressable,
  StyleSheet,
  View,
  type TextInput,
} from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { DateField } from '@/components/date-field';
import { ActionButton } from '@/components/action-button';
import { CompactPillButton } from '@/components/compact-pill-button';
import { ColoredAvatar } from '@/components/colored-avatar';
import { EntityMark } from '@/components/entity-mark';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { OptionsSheet, SheetInput, SheetNote, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import {
  TaskCommentComposer,
  TaskOverview,
  TaskUpdatesFeed,
} from '@/components/task-detail-content';
import type { TaskEditField } from '@/components/task-detail-types';
import { TaskDueChip, TaskPriorityBadge, TaskStateBanner, TaskStatusPill } from '@/components/task-ui';
import { ScreenLoading } from '@/components/screen-loading';
import { ScreenEntrance } from '@/components/screen-entrance';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { MaxFontScale, MobileHeaderMetrics, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTrackUser } from '@/contexts/track-user-context';
import { useTheme } from '@/hooks/use-theme';
import { taskErrorMessage } from '@/lib/user-facing-error';
import { channelHref, projectOverviewHref } from '@/lib/company-navigation';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { idempotencyKey } from '@/lib/idempotency';
import { useReleaseConfig } from '@/lib/release-config';
import { setActivePushContext } from '@/lib/push-presentation';
import { shortTaskKey, taskPriorityLabel } from '@/lib/task-presentation';
import { taskDecisionForCategory } from '@/lib/task-decision';
import { visibleTaskUpdates } from '@/lib/task-updates';
import { taskDetailHref, taskListHref, type MobileTaskIdentity } from '@/lib/task-navigation';
import { threadConversationHref } from '@/lib/thread-navigation';
import { uniqueTaskViews } from '@/lib/unique-task-views';

type MobileTaskListItem = FunctionReturnType<typeof api.tasks.listChildren>['page'][number];

type TaskFieldPatch = {
  assigneeProjectMemberId?: Id<'projectMembers'> | null;
  description?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  title?: string;
  workflowStateId?: Id<'taskWorkflowStates'>;
};

type TaskEditableSnapshot = {
  description: string;
  title: string;
};

const priorities: TaskPriority[] = ['none', 'urgent', 'high', 'medium', 'low'];
const fieldTitles: Record<TaskEditField, string> = {
  assignee: 'Assignee',
  description: 'Description',
  dueDate: 'Due date',
  labels: 'Labels',
  more: 'Task options',
  priority: 'Priority',
  status: 'Move to',
};

function errorMessage(failure: unknown) {
  return taskErrorMessage(failure, 'The task action failed. Check your connection and try again.');
}

export default function TaskScreen() {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const router = useRouter();
  const release = useReleaseConfig();
  const { trackUserId } = useTrackUser();
  const network = useNetworkState();
  const { projectId, taskKey, companyId, membershipId, archive } = useLocalSearchParams<{
    projectId: string;
    taskKey: string;
    companyId?: string;
    membershipId?: string;
    archive?: string;
  }>();
  const project = projectId as Id<'projects'>;
  useFocusEffect(useCallback(() => {
    if (projectId && taskKey) setActivePushContext({ projectId, taskKey });
    return () => setActivePushContext(null);
  }, [projectId, taskKey]));
  const identity = companyId && membershipId ? {
    actingCompanyId: companyId as Id<'companies'>,
    projectMemberId: membershipId as Id<'projectMembers'>,
  } : {};
  const routeIdentity: MobileTaskIdentity | null = companyId && membershipId ? {
    archived: archive === '1',
    companyId: companyId as Id<'companies'>,
    membershipId: membershipId as Id<'projectMembers'>,
  } : null;
  const sourceDetail = useQuery(api.tasks.getByKey, release.tasks ? {
    projectId: project,
    publicKey: taskKey,
    ...identity,
  } : 'skip');
  const boards = useQuery(api.taskBoards.list, release.tasks ? {
    projectId: project,
    ...identity,
  } : 'skip');
  const childPage = usePaginatedQuery(api.tasks.listChildren, sourceDetail ? {
    parentTaskId: sourceDetail.task._id,
    includeArchived: archive === '1' || Boolean(sourceDetail.task.archivedAt),
    ...identity,
  } : 'skip', { initialNumItems: 50 });
  const commentPage = usePaginatedQuery(api.tasks.listHistory, sourceDetail ? {
    taskId: sourceDetail.task._id,
    kind: 'comments',
    ...identity,
  } : 'skip', { initialNumItems: 50 });
  const activityPage = usePaginatedQuery(api.tasks.listHistory, sourceDetail ? {
    taskId: sourceDetail.task._id,
    kind: 'activities',
    ...identity,
  } : 'skip', { initialNumItems: 50 });
  const referencePage = usePaginatedQuery(api.tasks.listReferences, sourceDetail ? {
    taskId: sourceDetail.task._id,
    ...identity,
  } : 'skip', { initialNumItems: 50 });
  const assignees = useQuery(api.tasks.listEligibleAssignees, sourceDetail && archive !== '1' ? {
    projectId: project,
    groupId: sourceDetail.task.groupId,
    ...identity,
  } : 'skip');
  const projectNavigation = useQuery(api.mobile.resolveNavigation, trackUserId && projectId ? {
    userId: trackUserId,
    projectId: project,
    actingCompanyId: companyId as Id<'companies'> | undefined,
    projectMemberId: membershipId as Id<'projectMembers'> | undefined,
  } : 'skip');
  const assignableAssignees = useMemo(() => {
    if (!assignees || !sourceDetail) return assignees;
    if (sourceDetail.capabilities.canAssignOthers) return assignees;
    return assignees.filter((item) => item.member._id === identity.projectMemberId);
  }, [assignees, identity.projectMemberId, sourceDetail]);
  const canClearAssignee = Boolean(sourceDetail?.capabilities.canAssignOthers)
    || sourceDetail?.task.assigneeProjectMemberId === identity.projectMemberId;
  const labels = useQuery(api.taskLabels.list, release.tasks && archive !== '1' ? {
    projectId: project,
    ...identity,
  } : 'skip');
  const sourceComments = useMemo(
    () => commentPage.results.filter((item): item is Doc<'taskComments'> => 'body' in item),
    [commentPage.results],
  );
  const sourceActivities = useMemo(
    () => activityPage.results.filter((item): item is Doc<'taskActivities'> => 'action' in item),
    [activityPage.results],
  );
  const detail = sourceDetail;
  const updateTask = useMutation(api.tasks.update);
  const createTask = useMutation(api.tasks.create);
  const createComment = useMutation(api.taskComments.create);
  const setFollowing = useMutation(api.tasks.setFollowing);
  const setArchived = useMutation(api.tasks.setArchived);
  const setTaskLabels = useMutation(api.taskLabels.setTaskLabels);
  const [field, setField] = useState<TaskEditField | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [description, setDescription] = useState('');
  const [subtask, setSubtask] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [confirmPatch, setConfirmPatch] = useState<TaskFieldPatch | null>(null);
  const [highlightSubtaskId, setHighlightSubtaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [mentionIds, setMentionIds] = useState<Array<Id<'projectMembers'>>>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [updatesExpanded, setUpdatesExpanded] = useState(false);
  const [updateFilter, setUpdateFilter] = useState<'all' | 'comments' | 'activity'>('all');
  // Each save returns the next revision, so consecutive inline edits chain
  // without waiting for the reactive query to catch up.
  const savedRevision = useRef<number | null>(null);
  const checklistY = useRef(0);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const checklistInputFocused = useRef(false);
  const subtaskSubmission = useRef(createDraftSubmissionState());
  const submissionGate = useRef(createSubmissionGate());
  const commentSubmission = useRef(createDraftSubmissionState());
  const commentSignature = useRef('');
  commentSignature.current = JSON.stringify([projectId, taskKey, companyId, membershipId, comment, mentionIds]);
  const pendingPatch = useRef<TaskFieldPatch | null>(null);
  const subtaskPendingRef = useRef(false);
  const keyCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!keyboardVisible || !checklistInputFocused.current) return;

    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [keyboardVisible]);

  const focusChecklistInput = useCallback(() => {
    checklistInputFocused.current = true;
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const blurChecklistInput = useCallback(() => {
    checklistInputFocused.current = false;
  }, []);
  const focusTitleInput = useCallback((input: TextInput | null) => {
    if (input) input.focus();
  }, []);

  const taskIdentityRef = useRef<string | null>(null);
  const serverSnapshotRef = useRef<TaskEditableSnapshot | null>(null);
  const baselineSnapshotRef = useRef<TaskEditableSnapshot | null>(null);
  const taskIdentity = [
    projectId,
    taskKey,
    companyId ?? '',
    membershipId ?? '',
  ].join(':');
  const currentTaskIdentity = useRef(taskIdentity);
  currentTaskIdentity.current = taskIdentity;

  useEffect(() => () => {
    if (keyCopiedTimer.current) clearTimeout(keyCopiedTimer.current);
  }, []);

  useEffect(() => {
    if (!sourceDetail || sourceDetail.task.publicKey !== taskKey) return;
    const nextSnapshot = {
      description: sourceDetail.task.description ?? '',
      title: sourceDetail.task.title,
    };
    if (taskIdentityRef.current !== taskIdentity || !serverSnapshotRef.current || !baselineSnapshotRef.current) {
      if (taskIdentityRef.current !== null && taskIdentityRef.current !== taskIdentity) {
        commentSubmission.current.invalidate();
        setComment('');
        setMentionIds([]);
        setComposerOpen(false);
      }
      taskIdentityRef.current = taskIdentity;
      serverSnapshotRef.current = nextSnapshot;
      baselineSnapshotRef.current = nextSnapshot;
      savedRevision.current = sourceDetail.task.revision;
      setTitleDraft(null);
      setDescription('');
      setConflict(false);
      setError('');
      return;
    }

    const previousSnapshot = serverSnapshotRef.current;
    const baselineSnapshot = baselineSnapshotRef.current;
    const localTitle = titleDraft ?? previousSnapshot.title;
    const localDescription = field === 'description' ? description : previousSnapshot.description;
    const titleDirty = localTitle !== baselineSnapshot.title;
    const descriptionDirty = localDescription !== baselineSnapshot.description;
    const titleChanged = previousSnapshot.title !== nextSnapshot.title;
    const descriptionChanged = previousSnapshot.description !== nextSnapshot.description;
    const ownTitleSave = pendingPatch.current?.title === nextSnapshot.title;
    const ownDescriptionSave = pendingPatch.current?.description !== undefined
      && (pendingPatch.current.description ?? '') === nextSnapshot.description;
    if ((titleDirty && titleChanged && !ownTitleSave) || (descriptionDirty && descriptionChanged && !ownDescriptionSave)) setConflict(true);
    if (!titleDirty && titleDraft !== null && titleDraft !== nextSnapshot.title) setTitleDraft(nextSnapshot.title);
    if (!descriptionDirty && field === 'description' && description !== nextSnapshot.description) setDescription(nextSnapshot.description);
    serverSnapshotRef.current = nextSnapshot;
    if (!titleDirty && !descriptionDirty) {
      baselineSnapshotRef.current = nextSnapshot;
      savedRevision.current = sourceDetail.task.revision;
    }
  }, [description, field, sourceDetail, taskIdentity, taskKey, titleDraft]);

  const offline = network.isConnected === false || network.isInternetReachable === false;
  const board = boards?.find((item) => item.board._id === detail?.task.boardId);
  const subtasks = childPage.results;
  const visibleSubtasks = uniqueTaskViews(subtasks);
  const openSubtaskCount = visibleSubtasks.filter((item) =>
    item.state?.category !== 'completed' && item.state?.category !== 'canceled',
  ).length;
  const comments = sourceComments;
  const activities = sourceActivities;
  const hasMoreComments = commentPage.status === 'CanLoadMore' || commentPage.status === 'LoadingMore';
  const hasMoreActivities = activityPage.status === 'CanLoadMore' || activityPage.status === 'LoadingMore';
  const hasMoreUpdates = hasMoreComments || hasMoreActivities;
  const updates = useMemo(() => visibleTaskUpdates(
    comments,
    activities,
    hasMoreComments,
    hasMoreActivities,
  ), [activities, comments, hasMoreActivities, hasMoreComments]);
  const references = referencePage.results;
  const readOnly = archive === '1' || Boolean(detail && !detail.capabilities.canEdit);
  const labelIds = detail?.labels.flatMap((label) => label ? [label._id] : []) ?? [];

  async function run(action: () => Promise<unknown>, clear?: () => void) {
    const token = submissionGate.current.begin();
    if (!token) return false;
    const submittedTaskIdentity = taskIdentity;
    setBusy(true);
    setError('');
    try {
      await action();
      if (currentTaskIdentity.current !== submittedTaskIdentity) return false;
      clear?.();
      hapticMedium();
      return true;
    } catch (failure) {
      if (currentTaskIdentity.current !== submittedTaskIdentity) return false;
      setError(errorMessage(failure));
      if (failure instanceof Error && failure.message.includes('task_conflict')) {
        savedRevision.current = null;
        setConflict(true);
      }
      return false;
    } finally {
      if (submissionGate.current.finish(token)) setBusy(false);
    }
  }

  async function saveField(patch: TaskFieldPatch, confirmOpenSubtasks?: boolean) {
    if (!detail) return;
    const token = submissionGate.current.begin();
    if (!token) return;
    const submittedTitleDraft = titleDraft;
    const submittedTaskIdentity = taskIdentity;
    pendingPatch.current = patch;
    setField(null);
    setConfirmPatch(null);
    setBusy(true);
    setError('');
    try {
      const nextRevision = await updateTask({
        taskId: detail.task._id,
        expectedRevision: savedRevision.current ?? detail.task.revision,
        confirmOpenSubtasks,
        ...patch,
        ...identity,
      });
      if (currentTaskIdentity.current !== submittedTaskIdentity) return;
      savedRevision.current = nextRevision;
      const previousSnapshot = serverSnapshotRef.current;
      if (previousSnapshot) {
        const nextSnapshot = {
          description: patch.description === undefined
            ? previousSnapshot.description
            : patch.description ?? '',
          title: patch.title ?? previousSnapshot.title,
        };
        serverSnapshotRef.current = nextSnapshot;
        baselineSnapshotRef.current = nextSnapshot;
      }
      if (patch.title !== undefined) setTitleDraft((current) => current === submittedTitleDraft ? null : current);
      hapticMedium();
    } catch (failure) {
      if (currentTaskIdentity.current !== submittedTaskIdentity) return;
      if (failure instanceof Error
        && failure.message.includes('task_open_subtasks_confirmation_required')) {
        setConfirmPatch(patch);
        return;
      }
      setError(errorMessage(failure));
      if (failure instanceof Error && failure.message.includes('task_conflict')) {
        savedRevision.current = null;
        setConflict(true);
      }
      if (patch.description !== undefined) setField('description');
    } finally {
      pendingPatch.current = null;
      if (submissionGate.current.finish(token)) setBusy(false);
    }
  }

  async function saveLabels(next: Array<Id<'taskLabels'>>) {
    if (!detail) return;
    const submittedTaskIdentity = taskIdentity;
    await run(async () => {
      const nextRevision = await setTaskLabels({
        taskId: detail.task._id,
        labelIds: next,
        expectedRevision: savedRevision.current ?? detail.task.revision,
        ...identity,
      });
      if (currentTaskIdentity.current === submittedTaskIdentity) savedRevision.current = nextRevision;
    });
  }

  async function toggleSubtask(item: MobileTaskListItem) {
    if (!board) return;
    setHighlightSubtaskId(null);
    const terminal = item.state?.category === 'completed' || item.state?.category === 'canceled';
    const destination = terminal
      ? board.states.find((state) => state.isDefault)
        ?? board.states.find((state) => state.category === 'unstarted')
      : board.states.find((state) => state.category === 'completed');
    if (!destination) return;
    await run(async () => {
      await updateTask({
        taskId: item.task._id,
        expectedRevision: item.task.revision,
        workflowStateId: destination._id,
        confirmOpenSubtasks: true,
        ...identity,
      });
    });
  }

  function reviewOpenChecklist() {
    const firstOpen = subtasks.find((item) =>
      item.state?.category !== 'completed' && item.state?.category !== 'canceled');
    setConfirmPatch(null);
    setError('');
    setHighlightSubtaskId(firstOpen?.task._id ?? null);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, checklistY.current - Spacing.three) });
    });
  }

  function openReference(reference: Doc<'taskReferences'>) {
    if (!reference.groupId) return;
    hapticLight();
    const context = companyId && membershipId ? {
      archived: archive === '1',
      companyId: companyId as Id<'companies'>,
      membershipId: membershipId as Id<'projectMembers'>,
    } : null;
    if (reference.channelThreadId) {
      router.push(threadConversationHref(project, reference.groupId, reference.channelThreadId, context, reference.messageId) as never);
      return;
    }
    router.push(channelHref(project, reference.groupId, context, reference.messageId) as never);
  }

  function loadEarlierUpdates() {
    if (commentPage.status === 'CanLoadMore') commentPage.loadMore(50);
    if (activityPage.status === 'CanLoadMore') activityPage.loadMore(50);
  }

  async function addComment() {
    const body = comment.trim();
    if (!detail || !body || busy || !detail.capabilities.canComment) return;
    const token = submissionGate.current.begin();
    if (!token) return;
    const draft = commentSubmission.current.capture(commentSignature.current, idempotencyKey);
    setBusy(true);
    setError('');
    try {
      await createComment({
        taskId: detail.task._id,
        body,
        mentionedProjectMemberIds: mentionIds,
        idempotencyKey: draft.key,
        ...identity,
      });
      if (commentSubmission.current.settleSuccess(draft, commentSignature.current)) {
        setComment('');
        setMentionIds([]);
        setComposerOpen(false);
      }
    } catch (failure) {
      if (commentSubmission.current.isCurrent(draft, commentSignature.current)) {
        setError(taskErrorMessage(failure, 'The update could not be added. Check your connection and try again.'));
      }
    } finally {
      if (submissionGate.current.finish(token)) setBusy(false);
    }
  }

  function reviewConflict() {
    if (!detail) return;
    const snapshot = {
      description: detail.task.description ?? '',
      title: detail.task.title,
    };
    serverSnapshotRef.current = snapshot;
    baselineSnapshotRef.current = snapshot;
    savedRevision.current = detail.task.revision;
    setConflict(false);
    setError('');
    setTitleDraft(null);
    setDescription('');
  }

  function addSubtask() {
    if (!detail || !subtask.trim() || subtaskPendingRef.current) return;
    const submittedSubtask = subtask;
    const draft = subtaskSubmission.current.capture(JSON.stringify([taskIdentity, subtask]), idempotencyKey);
    subtaskPendingRef.current = true;
    void run(() => createTask({
      projectId: project,
      boardId: detail.task.boardId,
      parentTaskId: detail.task._id,
      title: subtask.trim(),
      priority: 'none',
      idempotencyKey: draft.key,
      ...identity,
    }), () => {
      setSubtask((current) => current === submittedSubtask ? '' : current);
      subtaskSubmission.current.invalidate();
    }).finally(() => {
      subtaskPendingRef.current = false;
    });
  }

  if (!release.tasks) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: 'Task unavailable' }} />
        <EmptyState icon="task" title="Tasks aren’t available here yet" body="You can still use Project conversations while task tools are unavailable." />
      </ThemedView>
    );
  }
  if (detail === undefined) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: 'Task' }} />
        <ScreenLoading variant="task" />
      </ThemedView>
    );
  }
  if (!detail) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: 'Task unavailable' }} />
        <EmptyState icon="shield-lock-outline" title="Task unavailable" body="This task isn’t available with your current Project access." />
      </ThemedView>
    );
  }

  const assigneeName = assignees?.find((item) => item.member._id === detail.task.assigneeProjectMemberId)?.user.displayName
    ?? (detail.assignee ? 'Assigned member' : 'Unassigned');
  const displayedAssigneeName = assigneeName;
  const projectName = projectNavigation?.available && projectNavigation.project ? projectNavigation.project.name : 'Project';
  const companyName = projectNavigation?.available && projectNavigation.company ? projectNavigation.company.displayName : 'Company';
  const updatesLoading = updateFilter === 'comments'
    ? commentPage.status === 'LoadingFirstPage'
    : updateFilter === 'activity'
      ? activityPage.status === 'LoadingFirstPage'
      : commentPage.status === 'LoadingFirstPage' || activityPage.status === 'LoadingFirstPage';
  const taskDecision = taskDecisionForCategory(detail.state?.category);
  const decisionState = board?.states.find((state) => state.category === taskDecision.targetCategory);
  const canAdvance = !readOnly;
  const canComment = detail.capabilities.canComment;
  const filteredUpdates = updateFilter === 'all'
    ? updates
    : updates.filter(({ kind }) => updateFilter === 'comments' ? kind === 'comment' : kind === 'activity');
  const visibleUpdates = updatesExpanded ? filteredUpdates : filteredUpdates.slice(-1);
  const hasMoreFilteredUpdates = updateFilter === 'comments'
    ? hasMoreComments
    : updateFilter === 'activity'
      ? hasMoreActivities
      : hasMoreUpdates;
  const updateFilters = [
    ['all', 'All', updates.length, hasMoreUpdates],
    ['comments', 'Comments', updates.filter(({ kind }) => kind === 'comment').length, hasMoreComments],
    ['activity', 'Activity', updates.filter(({ kind }) => kind === 'activity').length, hasMoreActivities],
  ] as const;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{
        title: detail.task.title,
        headerTitleAlign: 'left',
        headerRight: () => (
          <View style={styles.headerActions}>
            <IconButton
              accessibilityLabel="Task options"
              appearance="plain"
              icon="dots-horizontal"
              onPress={() => {
                setField('more');
              }}
            />
          </View>
        ),
      }} />
      <KeyboardAwareScrollView
          ref={scrollRef}
          bottomOffset={Spacing.two}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Spacing.three },
          ]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          style={styles.screen}>
          {offline ? <TaskStateBanner icon="cloud-off" message="Offline — reconnect to update this task" tone="offline" /> : null}
          {archive === '1' ? <TaskStateBanner icon="shield-lock-outline" message="Read-only archive" /> : null}
          {readOnly && archive !== '1' ? <TaskStateBanner icon="shield-lock-outline" message="You can view this task, but editing is restricted" /> : null}
          {detail.restrictedEarlierContext ? (
            <TaskStateBanner icon="shield-lock-outline" message="Some earlier context is restricted by Channel access" />
          ) : null}
          {conflict ? (
            <TaskStateBanner
              action={{ label: 'Review latest', onPress: reviewConflict }}
              icon="refresh"
              message="This task changed elsewhere"
              tone="danger"
            />
          ) : error ? (
            <TaskStateBanner action={{ label: 'Dismiss', onPress: () => setError('') }} icon="refresh" message={error} tone="danger" />
          ) : null}

          <ScreenEntrance style={styles.hero}>
            {titleDraft === null ? (
              <Pressable
                  accessibilityHint={titleExpanded ? 'Collapses the task title' : 'Shows the full task title'}
                  accessibilityLabel={detail.task.title}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: titleExpanded }}
                  onPress={() => setTitleExpanded((expanded) => !expanded)}
                  style={styles.titleHeading}>
                  <ThemedText accessibilityRole="header" numberOfLines={titleExpanded ? undefined : 2} style={styles.taskTitle}>{detail.task.title}</ThemedText>
              </Pressable>
            ) : (
              <View style={styles.titleEdit}>
              <ThemedTextInput
                accessibilityLabel="Task title"
                allowFontScaling
                autoFocus
                ref={focusTitleInput}
                cursorColor={theme.accent}
                keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
                maxFontSizeMultiplier={MaxFontScale}
                multiline
                onChangeText={setTitleDraft}
                selectionColor={theme.accent}
                selectionHandleColor={theme.accent}
                style={[styles.taskTitle, styles.titleInput, {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                }]}
                value={titleDraft}
              />
              <View style={styles.titleEditActions}>
                <ActionButton disabled={busy} label="Cancel" onPress={() => setTitleDraft(null)} style={styles.titleEditButton} variant="secondary" />
                <ActionButton
                  disabled={!titleDraft.trim() || titleDraft.trim() === detail.task.title || busy}
                  label={busy ? 'Saving…' : 'Save title'}
                  loading={busy}
                  onPress={() => {
                    const next = titleDraft.trim();
                    if (next) void saveField({ title: next });
                  }}
                  style={styles.titleEditButton}
                />
              </View>
              </View>
            )}
            <View style={styles.projectCrumbs}>
              <View style={styles.breadcrumbItem}>
                <EntityMark
                  id={String(projectNavigation?.company?._id ?? routeIdentity?.companyId ?? 'company')}
                  imageUrl={projectNavigation?.company?.logoUrl ?? undefined}
                  kind="company"
                  name={companyName}
                  size={18}
                />
                <ThemedText numberOfLines={1} style={styles.breadcrumbName} type="captionBold">{companyName}</ThemedText>
              </View>
              <PlatformIcon color={theme.textTertiary} name="chevron-right" size={14} />
              <Pressable
                accessibilityHint="Opens this task on its Project Board"
                accessibilityLabel={`Open Project ${projectName}${detail.board ? `, ${detail.board.name} Board` : ''}`}
                accessibilityRole="button"
                onPress={() => {
                  hapticLight();
                  if (detail.board) {
                    router.push(taskListHref(project, routeIdentity, undefined, undefined, {
                      boardId: detail.task.boardId,
                      taskId: detail.task._id,
                    }));
                  } else {
                    router.push(projectOverviewHref(project, routeIdentity ? {
                      archived: Boolean(routeIdentity.archived),
                      companyId: routeIdentity.companyId,
                      membershipId: routeIdentity.membershipId,
                    } : null));
                  }
                }}
                style={({ pressed }) => [styles.breadcrumbItem, pressed && styles.breadcrumbPressed]}
              >
                <EntityMark
                  colorKey={projectNavigation?.project?.markColorKey}
                  iconKey={projectNavigation?.project?.markIconKey}
                  id={String(project)}
                  kind="project"
                  name={projectName}
                  size={18}
                />
                <ThemedText numberOfLines={1} style={styles.breadcrumbName} type="captionBold">{projectName}</ThemedText>
              </Pressable>
            </View>
            <View style={styles.identityRow}>
              <Pressable
                accessibilityHint={keyCopied ? 'Task identifier copied to the clipboard' : 'Copies the full task identifier'}
                accessibilityLabel={keyCopied ? 'Task identifier copied' : `Copy task identifier ${detail.task.publicKey}`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  hapticLight();
                  Clipboard.setString(detail.task.publicKey);
                  setKeyCopied(true);
                  AccessibilityInfo.announceForAccessibility('Task identifier copied');
                  if (keyCopiedTimer.current) clearTimeout(keyCopiedTimer.current);
                  keyCopiedTimer.current = setTimeout(() => setKeyCopied(false), 1500);
                }}
                style={({ pressed }) => [styles.taskKeyButton, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.homeBorder }]}
              >
                <PlatformIcon color={theme.textTertiary} name={keyCopied ? 'check' : 'content-copy'} size={13} />
                <ThemedText themeColor="textSecondary" type="mono">
                  {keyCopied ? 'Copied' : `ID · ${shortTaskKey(detail.task.publicKey)}`}
                </ThemedText>
              </Pressable>
              {!readOnly ? <Pressable accessibilityLabel="Edit task title" accessibilityRole="button" hitSlop={8} onPress={() => setTitleDraft(detail.task.title)} style={({ pressed }) => [styles.editTitleButton, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
                <PlatformIcon color={theme.textSecondary} name="edit" size={16} />
                <ThemedText themeColor="textSecondary" type="captionBold">Edit</ThemedText>
              </Pressable> : null}
            </View>
            <View style={[styles.propertiesCard, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
              <View style={styles.propertyGrid}>
                <View style={styles.propertyField}>
                  <ThemedText themeColor="textSecondary" type="caption">Status</ThemedText>
                  <TaskStatusPill
                    category={detail.state?.category}
                    compact
                    label={detail.state?.name ?? 'Unknown'}
                    onPress={readOnly ? undefined : () => setField('status')}
                  />
                </View>
                <View style={[styles.propertyDividerVertical, { backgroundColor: theme.homeBorder }]} />
                <Pressable
                  accessibilityHint={readOnly ? undefined : 'Changes who owns this task'}
                  accessibilityLabel={`Assignee: ${displayedAssigneeName}`}
                  accessibilityRole={readOnly ? 'text' : 'button'}
                  disabled={readOnly}
                  onPress={() => setField('assignee')}
                  style={({ pressed }) => [styles.assigneeField, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}
                >
                  <ThemedText themeColor="textSecondary" type="caption">Assignee</ThemedText>
                  <View style={styles.assigneeValue}>
                    {detail.assignee
                      ? <ColoredAvatar label={displayedAssigneeName} seed={displayedAssigneeName} size={28} />
                      : <View style={[styles.unassignedAvatar, { backgroundColor: theme.backgroundElement }]}><PlatformIcon color={theme.textSecondary} name="person" size={15} /></View>}
                    <ThemedText numberOfLines={2} style={styles.assigneeCopy} type="captionBold">{displayedAssigneeName}</ThemedText>
                    {readOnly ? null : <PlatformIcon color={theme.textTertiary} name="chevron-right" size={14} />}
                  </View>
                </Pressable>
              </View>
              <View style={[styles.propertyDivider, { backgroundColor: theme.homeBorder }]} />
              <View style={styles.propertyGrid}>
                <View style={styles.propertyField}>
                  <ThemedText themeColor="textSecondary" type="caption">Priority</ThemedText>
                  <TaskPriorityBadge
                    compact
                    onPress={readOnly ? undefined : () => setField('priority')}
                    priority={detail.task.priority}
                    showNone
                  />
                </View>
                <View style={[styles.propertyDividerVertical, { backgroundColor: theme.homeBorder }]} />
                <View style={styles.propertyField}>
                  <ThemedText themeColor="textSecondary" type="caption">Due date</ThemedText>
                  <TaskDueChip
                    category={detail.state?.category}
                    compact
                    dueDate={detail.task.dueDate}
                    onPress={readOnly ? undefined : () => setField('dueDate')}
                    showNoDate
                  />
                </View>
              </View>
            </View>
          </ScreenEntrance>

          <View style={styles.updatesSection}>
            <View style={styles.updatesHeading}>
              <View style={styles.updatesTitleGroup}>
                <ThemedText accessibilityRole="header" type="subtitle">Updates</ThemedText>
                <ThemedText themeColor="textSecondary" type="caption">Comments and task history</ThemedText>
              </View>
              {filteredUpdates.length > 1 || hasMoreFilteredUpdates ? <Pressable
                accessibilityLabel={updatesExpanded ? 'Show latest update only' : 'Show all task updates'}
                accessibilityRole="button"
                accessibilityState={{ expanded: updatesExpanded }}
                onPress={() => {
                  setUpdatesExpanded((expanded) => !expanded);
                  if (!updatesExpanded && hasMoreFilteredUpdates) loadEarlierUpdates();
                }}
                style={styles.updatesToggle}>
                <ThemedText themeColor="accentStrong" type="captionBold">{updatesExpanded ? 'Show latest' : 'Show all'}</ThemedText>
                <PlatformIcon color={theme.accentStrong} name={updatesExpanded ? 'chevron-up' : 'chevron-down'} size={15} />
              </Pressable> : null}
            </View>
            <View accessibilityLabel="Filter task updates" accessibilityRole="tablist" style={styles.updateFilters}>
              {updateFilters.map(([key, label, count, hasMore]) => {
                const selected = updateFilter === key;
                return <CompactPillButton
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={key}
                  onPress={() => { setUpdateFilter(key); setUpdatesExpanded(false); }}
                  pillStyle={{ backgroundColor: selected ? theme.accentSoft : theme.homeSurface, borderColor: selected ? 'transparent' : theme.homeBorder }}
                  pressedPillStyle={{ backgroundColor: theme.backgroundSelected, borderColor: 'transparent' }}>
                  <ThemedText style={{ color: selected ? theme.accentStrong : theme.textSecondary }} type="captionBold">{label}</ThemedText>
                  <ThemedText style={{ color: selected ? theme.accentStrong : theme.textTertiary }} type="caption">{count}{hasMore ? '+' : ''}</ThemedText>
                </CompactPillButton>;
              })}
            </View>
            <TaskUpdatesFeed
              assignees={assignees}
              compact={!updatesExpanded && (filteredUpdates.length > 1 || hasMoreFilteredUpdates)}
              emptyMessage={updateFilter === 'comments' ? 'No comments yet' : updateFilter === 'activity' ? 'No task history yet' : 'No task updates yet'}
              loading={updatesLoading}
              loadingEarlier={updatesExpanded && hasMoreFilteredUpdates && (updateFilter === 'comments'
                ? commentPage.status === 'LoadingMore'
                : updateFilter === 'activity'
                  ? activityPage.status === 'LoadingMore'
                  : commentPage.status === 'LoadingMore' || activityPage.status === 'LoadingMore')}
              onLoadEarlier={updatesExpanded && hasMoreFilteredUpdates ? loadEarlierUpdates : undefined}
              updates={visibleUpdates}
              workflowStates={board?.states}
            />
          </View>

          <TaskOverview
            busy={busy}
            detail={detail}
            highlightSubtaskId={highlightSubtaskId ?? undefined}
            onAddSubtask={addSubtask}
            onChecklistLayout={(event) => { checklistY.current = event.nativeEvent.layout.y; }}
            onEditField={(next) => {
              if (next === 'description') setDescription(detail.task.description ?? '');
              setField(next);
            }}
            onOpenReference={openReference}
            onOpenSubtask={(item) => {
              router.push(taskDetailHref(project, item.task.publicKey, routeIdentity));
            }}
            onLoadMoreReferences={referencePage.status === 'CanLoadMore' ? () => referencePage.loadMore(50) : undefined}
            onSubtaskChange={setSubtask}
            onToggleSubtask={(item) => void toggleSubtask(item)}
            readOnly={readOnly}
            subtask={subtask}
            subtasks={subtasks}
            references={references}
            referencesLoading={referencePage.status === 'LoadingFirstPage'}
            referencesLoadingMore={referencePage.status === 'LoadingMore'}
            onLoadMoreSubtasks={childPage.status === 'CanLoadMore' ? () => childPage.loadMore(50) : undefined}
            onSubtaskBlur={blurChecklistInput}
            subtasksLoadingMore={childPage.status === 'LoadingMore'}
            onSubtaskFocus={focusChecklistInput}
          />

      </KeyboardAwareScrollView>

      {composerOpen && canComment ? <TaskCommentComposer
        assignees={assignees}
        busy={busy}
        mentionIds={mentionIds}
        onCancel={() => { commentSubmission.current.dismiss(); setComposerOpen(false); }}
        onChangeText={(value) => {
          commentSignature.current = JSON.stringify([projectId, taskKey, companyId, membershipId, value, mentionIds]);
          setComment(value);
        }}
        onMentionToggle={(memberId) => setMentionIds((current) => {
          const next = current.includes(memberId as Id<'projectMembers'>)
            ? current.filter((id) => id !== memberId)
            : [...current, memberId as Id<'projectMembers'>];
          commentSignature.current = JSON.stringify([projectId, taskKey, companyId, membershipId, comment, next]);
          return next;
        })}
        onSend={() => void addComment()}
        value={comment}
      /> : !keyboardVisible && (canAdvance || canComment) ? <View style={[styles.bottomDock, { backgroundColor: theme.background, borderTopColor: theme.hairline, paddingBottom: Math.max(Spacing.two, safeAreaInsets.bottom) }]}>
        {canAdvance ? <ActionButton
          icon={taskDecision.icon}
          label={taskDecision.label}
          loading={busy}
          onPress={() => {
            if (decisionState) void saveField({ workflowStateId: decisionState._id });
            else setField('status');
          }}
          style={styles.footerAction}
        /> : null}
        {canComment ? <ActionButton
          accessibilityHint="Opens the task update composer."
          icon="message"
          label="Update"
          onPress={() => setComposerOpen(true)}
          style={styles.footerAction}
          variant="secondary"
        /> : null}
      </View> : null}

      <OptionsSheet
        onClose={() => setField(null)}
        title={field ? fieldTitles[field] : ''}
        visible={field !== null}>
        {field === 'status' ? (
          <SheetSection>
            {board?.states.map((state) => (
              <SheetRow
                icon={state.category === 'completed' ? 'check-circle' : 'circle-outline'}
                key={state._id}
                label={state.name}
                onPress={() => void saveField({ workflowStateId: state._id })}
                selected={detail.task.workflowStateId === state._id}
              />
            ))}
          </SheetSection>
        ) : null}
        {field === 'priority' ? (
          <SheetSection>
            {priorities.map((value) => (
              <SheetRow
                icon="flag"
                key={value}
                label={taskPriorityLabel(value)}
                onPress={() => void saveField({ priority: value })}
                selected={detail.task.priority === value}
              />
            ))}
          </SheetSection>
        ) : null}
        {field === 'assignee' ? (
          <SheetSection>
            <SheetRow
              icon="person"
              label="Unassigned"
              disabled={!canClearAssignee}
              onPress={() => void saveField({ assigneeProjectMemberId: null })}
              selected={!detail.task.assigneeProjectMemberId}
            />
            {assignableAssignees?.map((item) => (
              <SheetRow
                icon="person"
                key={item.member._id}
                label={`${item.user.displayName}${item.company ? ` · ${item.company.displayName}` : ''}`}
                onPress={() => void saveField({ assigneeProjectMemberId: item.member._id })}
                selected={detail.task.assigneeProjectMemberId === item.member._id}
              />
            ))}
          </SheetSection>
        ) : null}
        {field === 'dueDate' ? (
          <DateField
            autoOpen
            onChange={(value) => void saveField({ dueDate: value })}
            value={detail.task.dueDate}
          />
        ) : null}
        {field === 'description' ? (
          <>
            <SheetInput autoFocus label="Description" multiline onChangeText={setDescription} value={description} />
            <SheetRow
              icon="check"
              label={busy ? 'Saving…' : 'Save description'}
              onPress={() => void saveField({ description: description.trim() || null })}
            />
          </>
        ) : null}
        {field === 'labels' ? (
          <SheetSection>
            {labels?.length ? labels.map((label) => (
              <SheetRow
                disabled={busy}
                icon="tag"
                key={label._id}
                label={label.name}
                onPress={() => void saveLabels(labelIds.includes(label._id)
                  ? labelIds.filter((id) => id !== label._id)
                  : [...labelIds, label._id])}
                selected={labelIds.includes(label._id)}
              />
            )) : <SheetNote>No labels available.</SheetNote>}
          </SheetSection>
        ) : null}
        {field === 'more' ? (
          <SheetSection>
            {!readOnly && detail.capabilities.canComment ? <SheetRow
              detail="Get notified when this task changes."
              icon={detail.following ? 'bell-off-outline' : 'bell-outline'}
              label={detail.following ? 'Stop following task updates' : 'Follow task updates'}
              onPress={() => {
                setField(null);
                void run(() => setFollowing({
                  taskId: detail.task._id,
                  enabled: !detail.following,
                  ...identity,
                }));
              }}
              selected={detail.following}
            /> : null}
            <SheetRow
              icon="project"
              label="View project"
              onPress={() => {
                setField(null);
                router.push(projectOverviewHref(project, routeIdentity ? {
                  archived: Boolean(routeIdentity.archived),
                  companyId: routeIdentity.companyId,
                  membershipId: routeIdentity.membershipId,
                } : null));
              }}
            />
            <SheetRow
              icon="view-board"
              label="Show on board"
              onPress={() => {
                setField(null);
                router.push(taskListHref(project, routeIdentity, undefined, undefined, {
                  boardId: detail.task.boardId,
                  taskId: detail.task._id,
                }));
              }}
            />
            {detail.capabilities.canArchive ? (
              <SheetRow
                destructive={!detail.task.archivedAt}
                icon={detail.task.archivedAt ? 'archive-restore' : 'archive'}
                label={detail.task.archivedAt ? 'Restore task' : 'Archive task'}
                onPress={() => {
                  setField(null);
                  void run(() => setArchived({
                    taskId: detail.task._id,
                    archived: !detail.task.archivedAt,
                    ...identity,
                  }));
                }}
              />
            ) : null}
          </SheetSection>
        ) : null}
      </OptionsSheet>

      <OptionsSheet
        onClose={() => { setConfirmPatch(null); setError(''); }}
        title="Open checklist items"
        visible={Boolean(confirmPatch)}>
        <SheetNote>
          {openSubtaskCount} {openSubtaskCount === 1 ? 'checklist item is' : 'checklist items are'} still open.
        </SheetNote>
        <ActionButton label="Review checklist" onPress={reviewOpenChecklist} />
        <ActionButton
          label="Complete anyway"
          onPress={() => {
            const patch = confirmPatch;
            setConfirmPatch(null);
            setError('');
            if (patch) void saveField(patch, true);
          }}
          variant="secondary"
        />
        <ActionButton label="Cancel" onPress={() => { setConfirmPatch(null); setError(''); }} variant="secondary" />
      </OptionsSheet>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four, padding: Spacing.four, paddingTop: MobileHeaderMetrics.contentTop },
  footerAction: { alignSelf: 'stretch', borderCurve: 'continuous', borderRadius: Radius.large, flex: 1 },
  assigneeCopy: { flex: 1, gap: 2, minWidth: 0 },
  assigneeField: { flex: 1, gap: Spacing.one, justifyContent: 'center', minHeight: 56, minWidth: 0, paddingHorizontal: Spacing.one, paddingVertical: Spacing.one },
  assigneeValue: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, minWidth: 0 },
  bottomDock: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  editTitleButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, flexDirection: 'row', gap: Spacing.one, justifyContent: 'center', minHeight: TouchTarget, minWidth: TouchTarget, paddingHorizontal: Spacing.two },
  identityRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', minHeight: TouchTarget },
  taskKeyButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.one, minHeight: 36, paddingHorizontal: Spacing.two },
  projectCrumbs: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, minWidth: 0 },
  breadcrumbItem: { alignItems: 'center', flexGrow: 0, flexDirection: 'row', flexShrink: 1, gap: Spacing.one, maxWidth: '48%', minHeight: TouchTarget, minWidth: 0 },
  breadcrumbPressed: { opacity: 0.68 },
  breadcrumbName: { flexShrink: 1, minWidth: 0 },
  propertiesCard: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  propertyDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.one },
  propertyGrid: { alignItems: 'stretch', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.one, paddingVertical: Spacing.two },
  propertyDividerVertical: { width: StyleSheet.hairlineWidth },
  propertyField: { flex: 1, gap: Spacing.one, justifyContent: 'center', minHeight: 56, minWidth: 0, paddingHorizontal: Spacing.one, paddingVertical: Spacing.one },
  unassignedAvatar: { alignItems: 'center', borderRadius: Radius.pill, height: 34, justifyContent: 'center', width: 34 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: MobileHeaderMetrics.actionGap },
  hero: { gap: Spacing.two },
  titleHeading: { alignSelf: 'stretch', minWidth: 0 },
  titleEdit: { flex: 1, gap: Spacing.two, minWidth: 0 },
  titleEditActions: { flexDirection: 'row', gap: Spacing.two },
  titleEditButton: { flex: 1 },
  screen: { flex: 1 },
  taskTitle: { ...Typography.display, fontSize: 22, letterSpacing: -0.35, lineHeight: 27, minWidth: 0 },
  updatesToggle: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: Spacing.one, minHeight: TouchTarget, paddingHorizontal: Spacing.one },
  updatesHeading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', minHeight: TouchTarget },
  updatesTitleGroup: { flex: 1, gap: Spacing.half, minWidth: 0 },
  updateFilters: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  updatesSection: { gap: Spacing.two, paddingTop: Spacing.two },
  titleInput: {
    flex: 1,
    borderCurve: 'continuous',
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
