import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Id } from '../../../../../convex/_generated/dataModel';
import { MyTaskWorkspace } from '@/components/my-task-workspace';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { localTaskDate } from '@/lib/task-presentation';
import type { BoardEntry, MyTask } from '@/lib/my-task-types';

const STATES = ['demo', 'worst', 'empty', 'one', 'many'] as const;
type PreviewState = typeof STATES[number];

const LABELS: Record<PreviewState, string> = {
  demo: 'Demo',
  empty: 'Empty',
  many: '1,000 Boards',
  one: 'One task',
  worst: 'Worst case',
};

const companyId = 'companies:my-tasks-preview' as Id<'companies'>;
const projectId = 'projects:my-tasks-preview' as Id<'projects'>;
const boardId = 'taskBoards:my-tasks-preview' as Id<'taskBoards'>;
const stateId = 'taskWorkflowStates:my-tasks-preview' as Id<'taskWorkflowStates'>;
const todoStateId = 'taskWorkflowStates:my-tasks-preview-todo' as Id<'taskWorkflowStates'>;
const completedStateId = 'taskWorkflowStates:my-tasks-preview-completed' as Id<'taskWorkflowStates'>;
const memberId = 'projectMembers:my-tasks-preview' as Id<'projectMembers'>;

function selectedState(value?: string): PreviewState {
  return STATES.find((state) => state === value) ?? 'demo';
}

function offsetDate(days: number) {
  const [year, month, day] = localTaskDate().split('-').map(Number);
  const date = new Date(year ?? 2026, (month ?? 1) - 1, (day ?? 1) + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeTask(index: number, worst: boolean): MyTask {
  const longTitle = 'Review the Patient Portal handoff and confirm the release owner, delivery risks, and cross-team follow-up before the next milestone. ';
  const title = worst
    ? `${longTitle}${longTitle}`.slice(0, 180).trimEnd()
    : ['Confirm the launch checklist', 'Review the project handoff', 'Resolve the release blocker', 'Share the updated delivery plan', 'Check the final accessibility notes'][index % 5] ?? 'Review the task';
  const name = worst
    ? 'Patient Portal and Clinical Operations cross-team delivery project'
    : ['Patient Portal', 'Mobile release', 'Design system', 'Delivery readiness', 'Accessibility review'][index % 5] ?? 'Project';
  const initialStateId = index === 0 ? stateId : todoStateId;
  const task = {
    _id: `tasks:my-tasks-preview-${index}` as Id<'tasks'>,
    _creationTime: 1_760_000_000_000 + index,
    boardId,
    workflowStateId: initialStateId,
    title,
    priority: index === 0 ? 'urgent' : index < 3 ? 'high' : 'medium',
    dueDate: worst ? localTaskDate() : offsetDate(index - 1),
    updatedAt: 1_760_000_000_000 + index,
  };
  const state = {
    _id: initialStateId,
    _creationTime: 1_760_000_000_000,
    boardId,
    name: worst ? index === 0 ? 'Waiting for cross-team dependency review' : 'Ready for delivery review' : index === 0 ? 'Blocked' : 'To do',
    category: index === 0 ? 'started' : 'unstarted',
  };

  return {
    task,
    board: null,
    state,
    assignee: null,
    creator: null,
    labels: [],
    references: [],
    terminal: false,
    assigneeName: 'Alexandra Wiśniewska-Kowalczyk',
    group: null,
    project: {
      _id: projectId,
      name,
      markColorKey: null,
      markIconKey: null,
    },
    companyId,
    companyName: worst
      ? 'Acme Health Clinical Research and Patient Experience Group'
      : 'Acme Health',
    projectMemberId: memberId,
    hasMoreAssignedTasks: false,
    hasMoreDueTasks: false,
  } as unknown as MyTask;
}

function makeBoard(index: number, count: number, worst: boolean): BoardEntry {
  const id = index === 0 ? boardId : `taskBoards:my-tasks-preview-${index}` as Id<'taskBoards'>;
  const now = 1_760_000_000_000 + index;
  const states = [
    { _id: todoStateId, _creationTime: now, boardId: id, projectId, name: 'To do', category: 'unstarted', visualToken: 'blue', rank: '0001', isDefault: true, createdAt: now, updatedAt: now },
    { _id: stateId, _creationTime: now, boardId: id, projectId, name: 'In progress', category: 'started', visualToken: 'amber', rank: '0002', isDefault: false, createdAt: now, updatedAt: now },
    { _id: completedStateId, _creationTime: now, boardId: id, projectId, name: 'Completed', category: 'completed', visualToken: 'green', rank: '0003', isDefault: false, createdAt: now, updatedAt: now },
  ];
  return {
    board: {
      _id: id,
      _creationTime: 1_760_000_000_000 + index,
      projectId,
      name: worst
        ? 'Patient Portal Clinical Operations and Cross-Company Compliance Readiness Board'
        : count > 1 ? `Delivery Board ${index + 1}` : 'Delivery readiness',
      createdAt: 1_760_000_000_000 + index,
      markColorKey: null,
      markIconKey: null,
    },
    states,
    project: {
      _id: projectId,
      name: worst ? 'Patient Portal and Clinical Operations cross-team delivery project' : 'Patient Portal',
    },
    company: { _id: companyId, displayName: 'Acme Health' },
    projectMemberId: memberId,
    companyId,
    canManageMark: index === 0,
    unreadCount: 0,
  } as unknown as BoardEntry;
}

export default function MyTasksPreviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data } = useLocalSearchParams<{ data?: string }>();
  const state = selectedState(data);
  const worst = state === 'worst';
  const taskCount = state === 'empty' ? 0 : state === 'one' ? 1 : worst ? 5 : 3;
  const boardCount = state === 'empty' ? 0 : state === 'many' ? 1_000 : 2;
  const assignedTasks = Array.from({ length: taskCount }, (_, index) => makeTask(index, worst));
  const boards = Array.from({ length: boardCount }, (_, index) => makeBoard(index, boardCount, worst));
  const companyName = worst ? 'Acme Health Clinical Research and Patient Experience Group' : 'Acme Health';

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.fixtureBar, { backgroundColor: theme.homeSurface, borderBottomColor: theme.homeBorder }]}>
        <ThemedText accessibilityRole="header" type="captionBold">My Tasks data</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fixtureOptions}>
          {STATES.map((option) => {
            const active = option === state;
            return <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={option}
              onPress={() => router.setParams({ data: option })}
              style={[styles.fixtureOption, { backgroundColor: active ? theme.accent : theme.backgroundElement, borderColor: active ? theme.accent : theme.homeBorder }]}
            ><ThemedText style={{ color: active ? theme.accentInk : theme.text }} type="captionBold">{LABELS[option]}</ThemedText></Pressable>;
          })}
        </ScrollView>
      </View>
      <MyTaskWorkspace
        assignedTasks={assignedTasks}
        boards={boards}
        boardsLoading={false}
        companyId={companyId}
        companyLogoUrl={null}
        companyName={companyName}
        companyOptions={[{ id: companyId, logoUrl: null, name: companyName }]}
        confirmationStateId={null}
        confirmationTask={null}
        createTaskSheet={null}
        hasMoreProjects={false}
        isLoading={false}
        isLoadingMoreProjects={false}
        isOffline={false}
        onCancelTaskStatusConfirmation={() => undefined}
        onConfirmTaskStatus={() => undefined}
        onDismissError={() => undefined}
        onLoadMoreProjects={() => undefined}
        onOpenBoard={() => undefined}
        onCreateTaskInBoard={() => undefined}
        onEditBoardMark={() => undefined}
        onOpenTask={() => undefined}
        onSelectCompany={() => undefined}
        onSetTaskStatus={() => undefined}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fixtureBar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  fixtureOptions: { alignItems: 'center', gap: Spacing.one, paddingRight: Spacing.one },
  fixtureOption: { borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
});
