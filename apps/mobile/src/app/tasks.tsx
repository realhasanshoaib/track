import type { TaskPriority } from '@track/shared/tasks';
import { useMutation, useQuery } from 'convex/react';
import { useNetworkState } from 'expo-network';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { DateField } from '@/components/date-field';
import { EmptyState } from '@/components/empty-state';
import { OptionsSheet, SheetInput, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import type { TaskMoveInput } from '@/components/task-board';
import {
  SuggestionInbox,
  TaskCollection,
  type MobileBoardView,
  type MobileSuggestionView,
  type MobileTaskView,
} from '@/components/task-list-content';
import { TaskAction, TaskSegmentedControl, TaskStateBanner } from '@/components/task-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { idempotencyKey } from '@/lib/idempotency';
import { useReleaseConfig } from '@/lib/release-config';
import { groupMobileTasksByState, taskDetailHref, type MobileTaskIdentity } from '@/lib/task-navigation';
import { taskPriorityLabel } from '@/lib/task-presentation';

type AssigneeView = {
  member: Doc<'projectMembers'>;
  user: { _id: Id<'users'>; displayName: string };
  company: Doc<'companies'> | null;
};

type PrimaryTaskTab = 'board' | 'my' | 'all';
type TaskTab = PrimaryTaskTab | 'inbox';
const priorities: TaskPriority[] = ['none', 'urgent', 'high', 'medium', 'low'];
const primaryTabs: Array<{ label: string; value: PrimaryTaskTab }> = [
  { label: 'Board', value: 'board' },
  { label: 'My tasks', value: 'my' },
  { label: 'All', value: 'all' },
];

function readableError(failure: unknown) {
  if (!(failure instanceof Error)) return 'The task action failed.';
  if (failure.message.includes('task_access_changed')) return 'Your access changed. Refresh and try again.';
  if (failure.message.includes('task_duplicate_decision_required')) return 'Choose whether to add a reference or create a separate task.';
  return failure.message.replaceAll('_', ' ');
}

export default function TasksScreen() {
  const theme = useTheme();
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
  const moveTask = useMutation(api.tasks.moveTask);
  const acceptSuggestion = useMutation(api.taskSuggestions.accept);
  const dismissSuggestion = useMutation(api.taskSuggestions.dismiss);
  const hideSuggestion = useMutation(api.taskSuggestions.hide);
  const linkSuggestion = useMutation(api.taskSuggestions.linkToExisting);
  const [createOpen, setCreateOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<MobileTaskView | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [dueDate, setDueDate] = useState<string | null>(null);
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

  const columns = useMemo(() => {
    if (!selectedBoard) return [];
    const grouped = groupMobileTasksByState(
      selectedBoard.states.map((state) => state._id),
      tasks ?? [],
    );
    return selectedBoard.states.map((state, index) => ({
      state,
      tasks: grouped[index].tasks,
    }));
  }, [selectedBoard, tasks]);
  const statusStates = boards?.find((item) =>
    item.board._id === statusTarget?.task.boardId,
  )?.states ?? [];

  function setPrimaryTab(next: PrimaryTaskTab) {
    setTab(next);
    setError('');
  }

  async function move(input: TaskMoveInput) {
    await moveTask({ ...input, ...queryIdentity });
    hapticMedium();
  }

  function moveToState(state: Doc<'taskWorkflowStates'>) {
    const item = statusTarget;
    setStatusTarget(null);
    if (!item || state._id === item.task.workflowStateId) return;
    void move({
      expectedRevision: item.task.revision,
      taskId: item.task._id,
      workflowStateId: state._id,
    }).catch((failure) => setError(readableError(failure)));
  }

  function assigneeName(item: MobileTaskView) {
    if (!item.task.assigneeProjectMemberId) return undefined;
    return assignees?.find((candidate) => candidate.member._id === item.task.assigneeProjectMemberId)?.user.displayName
      ?? (item.assignee ? 'Assigned member' : undefined);
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
        dueDate: dueDate ?? undefined,
        assigneeProjectMemberId: selectedCreateAssigneeId
          ? selectedCreateAssigneeId as Id<'projectMembers'>
          : undefined,
        idempotencyKey: idempotencyKey(),
        ...queryIdentity,
      });
      hapticMedium();
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      setPriority('none');
      setDueDate(null);
      setAssigneeId('');
      router.push(taskDetailHref(project, result.publicKey, identity));
    } catch (failure) {
      setError(readableError(failure));
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
      setError(readableError(failure));
    }
  }

  function suggestionDestination(row: MobileSuggestionView) {
    const compatible = boards?.filter((item) => item.board.groupId === row.suggestion.groupId) ?? [];
    return compatible.find((item) => item.board.isDefault) ?? compatible[0];
  }

  function accept(row: MobileSuggestionView) {
    const destination = suggestionDestination(row);
    if (!destination) {
      setError('No compatible board is available for this suggestion.');
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
        <Stack.Screen options={{ title: 'Tasks unavailable' }} />
        <EmptyState icon="file-document-outline" title="Tasks unavailable" body="Conversation remains available while the task release is disabled." />
      </ThemedView>
    );
  }

  const heading = (
    <>
      {offline ? <TaskStateBanner icon="cloud-off" message="Offline — showing saved tasks" tone="offline" /> : null}
      {readOnly ? <TaskStateBanner icon="shield-lock-outline" message="Read-only Company exit archive" /> : null}
      {tab !== 'inbox' ? (
        <>
          <View style={styles.contextHeading}>
            <View style={styles.contextTitle}>
              <ThemedText numberOfLines={1} type="subtitle">
                {tab === 'board'
                  ? selectedBoard?.board.name ?? 'Project tasks'
                  : tab === 'my' ? 'My tasks' : 'All project tasks'}
              </ThemedText>
              <ThemedText themeColor="textSecondary" type="small">
                {tasks ? `${tasks.length} task${tasks.length === 1 ? '' : 's'}` : 'Loading work…'}
              </ThemedText>
            </View>
            {tab === 'board' && boards && boards.length > 1 ? (
              <Pressable
                accessibilityHint="Opens the list of boards"
                accessibilityLabel={`Board: ${selectedBoard?.board.name ?? 'none'}`}
                accessibilityRole="button"
                onPress={() => {
                  hapticLight();
                  setBoardOpen(true);
                }}
                style={[styles.boardPicker, {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.hairline,
                }]}>
                <PlatformIcon color={theme.textSecondary} name="view-board" size={18} />
                <ThemedText numberOfLines={1} style={styles.boardPickerLabel} type="label">
                  {selectedBoard?.board.name ?? 'Choose board'}
                </ThemedText>
                <PlatformIcon color={theme.textSecondary} name="selector" size={18} />
              </Pressable>
            ) : null}
          </View>
          <TaskSegmentedControl onChange={setPrimaryTab} segments={primaryTabs} value={tab} />
        </>
      ) : (
        <View style={styles.inboxHeading}>
          <ThemedText type="subtitle">Conversation suggestions</ThemedText>
          <ThemedText themeColor="textSecondary" type="small">
            Review grounded work detected from the conversations you can access.
          </ThemedText>
        </View>
      )}
      {error ? (
        <TaskStateBanner
          action={{ label: 'Dismiss', onPress: () => setError('') }}
          icon="refresh"
          message={error}
          tone="danger"
        />
      ) : null}
    </>
  );

  const collection = (
    <TaskCollection
      assigneeName={assigneeName}
      columns={columns}
      onCreate={() => setCreateOpen(true)}
      onMove={move}
      onOpen={(item) => router.push(taskDetailHref(project, item.task.publicKey, identity))}
      onStatusPress={setStatusTarget}
      onViewAll={() => setTab('all')}
      readOnly={readOnly}
      selectedBoard={selectedBoard}
      tab={tab === 'inbox' ? 'all' : tab}
      tasks={boards === undefined ? undefined : tasks}
    />
  );

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{
        title: tab === 'inbox' ? 'Task inbox' : 'Tasks',
        headerLargeTitle: Platform.OS === 'ios' && tab !== 'board',
        headerTransparent: Platform.OS === 'ios' && tab !== 'board',
        headerBlurEffect: 'systemMaterial',
        headerRight: () => (
          <View style={styles.headerActions}>
            {!readOnly ? (
              <Pressable
                accessibilityLabel={tab === 'inbox' ? 'Return to tasks' : 'Open task inbox'}
                onPress={() => {
                  hapticLight();
                  setTab((current) => current === 'inbox' ? 'board' : 'inbox');
                }}
                style={[styles.headerButton, tab === 'inbox' && { backgroundColor: theme.backgroundSelected }]}>
                <PlatformIcon color={tab === 'inbox' ? theme.accent : theme.text} name="inbox" size={22} />
              </Pressable>
            ) : null}
            {!readOnly ? (
              <Pressable accessibilityLabel="Create task" onPress={() => setCreateOpen(true)} style={styles.headerButton}>
                <PlatformIcon color={theme.accent} name="plus" size={24} />
              </Pressable>
            ) : null}
          </View>
        ),
      }} />

      {tab === 'board' ? (
        <View style={styles.boardScreen}>
          {heading}
          {collection}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled">
          {heading}
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
            : collection}
        </ScrollView>
      )}

      <OptionsSheet onClose={() => setStatusTarget(null)} title="Move to" visible={Boolean(statusTarget)}>
        <SheetSection title={statusTarget?.task.title}>
          {statusStates.map((state) => (
            <SheetRow
              icon={state.category === 'completed' ? 'check-circle' : 'circle-outline'}
              key={state._id}
              label={state.name}
              onPress={() => moveToState(state)}
              selected={state._id === statusTarget?.task.workflowStateId}
            />
          ))}
        </SheetSection>
      </OptionsSheet>

      <OptionsSheet onClose={() => setBoardOpen(false)} title="Choose board" visible={boardOpen}>
        <SheetSection>
          {boards?.map((item) => (
            <SheetRow
              icon="view-board"
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

      <OptionsSheet onClose={() => setCreateOpen(false)} title="Create task" visible={createOpen}>
        <View style={styles.sheetIntro}>
          <ThemedText type="subtitle">Turn work into a clear next step</ThemedText>
          <ThemedText themeColor="textSecondary" type="small">
            Keep the title actionable; the details can evolve with the conversation.
          </ThemedText>
        </View>
        <SheetInput label="Title" onChangeText={setTitle} value={title} />
        <SheetInput label="Description" multiline onChangeText={setDescription} value={description} />
        <DateField onChange={setDueDate} value={dueDate} />
        {boards && boards.length > 1 ? (
          <SheetSection title="Board">
            {boards.map((item) => (
              <SheetRow
                icon="view-board"
                key={item.board._id}
                label={item.board.name}
                selected={item.board._id === selectedBoard?.board._id}
                onPress={() => setBoardId(item.board._id)}
              />
            ))}
          </SheetSection>
        ) : null}
        <SheetSection title="Priority">
          {priorities.map((value) => (
            <SheetRow
              icon="flag"
              key={value}
              label={taskPriorityLabel(value)}
              selected={priority === value}
              onPress={() => setPriority(value)}
            />
          ))}
        </SheetSection>
        <SheetSection title="Assignee">
          <SheetRow icon="person" label="Unassigned" selected={!selectedCreateAssigneeId} onPress={() => setAssigneeId('')} />
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
        {error ? <ThemedText themeColor="danger" type="small">{error}</ThemedText> : null}
        <TaskAction disabled={busy || !title.trim()} label={busy ? 'Creating…' : 'Create task'} onPress={() => void create()} primary />
      </OptionsSheet>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  boardPicker: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    maxWidth: 190,
    minHeight: 38,
    paddingHorizontal: Spacing.three,
  },
  boardPickerLabel: { flexShrink: 1 },
  boardScreen: { flex: 1, gap: Spacing.three, padding: Spacing.three },
  content: { gap: Spacing.three, padding: Spacing.three, paddingBottom: Spacing.six },
  contextHeading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  contextTitle: { flex: 1, gap: 2 },
  headerActions: { alignItems: 'center', flexDirection: 'row' },
  headerButton: { alignItems: 'center', borderRadius: TouchTarget / 2, height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  inboxHeading: { gap: Spacing.one },
  screen: { flex: 1 },
  sheetIntro: { gap: Spacing.one },
});
