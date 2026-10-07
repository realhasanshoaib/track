import type { TaskPriority } from '@track/shared/tasks';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useNetworkState } from 'expo-network';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import { MaxFontScale, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTrackUser } from '@/contexts/track-user-context';
import { useTheme } from '@/hooks/use-theme';
import { taskErrorMessage } from '@/lib/user-facing-error';
import { useBottomTabBarInset } from '@/hooks/use-bottom-tab-inset';
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
  const bottomTabBarInset = useBottomTabBarInset();
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
  const detail = useQuery(api.tasks.getByKey, release.tasks ? {
    projectId: project,
    publicKey: taskKey,
    ...identity,
  } : 'skip');
  const boards = useQuery(api.taskBoards.list, release.tasks ? {
    projectId: project,
    ...identity,
  } : 'skip');
  const childPage = usePaginatedQuery(api.tasks.listChildren, detail ? {
    parentTaskId: detail.task._id,
    includeArchived: archive === '1' || Boolean(detail.task.archivedAt),
    ...identity,
  } : 'skip', { initialNumItems: 50 });
  const commentPage = usePaginatedQuery(api.tasks.listHistory, detail ? {
    taskId: detail.task._id,
    kind: 'comments',
    ...identity,
  } : 'skip', { initialNumItems: 50 });
  const activityPage = usePaginatedQuery(api.tasks.listHistory, detail ? {
    taskId: detail.task._id,
    kind: 'activities',
    ...identity,
  } : 'skip', { initialNumItems: 50 });
  const referencePage = usePaginatedQuery(api.tasks.listReferences, detail ? {
    taskId: detail.task._id,
    ...identity,
  } : 'skip', { initialNumItems: 50 });
  const assignees = useQuery(api.tasks.listEligibleAssignees, detail && archive !== '1' ? {
    projectId: project,
    groupId: detail.task.groupId,
    ...identity,
  } : 'skip');
  const projectNavigation = useQuery(api.mobile.resolveNavigation, trackUserId && projectId ? {
    userId: trackUserId,
    projectId: project,
    actingCompanyId: companyId as Id<'companies'> | undefined,
    projectMemberId: membershipId as Id<'projectMembers'> | undefined,
  } : 'skip');
  const assignableAssignees = useMemo(() => {
    if (!assignees || !detail) return assignees;
    if (detail.capabilities.canAssignOthers) return assignees;
    return assignees.filter((item) => item.member._id === identity.projectMemberId);
  }, [assignees, detail, identity.projectMemberId]);
  const canClearAssignee = Boolean(detail?.capabilities.canAssignOthers)
    || detail?.task.assigneeProjectMemberId === identity.projectMemberId;
  const labels = useQuery(api.taskLabels.list, release.tasks && archive !== '1' ? {
    projectId: project,
    ...identity,
  } : 'skip');
  const updateTask = useMutation(api.tasks.update);
  const createTask = useMutation(api.tasks.create);
  const createComment = useMutation(api.taskComments.create);
  const setFollowing = useMutation(api.tasks.setFollowing);
  const setArchived = useMutation(api.tasks.setArchived);
  const setTaskLabels = useMutation(api.taskLabels.setTaskLabels);
  const [field, setField] = useState<TaskEditField | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
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
  const scrollRef = useRef<ScrollView>(null);
  const subtaskIntentRef = useRef(idempotencyKey());
  const commentDraftKey = useRef<string | null>(null);
  const subtaskPendingRef = useRef(false);
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

  useEffect(() => {
    if (!detail || detail.task.publicKey !== taskKey) return;
    const nextSnapshot = {
      description: detail.task.description ?? '',
      title: detail.task.title,
    };
    if (taskIdentityRef.current !== taskIdentity || !serverSnapshotRef.current || !baselineSnapshotRef.current) {
      taskIdentityRef.current = taskIdentity;
      serverSnapshotRef.current = nextSnapshot;
      baselineSnapshotRef.current = nextSnapshot;
      savedRevision.current = detail.task.revision;
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
    if ((titleDirty && titleChanged) || (descriptionDirty && descriptionChanged)) setConflict(true);
    if (!titleDirty && titleDraft !== null && titleDraft !== nextSnapshot.title) setTitleDraft(nextSnapshot.title);
    if (!descriptionDirty && field === 'description' && description !== nextSnapshot.description) setDescription(nextSnapshot.description);
    serverSnapshotRef.current = nextSnapshot;
    if (!titleDirty && !descriptionDirty) {
      baselineSnapshotRef.current = nextSnapshot;
      savedRevision.current = detail.task.revision;
    }
  }, [description, detail, field, taskIdentity, taskKey, titleDraft]);

  const offline = network.isConnected === false || network.isInternetReachable === false;
  const board = boards?.find((item) => item.board._id === detail?.task.boardId);
  const subtasks = useMemo(() => childPage.results, [childPage.results]);
  const visibleSubtasks = uniqueTaskViews(subtasks);
  const openSubtaskCount = visibleSubtasks.filter((item) =>
    item.state?.category !== 'completed' && item.state?.category !== 'canceled',
  ).length;
  const comments = useMemo(
    () => commentPage.results.filter((item): item is Doc<'taskComments'> => 'body' in item),
    [commentPage.results],
  );
  const activities = useMemo(
    () => activityPage.results.filter((item): item is Doc<'taskActivities'> => 'action' in item),
    [activityPage.results],
  );
  const hasMoreUpdates = commentPage.status === 'CanLoadMore' || commentPage.status === 'LoadingMore'
    || activityPage.status === 'CanLoadMore' || activityPage.status === 'LoadingMore';
  const updates = useMemo(() => visibleTaskUpdates(
    comments,
    activities,
    commentPage.status === 'CanLoadMore' || commentPage.status === 'LoadingMore',
    activityPage.status === 'CanLoadMore' || activityPage.status === 'LoadingMore',
  ), [activities, activityPage.status, commentPage.status, comments]);
  const references = referencePage.results;
  const readOnly = archive === '1' || Boolean(detail && !detail.capabilities.canEdit);
  const labelIds = detail?.labels.flatMap((label) => label ? [label._id] : []) ?? [];

  async function run(action: () => Promise<unknown>, clear?: () => void) {
    setBusy(true);
    setError('');
    try {
      await action();
      clear?.();
      hapticMedium();
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof Error && failure.message.includes('task_conflict')) {
        savedRevision.current = null;
        setConflict(true);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveField(patch: TaskFieldPatch, confirmOpenSubtasks?: boolean) {
    if (!detail) return;
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
      if (patch.title !== undefined) setTitleDraft(null);
      hapticMedium();
    } catch (failure) {
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
      setBusy(false);
    }
  }

  async function saveLabels(next: Array<Id<'taskLabels'>>) {
    if (!detail) return;
    await run(async () => {
      savedRevision.current = await setTaskLabels({
        taskId: detail.task._id,
        labelIds: next,
        expectedRevision: savedRevision.current ?? detail.task.revision,
        ...identity,
      });
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
    setBusy(true);
    setError('');
    try {
      await createComment({
        taskId: detail.task._id,
        body,
        mentionedProjectMemberIds: mentionIds,
        idempotencyKey: commentDraftKey.current ??= idempotencyKey(),
        ...identity,
      });
      setComment('');
      commentDraftKey.current = null;
      setMentionIds([]);
      setComposerOpen(false);
    } catch (failure) {
      setError(taskErrorMessage(failure, 'The update could not be added. Check your connection and try again.'));
    } finally {
      setBusy(false);
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
    subtaskPendingRef.current = true;
    void run(() => createTask({
      projectId: project,
      boardId: detail.task.boardId,
      parentTaskId: detail.task._id,
      title: subtask.trim(),
      priority: 'none',
      idempotencyKey: subtaskIntentRef.current,
      ...identity,
    }), () => {
      setSubtask('');
      subtaskIntentRef.current = idempotencyKey();
    }).finally(() => {
      subtaskPendingRef.current = false;
    });
  }

  if (!release.tasks) {
    return (
      <ThemedView style={styles.screen}>
        <EmptyState icon="task" title="Tasks aren’t available here yet" body="You can still use Project conversations while task tools are unavailable." />
      </ThemedView>
    );
  }
  if (detail === undefined) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: taskKey ? shortTaskKey(taskKey) : 'Task' }} />
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
  const updatesLoading = updateFilter === 'comments'
    ? commentPage.status === 'LoadingFirstPage'
    : updateFilter === 'activity'
      ? activityPage.status === 'LoadingFirstPage'
      : commentPage.status === 'LoadingFirstPage' || activityPage.status === 'LoadingFirstPage';
  const taskDecision = taskDecisionForCategory(detail.state?.category);
  const decisionState = board?.states.find((state) => state.category === taskDecision.targetCategory);
  const canAdvance = !readOnly;
  const filteredUpdates = updateFilter === 'all'
    ? updates
    : updates.filter(({ kind }) => updateFilter === 'comments' ? kind === 'comment' : kind === 'activity');
  const visibleUpdates = updatesExpanded ? filteredUpdates : filteredUpdates.slice(-1);
  const hasMoreFilteredUpdates = updateFilter === 'comments'
    ? commentPage.status === 'CanLoadMore' || commentPage.status === 'LoadingMore'
    : updateFilter === 'activity'
      ? activityPage.status === 'CanLoadMore' || activityPage.status === 'LoadingMore'
      : hasMoreUpdates;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{
        title: 'Task',
        headerRight: () => (
          <View style={styles.headerActions}>
            <IconButton
              accessibilityLabel={detail.following ? 'Unfollow task' : 'Follow task'}
              appearance="plain"
              icon="bookmark"
              onPress={() => void run(() => setFollowing({
                taskId: detail.task._id,
                enabled: !detail.following,
                ...identity,
              }))}
              selected={detail.following}
            />
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Spacing.four },
          ]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled">
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
              <View style={styles.titleRow}>
                <ThemedText accessibilityRole="header" style={styles.taskTitle}>{detail.task.title}</ThemedText>
                {!readOnly ? <Pressable accessibilityLabel="Edit task title" accessibilityRole="button" hitSlop={8} onPress={() => setTitleDraft(detail.task.title)} style={({ pressed }) => [styles.editTitleButton, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.homeBorder }]}>
                  <PlatformIcon color={theme.textSecondary} name="edit" size={17} />
                  <ThemedText themeColor="textSecondary" type="captionBold">Edit</ThemedText>
                </Pressable> : null}
              </View>
            ) : (
              <ThemedTextInput
                accessibilityLabel="Task title"
                allowFontScaling
                autoFocus
                ref={focusTitleInput}
                cursorColor={theme.accent}
                keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
                maxFontSizeMultiplier={MaxFontScale}
                multiline
                onBlur={() => {
                  const next = titleDraft.trim();
                  if (!next || next === detail.task.title) {
                    setTitleDraft(null);
                    return;
                  }
                  void saveField({ title: next });
                }}
                onChangeText={setTitleDraft}
                selectionColor={theme.accent}
                selectionHandleColor={theme.accent}
                style={[styles.taskTitle, styles.titleInput, {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                }]}
                value={titleDraft}
              />
            )}
            <View style={styles.identityRow}>
              <TaskStatusPill
                category={detail.state?.category}
                label={detail.state?.name ?? 'Unknown'}
                onPress={readOnly ? undefined : () => setField('status')}
              />
              <Pressable
                accessibilityHint="Copies the full task id"
                accessibilityLabel={`Task id ${detail.task.publicKey}`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  hapticLight();
                  Clipboard.setString(detail.task.publicKey);
                  setKeyCopied(true);
                  setTimeout(() => setKeyCopied(false), 1500);
                }}
                style={({ pressed }) => [styles.taskKeyButton, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.homeBorder }]}
              >
                <PlatformIcon color={theme.textTertiary} name={keyCopied ? 'check' : 'content-copy'} size={13} />
                <ThemedText themeColor="textSecondary" type="mono">
                  {keyCopied ? 'Copied' : shortTaskKey(detail.task.publicKey)}
                </ThemedText>
              </Pressable>
            </View>
            <Pressable
              accessibilityHint="Opens this task on its Project Board"
              accessibilityLabel={`Open ${projectNavigation?.available && projectNavigation.project ? projectNavigation.project.name : 'Project'}${detail.board ? `, ${detail.board.name} Board` : ''}`}
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
              style={({ pressed }) => [styles.projectBoardCard, { backgroundColor: pressed ? theme.backgroundSelected : theme.homeSurface, borderColor: theme.homeBorder }]}
            >
              <EntityMark
                colorKey={projectNavigation?.project?.markColorKey}
                iconKey={projectNavigation?.project?.markIconKey}
                id={String(project)}
                kind="project"
                name={projectNavigation?.project?.name ?? 'Project'}
                size={40}
              />
              <View style={styles.projectBoardCopy}>
                <ThemedText themeColor="textTertiary" type="captionBold">PROJECT</ThemedText>
                <ThemedText numberOfLines={1} type="smallBold">{projectNavigation?.available && projectNavigation.project ? projectNavigation.project.name : 'Project'}</ThemedText>
                <View style={styles.boardDestination}>
                  <PlatformIcon color={theme.textSecondary} name="view-board" size={14} />
                  <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{detail.board?.name ?? 'Project overview'}</ThemedText>
                </View>
              </View>
              <PlatformIcon color={theme.textSecondary} name="chevron-right" size={19} />
            </Pressable>
            <View style={[styles.propertiesCard, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
              <Pressable
                accessibilityHint={readOnly ? undefined : 'Changes who owns this task'}
                accessibilityLabel={`Assignee: ${assigneeName}`}
                accessibilityRole={readOnly ? 'text' : 'button'}
                disabled={readOnly}
                onPress={() => setField('assignee')}
                style={({ pressed }) => [styles.assigneeRow, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}
              >
                {detail.assignee
                  ? <ColoredAvatar label={assigneeName} seed={assigneeName} size={36} />
                  : <View style={[styles.unassignedAvatar, { backgroundColor: theme.backgroundElement }]}><PlatformIcon color={theme.textSecondary} name="person" size={17} /></View>}
                <View style={styles.assigneeCopy}>
                  <ThemedText themeColor="textSecondary" type="caption">Assignee</ThemedText>
                  <ThemedText numberOfLines={1} type="smallBold">{assigneeName}</ThemedText>
                </View>
                {readOnly ? null : <PlatformIcon color={theme.textTertiary} name="chevron-right" size={16} />}
              </Pressable>
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
                    dueDate={detail.task.dueDate}
                    onPress={readOnly ? undefined : () => setField('dueDate')}
                    showNoDate
                  />
                </View>
              </View>
            </View>
          </ScreenEntrance>

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
            onOpenSubtask={(item) => router.push(taskDetailHref(project, item.task.publicKey, routeIdentity))}
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
            subtasksLoadingMore={childPage.status === 'LoadingMore'}
          />

          <View style={styles.updatesSection}>
            <View style={styles.updatesHeading}>
              <View style={styles.updatesTitleGroup}>
                <ThemedText accessibilityRole="header" type="subtitle">Updates</ThemedText>
                <ThemedText themeColor="textSecondary" type="caption">Comments and task history</ThemedText>
              </View>
              {filteredUpdates.length ? <View style={[styles.updatesCount, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText themeColor="textSecondary" type="captionBold">{filteredUpdates.length}{hasMoreFilteredUpdates ? '+' : ''}</ThemedText>
              </View> : null}
            </View>
            <View accessibilityLabel="Filter task updates" accessibilityRole="tablist" style={styles.updateFilters}>
              {([
                ['all', 'All', updates.length],
                ['comments', 'Comments', updates.filter(({ kind }) => kind === 'comment').length],
                ['activity', 'Activity', updates.filter(({ kind }) => kind === 'activity').length],
              ] as const).map(([key, label, count]) => {
                const selected = updateFilter === key;
                return <CompactPillButton
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={key}
                  onPress={() => { setUpdateFilter(key); setUpdatesExpanded(false); }}
                  pillStyle={{ backgroundColor: selected ? theme.accentSoft : theme.homeSurface, borderColor: selected ? 'transparent' : theme.homeBorder }}
                  pressedPillStyle={{ backgroundColor: theme.backgroundSelected, borderColor: 'transparent' }}>
                  <ThemedText style={{ color: selected ? theme.accentStrong : theme.textSecondary }} type="captionBold">{label}</ThemedText>
                  <ThemedText style={{ color: selected ? theme.accentStrong : theme.textTertiary }} type="caption">{count}{hasMoreFilteredUpdates && selected && count > 0 ? '+' : ''}</ThemedText>
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
            {filteredUpdates.length > 1 || hasMoreFilteredUpdates ? <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: updatesExpanded }}
              onPress={() => {
                setUpdatesExpanded((expanded) => !expanded);
                if (!updatesExpanded && hasMoreFilteredUpdates) loadEarlierUpdates();
              }}
              style={styles.updatesToggle}>
              <ThemedText themeColor="accentStrong" type="smallBold">{updatesExpanded ? 'Show latest only' : 'View all updates'}</ThemedText>
              <PlatformIcon color={theme.accentStrong} name={updatesExpanded ? 'chevron-up' : 'chevron-down'} size={15} />
            </Pressable> : null}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {composerOpen && detail.capabilities.canComment ? <TaskCommentComposer
        assignees={assignees}
        busy={busy}
        mentionIds={mentionIds}
        onCancel={() => setComposerOpen(false)}
        onChangeText={(value) => {
          if (value !== comment) commentDraftKey.current = null;
          setComment(value);
        }}
        onMentionToggle={(memberId) => setMentionIds((current) => current.includes(memberId as Id<'projectMembers'>)
          ? current.filter((id) => id !== memberId)
          : [...current, memberId as Id<'projectMembers'>])}
        onSend={() => void addComment()}
        value={comment}
      /> : !keyboardVisible && (canAdvance || detail.capabilities.canComment) ? <View style={[styles.bottomDock, { backgroundColor: theme.background, borderTopColor: theme.hairline, marginBottom: bottomTabBarInset, paddingBottom: safeAreaInsets.bottom + Spacing.six }]}>
        {canAdvance ? <ActionButton
          icon={taskDecision.icon}
          label={taskDecision.label}
          loading={busy}
          onPress={() => {
            if (decisionState) void saveField({ workflowStateId: decisionState._id });
            else setField('status');
          }}
          style={styles.decisionButton}
        /> : null}
        {detail.capabilities.canComment ? <Pressable
          accessibilityLabel="Write a task update"
          accessibilityRole="button"
          onPress={() => setComposerOpen(true)}
          style={({ pressed }) => [styles.updateButton, !canAdvance && styles.expandedUpdateButton, { backgroundColor: pressed ? theme.backgroundElement : 'transparent' }]}
        >
          <PlatformIcon color={theme.textSecondary} name="message" size={18} />
          <ThemedText themeColor="textSecondary" type="captionBold">Update</ThemedText>
        </Pressable> : null}
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
                icon="tag"
                key={label._id}
                label={label.name}
                onPress={() => void saveLabels(labelIds.includes(label._id)
                  ? labelIds.filter((id) => id !== label._id)
                  : [...labelIds, label._id])}
                selected={labelIds.includes(label._id)}
              />
            )) : <SheetRow icon="tag" label="No labels defined yet" onPress={() => setField(null)} />}
          </SheetSection>
        ) : null}
        {field === 'more' ? (
          <SheetSection>
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
  content: { gap: Spacing.five, padding: Spacing.four, paddingTop: Spacing.five },
  decisionButton: { alignSelf: 'stretch', flex: 1 },
  assigneeCopy: { flex: 1, gap: 2, minWidth: 0 },
  assigneeRow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, paddingHorizontal: Spacing.two },
  bottomDock: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  editTitleButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.one, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  expandedUpdateButton: { flex: 1 },
  identityRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  taskKeyButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.one, minHeight: 36, paddingHorizontal: Spacing.two },
  projectBoardCard: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.three, minHeight: 84, padding: Spacing.three },
  projectBoardCopy: { flex: 1, gap: Spacing.half, minWidth: 0 },
  boardDestination: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  propertiesCard: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  propertyDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.one },
  propertyGrid: { alignItems: 'stretch', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.one, paddingVertical: Spacing.two },
  propertyDividerVertical: { width: StyleSheet.hairlineWidth },
  propertyField: { flex: 1, gap: Spacing.one, justifyContent: 'center', minWidth: 0 },
  unassignedAvatar: { alignItems: 'center', borderRadius: Radius.pill, height: 34, justifyContent: 'center', width: 34 },
  updateButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, flexDirection: 'row', gap: Spacing.one, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  headerActions: { alignItems: 'center', flexDirection: 'row' },
  hero: { gap: Spacing.three },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.one },
  screen: { flex: 1 },
  taskTitle: { ...Typography.display, flex: 1, fontSize: 28, letterSpacing: -0.5, lineHeight: 35, minWidth: 0 },
  updatesToggle: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: Spacing.one, minHeight: TouchTarget, paddingHorizontal: Spacing.one },
  updatesHeading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', minHeight: TouchTarget },
  updatesTitleGroup: { flex: 1, gap: Spacing.half, minWidth: 0 },
  updateFilters: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  updatesSection: { gap: Spacing.two, paddingTop: Spacing.two },
  updatesCount: { alignItems: 'center', borderRadius: Radius.pill, justifyContent: 'center', minHeight: 24, minWidth: 24, paddingHorizontal: Spacing.two },
  titleInput: {
    borderCurve: 'continuous',
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
