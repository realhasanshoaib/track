import type { TaskPriority } from '@track/shared/tasks';
import { useMutation, useQuery } from 'convex/react';
import { useNetworkState } from 'expo-network';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { EmptyState } from '@/components/empty-state';
import { OptionsSheet, SheetInput, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import {
  SuggestionInbox,
  TaskCollection,
  type MobileBoardView,
  type MobileSuggestionView,
  type MobileTaskView,
} from '@/components/task-list-content';
import {
  TaskAction,
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
import { groupMobileTasksByState, taskDetailHref, type MobileTaskIdentity } from '@/lib/task-navigation';
import { taskPriorityLabel } from '@/lib/task-presentation';
import { formatNumber, useLocale } from '@/i18n';
import { useTranslation } from 'react-i18next';

type AssigneeView = {
  member: Doc<'projectMembers'>;
  user: { _id: Id<'users'>; displayName: string };
  company: Doc<'companies'> | null;
};

type PrimaryTaskTab = 'board' | 'my' | 'all';
type TaskTab = PrimaryTaskTab | 'inbox';
const priorities: TaskPriority[] = ['none', 'urgent', 'high', 'medium', 'low'];
const primaryTabs: PrimaryTaskTab[] = ['board', 'my', 'all'];

function readableError(failure: unknown, t: (key: string) => string) {
  if (!(failure instanceof Error)) return t('tasks.errorsActionFailed');
  if (failure.message.includes('task_access_changed')) return t('tasks.errorsAccessChanged');
  if (failure.message.includes('task_duplicate_decision_required')) return t('tasks.errorsDuplicateDecision');
  return t('tasks.errorsActionFailed');
}

export default function TasksScreen() {
  const theme = useTheme();
  const { locale } = useLocale();
  const { t } = useTranslation('work');
  const router = useRouter();
  const release = useReleaseConfig();
  const network = useNetworkState();
  const { projectId, companyId, membershipId, archive } = useLocalSearchParams<{
    projectId: string;
    companyId?: string;
    membershipId?: string;
    archive?: string;
  }>();
  const project = projectId as Id<'projects'>;
  const identity: MobileTaskIdentity | null = companyId && membershipId ? {
    archived: archive === '1',
    companyId: companyId as Id<'companies'>,
    membershipId: membershipId as Id<'projectMembers'>,
  } : null;
  const queryIdentity = identity ? {
    actingCompanyId: identity.companyId,
    projectMemberId: identity.membershipId,
  } : {};
  const readOnly = archive === '1';
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const currentUser = useQuery(api.auth.getCurrentUser);
  const boards = useQuery(api.taskBoards.list, release.tasks ? {
    projectId: project,
    ...queryIdentity,
  } : 'skip') as MobileBoardView[] | undefined;
  const assignees = useQuery(api.tasks.listEligibleAssignees, release.tasks && !readOnly ? {
    projectId: project,
    ...queryIdentity,
  } : 'skip') as AssigneeView[] | undefined;
  const currentMemberId = identity?.membershipId
    ?? assignees?.find((item) => item.user._id === currentUser?._id)?.member._id;
  const [tab, setTab] = useState<TaskTab>('board');
  const [boardId, setBoardId] = useState<string>('');
  const selectedBoard = boards?.find((item) => item.board._id === boardId)
    ?? boards?.find((item) => item.board.isDefault)
    ?? boards?.[0];
  const createAssignees = useQuery(api.tasks.listEligibleAssignees, release.tasks && !readOnly
    && selectedBoard ? {
    projectId: project,
    groupId: selectedBoard.board.groupId,
    ...queryIdentity,
  } : 'skip') as AssigneeView[] | undefined;
  const tasks = useQuery(api.tasks.list, release.tasks && tab !== 'inbox'
    && (tab !== 'my' || currentMemberId) ? {
    projectId: project,
    boardId: tab === 'board' ? selectedBoard?.board._id : undefined,
    assigneeProjectMemberId: tab === 'my' ? currentMemberId : undefined,
    ...queryIdentity,
  } : 'skip') as MobileTaskView[] | undefined;
  const suggestions = useQuery(api.taskSuggestions.list, release.tasks && tab === 'inbox' && !readOnly ? {
    projectId: project,
    ...queryIdentity,
  } : 'skip') as MobileSuggestionView[] | undefined;
  const createTask = useMutation(api.tasks.create);
  const acceptSuggestion = useMutation(api.taskSuggestions.accept);
  const dismissSuggestion = useMutation(api.taskSuggestions.dismiss);
  const hideSuggestion = useMutation(api.taskSuggestions.hide);
  const linkSuggestion = useMutation(api.taskSuggestions.linkToExisting);
  const [createOpen, setCreateOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const currentMember = assignees?.find((item) => item.member._id === currentMemberId);
  const canAssignOthers = currentMember
    ? ['owner', 'admin', 'staff', 'manager'].includes(currentMember.member.role)
    : false;
  const assignableCreateAssignees = canAssignOthers
    ? createAssignees
    : createAssignees?.filter((item) => item.member._id === currentMemberId);
  const selectedCreateAssigneeId = assignableCreateAssignees?.some((item) =>
    item.member._id === assigneeId,
  ) ? assigneeId : '';

  const grouped = useMemo(() => selectedBoard
    ? groupMobileTasksByState(selectedBoard.states.map((state) => state._id), tasks ?? [])
    : [], [selectedBoard, tasks]);
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const item of tasks ?? []) {
      const stateId = item.state?._id;
      if (stateId) result[stateId] = (result[stateId] ?? 0) + 1;
    }
    return result;
  }, [tasks]);

  function setPrimaryTab(next: PrimaryTaskTab) {
    setTab(next);
    setError('');
  }

  function assigneeName(item: MobileTaskView) {
    if (!item.task.assigneeProjectMemberId) return undefined;
    return assignees?.find((candidate) => candidate.member._id === item.task.assigneeProjectMemberId)?.user.displayName
      ?? (item.assignee ? t('common.assignedMember') : undefined);
  }

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await createTask({
        projectId: project,
        boardId: selectedBoard?.board._id,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate.trim() || undefined,
        assigneeProjectMemberId: selectedCreateAssigneeId
          ? selectedCreateAssigneeId as Id<'projectMembers'>
          : undefined,
        idempotencyKey: `${Date.now()}-${Math.random()}`,
        ...queryIdentity,
      });
      hapticMedium();
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      setPriority('none');
      setDueDate('');
      setAssigneeId('');
      router.push(taskDetailHref(project, result.publicKey, identity));
    } catch (failure) {
      setError(readableError(failure, t));
    } finally {
      setBusy(false);
    }
  }

  async function runSuggestion(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
      hapticMedium();
    } catch (failure) {
      setError(readableError(failure, t));
    }
  }

  function suggestionDestination(row: MobileSuggestionView) {
    const compatible = boards?.filter((item) => item.board.groupId === row.suggestion.groupId) ?? [];
    return compatible.find((item) => item.board.isDefault) ?? compatible[0];
  }

  function accept(row: MobileSuggestionView) {
    const destination = suggestionDestination(row);
    if (!destination) {
      setError(t('tasks.errorsBoardUnavailable'));
      return;
    }
    void runSuggestion(() => acceptSuggestion({
      suggestionId: row.suggestion._id,
      boardId: destination.board._id,
      title: row.suggestion.proposedTitle,
      description: row.suggestion.proposedDescription,
      priority: row.suggestion.proposedPriority,
      dueDate: row.suggestion.proposedDueDate,
      assigneeProjectMemberId: row.suggestion.proposedAssigneeProjectMemberId,
      duplicateOverride: Boolean(row.possibleDuplicateTask),
      idempotencyKey: `${Date.now()}-${row.suggestion._id}`,
      ...queryIdentity,
    }));
  }

  if (!release.tasks) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: t('tasks.unavailable') }} />
        <EmptyState icon="file-document-outline" title={t('tasks.unavailable')} body={t('tasks.unavailableBody')} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{
        title: tab === 'inbox' ? t('tasks.inbox') : t('tasks.tasks'),
        headerLargeTitle: Platform.OS === 'ios',
        headerTransparent: Platform.OS === 'ios',
        headerBlurEffect: 'systemMaterial',
        headerRight: () => (
          <View style={styles.headerActions}>
            {!readOnly ? (
              <Pressable
                accessibilityLabel={tab === 'inbox' ? t('tasks.returnToTasks') : t('tasks.openInbox')}
                onPress={() => {
                  hapticLight();
                  setTab((current) => current === 'inbox' ? 'board' : 'inbox');
                }}
                style={[styles.headerButton, tab === 'inbox' && { backgroundColor: theme.backgroundSelected }]}>
                <PlatformIcon color={tab === 'inbox' ? theme.accent : theme.text} name="inbox" size={22} />
              </Pressable>
            ) : null}
            {!readOnly ? (
              <Pressable accessibilityLabel={t('tasks.createTaskAccessibility')} onPress={() => setCreateOpen(true)} style={styles.headerButton}>
                <PlatformIcon color={theme.accent} name="plus" size={24} />
              </Pressable>
            ) : null}
          </View>
        ),
      }} />

      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled">
        {offline ? <TaskStateBanner icon="cloud-off" message={t('tasks.offline')} tone="offline" /> : null}
        {readOnly ? <TaskStateBanner icon="shield-lock-outline" message={t('tasks.readOnlyArchive')} /> : null}
        {tab !== 'inbox' ? (
          <>
            <View style={styles.contextHeading}>
              <View style={styles.contextTitle}>
                <ThemedText contentDirection="auto" numberOfLines={1} type="subtitle">
                  {tab === 'board'
                    ? selectedBoard?.board.name ?? t('tasks.projectTasks')
                    : tab === 'my' ? t('tasks.myTasks') : t('tasks.allProjectTasks')}
                </ThemedText>
                <ThemedText style={{ color: theme.textSecondary }} type="small">
                  {tasks ? t(tasks.length === 1 ? 'tasks.count_one' : 'tasks.count_other', { count: formatNumber(locale, tasks.length) }) : t('tasks.loadingWork')}
                </ThemedText>
              </View>
              {tab === 'board' && boards && boards.length > 1 ? (
                <Pressable
                  accessibilityLabel={t('tasks.contextChangeBoard')}
                  onPress={() => setBoardOpen(true)}
                  style={[styles.boardPicker, { backgroundColor: theme.backgroundElement }]}>
                  <PlatformIcon color={theme.textSecondary} name="chevron-down" size={18} />
                </Pressable>
              ) : null}
            </View>
            <TaskSegmentedControl
              onChange={setPrimaryTab}
              segments={primaryTabs.map((value) => ({
                value,
                label: value === 'board' ? t('tasks.board') : value === 'my' ? t('tasks.myTasks') : t('tasks.all'),
              }))}
              value={tab}
            />
            {tab === 'board' && tasks?.length ? (
              <ScrollView
                contentContainerStyle={styles.summary}
                horizontal
                showsHorizontalScrollIndicator={false}>
                {selectedBoard?.states.map((state) => (
                  <View key={state._id} style={styles.summaryItem}>
                    <TaskStatusPill category={state.category} label={state.name} />
                    <ThemedText contentDirection="ltr" style={{ color: theme.textSecondary }} type="code">{formatNumber(locale, counts[state._id] ?? 0)}</ThemedText>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </>
        ) : (
          <View style={styles.inboxHeading}>
            <ThemedText type="subtitle">{t('tasks.conversationSuggestions')}</ThemedText>
            <ThemedText style={{ color: theme.textSecondary }} type="small">
              {t('tasks.suggestionsBody')}
            </ThemedText>
          </View>
        )}

        {error ? <TaskStateBanner action={{ label: t('tasks.dismissError'), onPress: () => setError('') }} icon="refresh" message={error} tone="danger" /> : null}

        {tab === 'inbox'
          ? <SuggestionInbox
              onAccept={accept}
              onDismiss={(row) => void runSuggestion(() => dismissSuggestion({
                suggestionId: row.suggestion._id,
                reason: 'not_actionable',
                idempotencyKey: `${Date.now()}-dismiss`,
                ...queryIdentity,
              }))}
              onHide={(row) => void runSuggestion(() => hideSuggestion({
                suggestionId: row.suggestion._id,
                ...queryIdentity,
              }))}
              onLink={(row) => row.possibleDuplicateTask && void runSuggestion(() => linkSuggestion({
                suggestionId: row.suggestion._id,
                taskId: row.possibleDuplicateTask!._id,
                idempotencyKey: `${Date.now()}-link`,
                ...queryIdentity,
              }))}
              readOnly={readOnly}
              suggestions={suggestions}
            />
          : boards === undefined
            ? <TaskCollection
                assigneeName={assigneeName}
                counts={counts}
                grouped={grouped}
                onCreate={() => setCreateOpen(true)}
                onOpen={(item) => router.push(taskDetailHref(project, item.task.publicKey, identity))}
                onViewAll={() => setTab('all')}
                readOnly={readOnly}
                selectedBoard={selectedBoard}
                tab={tab}
              />
            : <TaskCollection
                assigneeName={assigneeName}
                counts={counts}
                grouped={grouped}
                onCreate={() => setCreateOpen(true)}
                onOpen={(item) => router.push(taskDetailHref(project, item.task.publicKey, identity))}
                onViewAll={() => setTab('all')}
                readOnly={readOnly}
                selectedBoard={selectedBoard}
                tab={tab}
                tasks={tasks}
              />}
      </ScrollView>

      <OptionsSheet onClose={() => setBoardOpen(false)} title={t('tasks.chooseBoard')} visible={boardOpen}>
        <SheetSection>
          {boards?.map((item) => (
            <SheetRow
              icon="view-column"
              key={item.board._id}
              label={item.board.name}
              selected={item.board._id === selectedBoard?.board._id}
              onPress={() => {
                setBoardId(item.board._id);
                setBoardOpen(false);
              }}
            />
          ))}
        </SheetSection>
      </OptionsSheet>

      <OptionsSheet onClose={() => setCreateOpen(false)} title={t('tasks.createTitle')} visible={createOpen}>
        <View style={styles.sheetIntro}>
          <ThemedText type="subtitle">{t('tasks.createIntro')}</ThemedText>
          <ThemedText style={{ color: theme.textSecondary }} type="small">
            {t('tasks.createBody')}
          </ThemedText>
        </View>
        <SheetInput label={t('common.title')} onChangeText={setTitle} value={title} />
        <SheetInput label={t('common.description')} multiline onChangeText={setDescription} value={description} />
        <SheetInput label={t('common.dueDateInput')} onChangeText={setDueDate} value={dueDate} />
        {boards && boards.length > 1 ? (
          <SheetSection title={t('common.board')}>
            {boards.map((item) => (
              <SheetRow
                icon="view-column"
                key={item.board._id}
                label={item.board.name}
                selected={item.board._id === selectedBoard?.board._id}
                onPress={() => setBoardId(item.board._id)}
              />
            ))}
          </SheetSection>
        ) : null}
        <SheetSection title={t('tasks.priority')}>
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
        <SheetSection title={t('tasks.assignee')}>
          <SheetRow icon="person" label={t('common.unassigned')} selected={!selectedCreateAssigneeId} onPress={() => setAssigneeId('')} />
          {assignableCreateAssignees?.map((item) => (
            <SheetRow
              icon="person"
              key={item.member._id}
              label={`${item.user.displayName}${item.company ? ` · ${item.company.displayName}` : ''}`}
              selected={selectedCreateAssigneeId === item.member._id}
              onPress={() => setAssigneeId(item.member._id)}
            />
          ))}
        </SheetSection>
        {error ? <ThemedText style={{ color: theme.danger }} type="small">{error}</ThemedText> : null}
        <TaskAction disabled={busy || !title.trim()} label={busy ? t('tasks.creating') : t('tasks.createAction')} onPress={() => void create()} primary />
      </OptionsSheet>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  boardPicker: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  content: { gap: Spacing.three, padding: Spacing.three, paddingBottom: Spacing.six },
  contextHeading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  contextTitle: { flex: 1, gap: 2 },
  headerActions: { alignItems: 'center', flexDirection: 'row' },
  headerButton: { alignItems: 'center', borderRadius: TouchTarget / 2, height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  inboxHeading: { gap: Spacing.one },
  screen: { flex: 1 },
  sheetIntro: { gap: Spacing.one },
  summary: { gap: Spacing.three, paddingEnd: Spacing.three },
  summaryItem: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
});
