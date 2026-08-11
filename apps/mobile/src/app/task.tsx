import type { TaskPriority } from '@track/shared/tasks';
import { useMutation, useQuery } from 'convex/react';
import { useNetworkState } from 'expo-network';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { EmptyState } from '@/components/empty-state';
import { OptionsSheet, SheetInput, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import {
  TaskActivityTab,
  TaskCommentComposer,
  TaskDetailsTab,
  TaskDiscussionTab,
} from '@/components/task-detail-content';
import type {
  MobileTaskAssignee,
  MobileTaskBoard,
  MobileTaskDetail,
  MobileTaskListItem,
} from '@/components/task-detail-types';
import {
  TaskAction,
  TaskCardSkeletons,
  TaskPriorityBadge,
  TaskSegmentedControl,
  TaskStateBanner,
  TaskStatusPill,
} from '@/components/task-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { useReleaseConfig } from '@/lib/release-config';
import { setActivePushContext } from '@/lib/push-presentation';
import { localTaskDate, taskDueLabel, taskPriorityLabel } from '@/lib/task-presentation';
import { formatDate, useLocale } from '@/i18n';
import { useTranslation } from 'react-i18next';

type DetailTab = 'details' | 'discussion' | 'activity';

const priorities: TaskPriority[] = ['none', 'urgent', 'high', 'medium', 'low'];
const detailTabs: DetailTab[] = ['details', 'discussion', 'activity'];

function errorMessage(failure: unknown, t: (key: string) => string) {
  if (!(failure instanceof Error)) return t('task.safeError');
  if (failure.message.includes('task_conflict')) return t('task.conflict');
  if (failure.message.includes('task_access_changed')) return t('task.accessChanged');
  return t('task.safeError');
}

export default function TaskScreen() {
  const theme = useTheme();
  const { locale } = useLocale();
  const { t } = useTranslation('work');
  const release = useReleaseConfig();
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
  const detail = useQuery(api.tasks.getByKey, release.tasks ? {
    projectId: project,
    publicKey: taskKey,
    ...identity,
  } : 'skip') as MobileTaskDetail | null | undefined;
  const boards = useQuery(api.taskBoards.list, release.tasks ? {
    projectId: project,
    ...identity,
  } : 'skip') as MobileTaskBoard[] | undefined;
  const allTasks = useQuery(api.tasks.list, release.tasks ? {
    projectId: project,
    ...identity,
  } : 'skip') as MobileTaskListItem[] | undefined;
  const assignees = useQuery(api.tasks.listEligibleAssignees, detail && archive !== '1' ? {
    projectId: project,
    groupId: detail.task.groupId,
    ...identity,
  } : 'skip') as MobileTaskAssignee[] | undefined;
  const labels = useQuery(api.taskLabels.list, release.tasks && archive !== '1' ? {
    projectId: project,
    ...identity,
  } : 'skip') as Array<Doc<'taskLabels'>> | undefined;
  const updateTask = useMutation(api.tasks.update);
  const createTask = useMutation(api.tasks.create);
  const createComment = useMutation(api.taskComments.create);
  const setFollowing = useMutation(api.tasks.setFollowing);
  const setArchived = useMutation(api.tasks.setArchived);
  const setTaskLabels = useMutation(api.taskLabels.setTaskLabels);
  const [tab, setTab] = useState<DetailTab>('details');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [dueDate, setDueDate] = useState('');
  const [stateId, setStateId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [labelIds, setLabelIds] = useState<Array<Id<'taskLabels'>>>([]);
  const [comment, setComment] = useState('');
  const [mentionIds, setMentionIds] = useState<Array<Id<'projectMembers'>>>([]);
  const [subtask, setSubtask] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  const applyDetailToDraft = useCallback((next: MobileTaskDetail) => {
    setTitle(next.task.title);
    setDescription(next.task.description ?? '');
    setPriority(next.task.priority);
    setDueDate(next.task.dueDate ?? '');
    setStateId(next.task.workflowStateId);
    setAssigneeId(next.task.assigneeProjectMemberId ?? '');
    setLabelIds(next.labels.map((label) => label._id));
  }, []);

  useEffect(() => {
    if (detail && !editOpen) applyDetailToDraft(detail);
  }, [applyDetailToDraft, detail, editOpen]);

  const offline = network.isConnected === false || network.isInternetReachable === false;
  const board = boards?.find((item) => item.board._id === detail?.task.boardId);
  const subtasks = useMemo(
    () => allTasks?.filter((item) => item.task.parentTaskId === detail?.task._id) ?? [],
    [allTasks, detail?.task._id],
  );
  const completedSubtasks = subtasks.filter((item) =>
    item.state?.category === 'completed' || item.state?.category === 'canceled',
  ).length;
  const readOnly = archive === '1' || Boolean(detail && !detail.capabilities.canEdit);

  async function run(action: () => Promise<unknown>, clear?: () => void) {
    setBusy(true);
    setError('');
    try {
      await action();
      clear?.();
      hapticMedium();
    } catch (failure) {
      const message = errorMessage(failure, t);
      setError(message);
      if (failure instanceof Error && failure.message.includes('task_conflict')) {
        setConflict(true);
        setEditOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveTask() {
    if (!detail) return;
    await run(async () => {
      const revision = await updateTask({
        taskId: detail.task._id,
        expectedRevision: editRevision ?? detail.task.revision,
        title: title.trim(),
        description: description.trim() || null,
        workflowStateId: stateId as Id<'taskWorkflowStates'>,
        assigneeProjectMemberId: assigneeId ? assigneeId as Id<'projectMembers'> : null,
        priority,
        dueDate: dueDate.trim() || null,
        confirmOpenSubtasks: true,
        ...identity,
      });
      const currentLabels = detail.labels.map((label) => String(label._id)).sort().join(',');
      const nextLabels = labelIds.map(String).sort().join(',');
      if (currentLabels !== nextLabels) {
        await setTaskLabels({
          taskId: detail.task._id,
          labelIds,
          expectedRevision: revision,
          ...identity,
        });
      }
    }, () => {
      setEditOpen(false);
      setEditRevision(null);
    });
  }

  async function toggleSubtask(item: MobileTaskListItem) {
    if (!board) return;
    const terminal = item.state?.category === 'completed' || item.state?.category === 'canceled';
    const destination = terminal
      ? board.states.find((state) => state.isDefault)
        ?? board.states.find((state) => state.category === 'unstarted')
      : board.states.find((state) => state.category === 'completed');
    if (!destination) return;
    await run(() => updateTask({
      taskId: item.task._id,
      expectedRevision: item.task.revision,
      workflowStateId: destination._id,
      confirmOpenSubtasks: true,
      ...identity,
    }));
  }

  function reviewConflict() {
    if (detail) applyDetailToDraft(detail);
    setConflict(false);
    setError('');
    setEditRevision(null);
  }

  if (!release.tasks) {
    return (
      <ThemedView style={styles.screen}>
        <EmptyState icon="file-document-outline" title={t('tasks.unavailable')} body={t('tasks.unavailableBody')} />
      </ThemedView>
    );
  }
  if (detail === undefined) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: taskKey || t('common.task') }} />
        <View style={styles.loading}>
          <View style={[styles.loadingHero, { backgroundColor: theme.backgroundElement }]} />
          <TaskCardSkeletons count={3} />
        </View>
      </ThemedView>
    );
  }
  if (!detail) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: t('task.taskUnavailable') }} />
        <EmptyState icon="shield-lock-outline" title={t('task.taskUnavailable')} body={t('task.taskUnavailableBody')} />
      </ThemedView>
    );
  }

  const assigneeName = assignees?.find((item) => item.member._id === detail.task.assigneeProjectMemberId)?.user.displayName
    ?? (detail.assignee ? t('common.assignedMember') : t('common.unassigned'));
  const due = taskDueLabel(detail.task.dueDate, undefined, detail.state?.category, { formatDate, locale, t });
  const overdue = Boolean(detail.task.dueDate && detail.task.dueDate < localTaskDate() && detail.state?.category !== 'completed' && detail.state?.category !== 'canceled');

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{
        title: detail.task.publicKey,
        headerRight: () => detail.capabilities.canEdit && archive !== '1' ? (
          <Pressable
            accessibilityLabel={t('task.editAccessibility')}
            onPress={() => {
              hapticLight();
              applyDetailToDraft(detail);
              setEditRevision(detail.task.revision);
              setEditOpen(true);
            }}
            style={styles.headerButton}>
            <PlatformIcon color={theme.accent} name="edit" size={21} />
          </Pressable>
        ) : null,
      }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={[styles.content, tab === 'discussion' && styles.contentWithComposer]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled">
          {offline ? <TaskStateBanner icon="cloud-off" message={t('task.offline')} tone="offline" /> : null}
          {archive === '1' ? <TaskStateBanner icon="shield-lock-outline" message={t('task.readOnlyArchive')} /> : null}
          {readOnly && archive !== '1' ? <TaskStateBanner icon="shield-lock-outline" message={t('task.restrictedEditing')} /> : null}
          {detail.restrictedEarlierContext ? (
            <TaskStateBanner icon="shield-lock-outline" message={t('task.restrictedContext')} />
          ) : null}
          {conflict ? (
            <TaskStateBanner
              action={{ label: t('task.reviewLatest'), onPress: reviewConflict }}
              icon="refresh"
              message={t('task.changedElsewhere')}
              tone="danger"
            />
          ) : error ? (
            <TaskStateBanner action={{ label: t('tasks.dismissError'), onPress: () => setError('') }} icon="refresh" message={error} tone="danger" />
          ) : null}

          <View style={styles.hero}>
            <View style={styles.eyebrow}>
              <View style={styles.eyebrowKey}>
                <ThemedText contentDirection="ltr" style={{ color: theme.textSecondary }} type="code">{detail.task.publicKey}</ThemedText>
                <ThemedText style={{ color: theme.textSecondary }} type="code">·</ThemedText>
                <ThemedText contentDirection="auto" style={{ color: theme.textSecondary }} type="code">{detail.board?.name ?? t('common.archiveReadOnly')}</ThemedText>
              </View>
              <TaskPriorityBadge priority={detail.task.priority} />
            </View>
            <ThemedText contentDirection="auto" style={styles.taskTitle}>{detail.task.title}</ThemedText>
            <View style={styles.heroMeta}>
              <TaskStatusPill category={detail.state?.category} label={detail.state?.name ?? t('common.unknown')} />
              {due ? (
                <View style={styles.inlineMeta}>
                  <PlatformIcon color={overdue ? theme.danger : theme.textSecondary} name="calendar" size={16} />
                  <ThemedText contentDirection="auto" style={{ color: overdue ? theme.danger : theme.textSecondary }} type="small">{due}</ThemedText>
                </View>
              ) : null}
            </View>
          </View>

          <TaskSegmentedControl
            onChange={setTab}
            segments={detailTabs.map((value) => ({ value, label: value === 'details' ? t('task.details') : value === 'discussion' ? t('task.discussion') : t('task.activity') }))}
            value={tab}
          />

          {tab === 'details' ? (
            <TaskDetailsTab
              assigneeName={assigneeName}
              busy={busy}
              completedSubtasks={completedSubtasks}
              detail={detail}
              onAddSubtask={() => void run(() => createTask({
                projectId: project,
                boardId: detail.task.boardId,
                parentTaskId: detail.task._id,
                title: subtask.trim(),
                priority: 'none',
                idempotencyKey: `${Date.now()}-subtask`,
                ...identity,
              }), () => setSubtask(''))}
              onArchive={() => void run(() => setArchived({
                taskId: detail.task._id,
                archived: !detail.task.archivedAt,
                ...identity,
              }))}
              onFollow={() => void run(() => setFollowing({
                taskId: detail.task._id,
                enabled: !detail.following,
                ...identity,
              }))}
              onSubtaskChange={setSubtask}
              onToggleSubtask={(item) => void toggleSubtask(item)}
              readOnly={readOnly}
              subtask={subtask}
              subtasks={subtasks}
            />
          ) : null}
          {tab === 'discussion' ? <TaskDiscussionTab assignees={assignees} detail={detail} /> : null}
          {tab === 'activity' ? <TaskActivityTab detail={detail} /> : null}
        </ScrollView>

        {tab === 'discussion' && detail.capabilities.canComment && archive !== '1' ? (
          <TaskCommentComposer
            assignees={assignees}
            busy={busy}
            mentionIds={mentionIds}
            onChangeText={setComment}
            onMentionToggle={(memberId) => setMentionIds((current) =>
              current.includes(memberId as Id<'projectMembers'>)
                ? current.filter((id) => id !== memberId)
                : [...current, memberId as Id<'projectMembers'>],
            )}
            onSend={() => void run(() => createComment({
              taskId: detail.task._id,
              body: comment.trim(),
              mentionedProjectMemberIds: mentionIds,
              idempotencyKey: `${Date.now()}-comment`,
              ...identity,
            }), () => {
              setComment('');
              setMentionIds([]);
            })}
            value={comment}
          />
        ) : null}
      </KeyboardAvoidingView>

      <OptionsSheet onClose={() => {
        setEditOpen(false);
        setEditRevision(null);
        applyDetailToDraft(detail);
      }} title={t('task.updateTask')} visible={editOpen}>
        <SheetInput label={t('common.title')} onChangeText={setTitle} value={title} />
        <SheetInput label={t('common.description')} multiline onChangeText={setDescription} value={description} />
        <SheetInput label={t('common.dueDateInput')} onChangeText={setDueDate} value={dueDate} />
        <SheetSection title={t('task.status')}>
          {board?.states.map((state) => (
            <SheetRow
              icon="check-circle"
              key={state._id}
              label={state.name}
              selected={stateId === state._id}
              onPress={() => setStateId(state._id)}
            />
          ))}
        </SheetSection>
        <SheetSection title={t('common.priority')}>
          {priorities.map((value) => (
            <SheetRow
              icon="flag"
              key={value}
              label={taskPriorityLabel(value, t)}
              selected={priority === value}
              onPress={() => setPriority(value)}
            />
          ))}
        </SheetSection>
        <SheetSection title={t('common.assignee')}>
          <SheetRow icon="person" label={t('common.unassigned')} selected={!assigneeId} onPress={() => setAssigneeId('')} />
          {assignees?.map((item) => (
            <SheetRow
              icon="person"
              key={item.member._id}
              label={`${item.user.displayName}${item.company ? ` · ${item.company.displayName}` : ''}`}
              selected={assigneeId === item.member._id}
              onPress={() => setAssigneeId(item.member._id)}
            />
          ))}
        </SheetSection>
        {labels?.length ? (
          <SheetSection title={t('common.labels')}>
            {labels.map((label) => (
              <SheetRow
                icon="flag"
                key={label._id}
                label={label.name}
                selected={labelIds.includes(label._id)}
                onPress={() => setLabelIds((current) =>
                  current.includes(label._id)
                    ? current.filter((id) => id !== label._id)
                    : [...current, label._id],
                )}
              />
            ))}
          </SheetSection>
        ) : null}
        {error ? <ThemedText style={{ color: theme.danger }} type="small">{error}</ThemedText> : null}
        <TaskAction disabled={busy || !title.trim()} label={busy ? t('task.saving') : t('task.save')} onPress={() => void saveTask()} primary />
      </OptionsSheet>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four, padding: Spacing.three, paddingBottom: Spacing.six },
  contentWithComposer: { paddingBottom: Spacing.four },
  eyebrow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  eyebrowKey: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, minWidth: 0 },
  headerButton: { alignItems: 'center', height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  hero: { gap: Spacing.two },
  heroMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  inlineMeta: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  loading: { gap: Spacing.four, padding: Spacing.three, paddingTop: Spacing.six },
  loadingHero: { borderRadius: 12, height: 112 },
  screen: { flex: 1 },
  taskTitle: { fontSize: 25, fontWeight: '700', lineHeight: 32 },
});
