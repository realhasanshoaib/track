import { Stack } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Id } from '../../../../convex/_generated/dataModel';
import type { BoardEntry, MyTask } from '@/lib/my-task-types';
import { CompactPillButton } from '@/components/compact-pill-button';
import { EmptyState } from '@/components/empty-state';
import { EntityMark } from '@/components/entity-mark';
import { OptionsSheet, SheetNote, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { SkeletonList } from '@/components/skeleton-row';
import { TaskDueChip, TaskStateBanner, TaskStatusPill } from '@/components/task-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { MaxFontScale, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useBottomTabContentInset } from '@/hooks/use-bottom-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { localTaskDate, parseTaskDate } from '@/lib/task-presentation';
import {
  emptyMyTaskFilters,
  matchesMyTaskFilters,
  matchesMyTaskSearch,
  matchesMyTaskTimeView,
  sortMyTasks,
  type MyTaskFilters,
  type MyTaskViewKey,
  uniqueMyTasks,
} from '@/lib/my-task-work-view';
import { weekDateKeys } from '@/lib/task-week';

const taskViews: Array<{ key: MyTaskViewKey; label: string }> = [
  { key: 'this-week', label: 'Needs attention' },
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
];

const statusChoices: Array<{ value: MyTaskFilters['status']; label: string }> = [
  { value: 'any', label: 'Any status' },
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
];

const priorityChoices: Array<{ value: MyTaskFilters['priority']; label: string }> = [
  { value: 'any', label: 'Any priority' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'No priority' },
];

const dueDateChoices: Array<{ value: MyTaskFilters['dueDate']; label: string }> = [
  { value: 'any', label: 'Any due date' },
  { value: 'today', label: 'Due today' },
  { value: 'this-week', label: 'Due this week' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'no-date', label: 'No due date' },
];

type FilterFieldKey = 'status' | 'priority' | 'dueDate';

type Props = {
  assignedTasks: MyTask[];
  confirmationStateId: string | null;
  confirmationTask: MyTask | null;
  boards: BoardEntry[];
  companyName: string;
  companyId: Id<'companies'> | null;
  companyLogoUrl: string | null;
  companyOptions: Array<{ id: Id<'companies'>; logoUrl: string | null; name: string }>;
  createTaskSheet: ReactNode;
  error?: string;
  hasMoreProjects: boolean;
  isLoading: boolean;
  isLoadingMoreProjects: boolean;
  isOffline: boolean;
  boardsLoading: boolean;
  onDismissError: () => void;
  onCancelTaskStatusConfirmation: () => void;
  onConfirmTaskStatus: () => void;
  onLoadMoreProjects: () => void;
  onOpenBoard: (board: BoardEntry) => void;
  onOpenTask: (task: MyTask) => void;
  onSetTaskStatus: (task: MyTask, workflowStateId: string) => void;
  onSelectCompany: (companyId: Id<'companies'>) => void;
};

function countLabel(count: number, partial: boolean) {
  return `${count}${partial ? '+' : ''}`;
}

function taskGroupLabel(date: string | undefined, today: string, weekDates: readonly string[]) {
  if (!date) return 'No due date';
  if (date < today) return 'Overdue';
  if (weekDates.includes(date)) return 'Due this week';
  const parsed = parseTaskDate(date);
  return parsed?.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) ?? date;
}

function groupByDueDate(tasks: MyTask[], today: string, weekDates: readonly string[]) {
  const groups = new Map<string, MyTask[]>();
  for (const task of sortMyTasks(tasks)) {
    const label = taskGroupLabel(task.task.dueDate, today, weekDates);
    groups.set(label, [...(groups.get(label) ?? []), task]);
  }
  return [...groups.entries()];
}

export function MyTaskWorkspace({
  assignedTasks,
  confirmationStateId,
  confirmationTask,
  boards,
  companyName,
  companyId,
  companyLogoUrl,
  companyOptions,
  createTaskSheet,
  error,
  hasMoreProjects,
  isLoading,
  isLoadingMoreProjects,
  isOffline,
  boardsLoading,
  onDismissError,
  onCancelTaskStatusConfirmation,
  onConfirmTaskStatus,
  onLoadMoreProjects,
  onOpenBoard,
  onOpenTask,
  onSetTaskStatus,
  onSelectCompany,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomContentInset = useBottomTabContentInset();
  const today = localTaskDate();
  const dates = useMemo(() => weekDateKeys(today), [today]);
  const [view, setView] = useState<MyTaskViewKey>('this-week');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<MyTaskFilters>(emptyMyTaskFilters);
  const [draftFilters, setDraftFilters] = useState<MyTaskFilters>(emptyMyTaskFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<FilterFieldKey | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [canceledExpanded, setCanceledExpanded] = useState(false);
  const [statusTask, setStatusTask] = useState<MyTask | null>(null);
  const [companySheetOpen, setCompanySheetOpen] = useState(false);

  const allTasks = useMemo(() => uniqueMyTasks(assignedTasks), [assignedTasks]);
  const boardById = useMemo(() => new Map(boards.map((board) => [String(board.board._id), board])), [boards]);
  const contextualTasks = useMemo(() => allTasks.filter((item) => {
    const boardName = boardById.get(String(item.task.boardId))?.board.name ?? '';
    const scopeRowMatches = matchesMyTaskSearch(item, search, boardName);
    const filterMatches = matchesMyTaskFilters(item, filters, today, dates);
    return scopeRowMatches && filterMatches;
  }), [allTasks, boardById, dates, filters, search, today]);
  const visibleTasks = useMemo(() => sortMyTasks(contextualTasks.filter((item) =>
    matchesMyTaskTimeView(item, view, today, null, dates),
  )), [contextualTasks, dates, today, view]);

  const partialTasks = allTasks.some((item) => item.hasMoreAssignedTasks);
  const partialCounts = partialTasks || hasMoreProjects;
  const thisWeekCount = contextualTasks.filter((item) => matchesMyTaskTimeView(item, 'this-week', today, null, dates)).length;
  const doneCount = contextualTasks.filter((item) => matchesMyTaskTimeView(item, 'done', today, null)).length;
  const activeFilterCount = Object.values(filters).filter((value) => value !== 'any').length;
  const matchingBoards = boards.filter(({ board, project }) =>
    (board.name + ' ' + project.name).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const scopedBoard = statusTask ? boardById.get(String(statusTask.task.boardId)) : undefined;
  const confirmationBoard = confirmationTask ? boardById.get(String(confirmationTask.task.boardId)) : undefined;
  const confirmationState = confirmationBoard?.states.find((state) => String(state._id) === confirmationStateId);

  function openFilters() {
    setDraftFilters(filters);
    setEditingFilter(null);
    setFilterOpen(true);
  }

  function cancelFilters() {
    setDraftFilters(filters);
    setEditingFilter(null);
    setFilterOpen(false);
  }

  function applyFilters() {
    setFilters(draftFilters);
    setEditingFilter(null);
    setFilterOpen(false);
  }

  function filterFieldLabel(key: FilterFieldKey) {
    if (key === 'status') return statusChoices.find(({ value }) => value === draftFilters.status)?.label ?? 'Any status';
    if (key === 'priority') return priorityChoices.find(({ value }) => value === draftFilters.priority)?.label ?? 'Any priority';
    return dueDateChoices.find(({ value }) => value === draftFilters.dueDate)?.label ?? 'Any due date';
  }

  function filterFieldTitle(key: FilterFieldKey) {
    if (key === 'dueDate') return 'Due date';
    return key === 'status' ? 'Status' : 'Priority';
  }

  function renderTask(task: MyTask) {
    return <View key={String(task.task._id)} style={[styles.compactTaskRow, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
      <Pressable
        accessibilityHint="Opens the task"
        accessibilityLabel={`${task.task.title}. ${task.project.name}. ${task.state?.name ?? 'Unknown status'}. ${task.task.dueDate ? taskGroupLabel(task.task.dueDate, today, dates) : 'No due date'}`}
        accessibilityRole="button"
        onPress={() => onOpenTask(task)}
        style={({ pressed }) => [styles.compactTaskTitleRow, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}
      >
        <ThemedText numberOfLines={1} style={styles.compactTaskTitle} type="smallBold">{task.task.title}</ThemedText>
        <View style={[styles.compactTaskArrow, { backgroundColor: theme.backgroundElevated, borderColor: theme.homeBorder }]}>
          <PlatformIcon color={theme.textSecondary} name="chevron-right" size={14} />
        </View>
      </Pressable>
      <View style={styles.compactTaskMeta}>
        <TaskStatusPill category={task.state?.category} label={task.state?.name ?? 'Unknown status'} onPress={() => setStatusTask(task)} />
        <View style={[styles.compactProjectPill, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder }]}>
          <EntityMark colorKey={task.project.markColorKey} iconKey={task.project.markIconKey} id={String(task.project._id)} kind="project" name={task.project.name} size={16} />
          <ThemedText numberOfLines={1} style={styles.compactProjectName} themeColor="textSecondary" type="captionBold">{task.project.name}</ThemedText>
        </View>
        <View style={styles.compactTaskDue}><TaskDueChip category={task.state?.category} dueDate={task.task.dueDate} showNoDate /></View>
      </View>
    </View>;
  }

  function renderGroup(label: string, tasks: MyTask[]) {
    if (!tasks.length) return null;
    return <View key={label} style={styles.taskGroup}>
      <View style={styles.taskGroupHeading}>
        <ThemedText accessibilityRole="header" themeColor="textSecondary" type="captionBold">{label}</ThemedText>
        <ThemedText themeColor="textTertiary" type="caption">{countLabel(tasks.length, partialCounts)}</ThemedText>
      </View>
      {tasks.map(renderTask)}
    </View>;
  }

  function renderRows() {
    if (view === 'this-week') return renderGroup('Needs attention', visibleTasks);
    if (view === 'done') return renderGroup('Completed', visibleTasks);
    const openTasks = visibleTasks.filter((item) => item.state?.category !== 'completed' && item.state?.category !== 'canceled');
    const completedTasks = visibleTasks.filter((item) => item.state?.category === 'completed');
    const canceledTasks = visibleTasks.filter((item) => item.state?.category === 'canceled');
    return <>
      {groupByDueDate(openTasks, today, dates).map(([label, tasks]) => renderGroup(label, tasks))}
      {completedTasks.length ? <View style={styles.collapsibleGroup}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: completedExpanded }} onPress={() => setCompletedExpanded((value) => !value)} style={styles.collapseButton}>
          <PlatformIcon color={theme.textSecondary} name={completedExpanded ? 'chevron-down' : 'chevron-right'} size={17} />
          <ThemedText type="captionBold">Completed</ThemedText>
          <ThemedText themeColor="textTertiary" type="caption">{countLabel(completedTasks.length, partialCounts)}</ThemedText>
        </Pressable>
        {completedExpanded ? completedTasks.map(renderTask) : null}
      </View> : null}
      {canceledTasks.length ? <View style={styles.collapsibleGroup}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: canceledExpanded }} onPress={() => setCanceledExpanded((value) => !value)} style={styles.collapseButton}>
          <PlatformIcon color={theme.textSecondary} name={canceledExpanded ? 'chevron-down' : 'chevron-right'} size={17} />
          <ThemedText type="captionBold">Canceled</ThemedText>
          <ThemedText themeColor="textTertiary" type="caption">{countLabel(canceledTasks.length, partialCounts)}</ThemedText>
        </Pressable>
        {canceledExpanded ? canceledTasks.map(renderTask) : null}
      </View> : null}
    </>;
  }

  const noTasksTitle = search.trim()
    ? 'No matching tasks'
    : activeFilterCount
    ? 'No tasks match these filters'
      : view === 'this-week'
        ? 'Nothing needs attention'
          : view === 'done'
            ? 'No completed tasks'
            : 'No assigned tasks';
  const noTasksBody = activeFilterCount || search.trim()
    ? 'Change the search or filters to see more of your assigned work.'
    : view === 'this-week'
      ? 'Open tasks due this week will appear here.'
      : 'Tasks assigned to you will appear here.';

  return <ThemedView style={styles.screen}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView
      accessibilityLabel="My Tasks and Boards"
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: bottomContentInset,
          paddingTop: Spacing.four + insets.top,
          paddingLeft: Spacing.four + insets.left,
          paddingRight: Spacing.four + insets.right,
        },
      ]}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {isOffline ? <TaskStateBanner icon="cloud-off" message={allTasks.length ? 'Offline. Showing saved assignments.' : 'Offline. Reconnect to load assigned tasks and Boards.'} tone="offline" /> : null}
      {error ? <TaskStateBanner action={{ label: 'Dismiss', onPress: onDismissError }} icon="refresh" message={error} tone="danger" /> : null}
      {partialTasks ? <TaskStateBanner icon="information-outline" message="A Project has more than 500 assigned tasks. Its counts are partial." tone="offline" /> : null}
      {hasMoreProjects && !isLoadingMoreProjects ? <TaskStateBanner icon="information-outline" message="Counts include loaded Projects only. Load more Projects to update them." tone="offline" /> : null}

      <View style={styles.globalHeading}>
        <ThemedText accessibilityRole="header" numberOfLines={1} style={styles.pageTitle} type="display">My Tasks</ThemedText>
        <Pressable
          accessibilityHint="Opens the Company selector"
          accessibilityLabel={`Switch Company. Current Company: ${companyName}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: companyOptions.length < 2 }}
          disabled={companyOptions.length < 2}
          onPress={() => setCompanySheetOpen(true)}
          style={({ pressed }) => [styles.companyPill, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.homeBorder }]}
        >
          <EntityMark id={String(companyId ?? 'company')} imageUrl={companyLogoUrl ?? undefined} kind="company" name={companyName} size={24} />
          <ThemedText numberOfLines={1} style={styles.companyPillText} themeColor="textSecondary" type="captionBold">{companyName}</ThemedText>
          {companyOptions.length > 1 ? <PlatformIcon color={theme.textSecondary} name="chevron-down" size={14} /> : null}
        </Pressable>
      </View>

      <View style={styles.searchFilterRow}>
        <View style={[styles.searchField, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder }]}>
          <PlatformIcon color={theme.textTertiary} name="search" size={19} />
          <ThemedTextInput
            accessibilityLabel="Search tasks and Boards"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardAppearance={theme.background === '#1b1917' ? 'dark' : 'light'}
            maxFontSizeMultiplier={MaxFontScale}
            onChangeText={setSearch}
            placeholder="Search tasks and Boards"
            placeholderTextColor={theme.textTertiary}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.text }]}
            value={search}
          />
          {search ? <Pressable accessibilityLabel="Clear search" accessibilityRole="button" hitSlop={8} onPress={() => setSearch('')} style={styles.searchClear}>
            <PlatformIcon color={theme.textSecondary} name="close" size={17} />
          </Pressable> : null}
        </View>
        <Pressable accessibilityLabel={activeFilterCount ? `Filters, ${activeFilterCount} active` : 'Filters'} accessibilityRole="button" onPress={openFilters} style={[styles.filterButton, { backgroundColor: activeFilterCount ? theme.accentSoft : theme.backgroundElement, borderColor: activeFilterCount ? theme.accentStrong : theme.homeBorder }]}>
          <PlatformIcon color={activeFilterCount ? theme.accentStrong : theme.textSecondary} name="tune" size={20} />
          {activeFilterCount ? <View style={[styles.filterCount, { backgroundColor: theme.accent }]}><ThemedText themeColor="accentInk" type="captionBold">{activeFilterCount}</ThemedText></View> : null}
        </Pressable>
      </View>

      <ScrollView accessibilityLabel="Task time views" contentContainerStyle={styles.viewTabs} horizontal showsHorizontalScrollIndicator={false}>
        {taskViews.map(({ key, label }) => {
          const selected = view === key;
          const count = key === 'this-week' ? thisWeekCount : key === 'done' ? doneCount : contextualTasks.length;
          return <CompactPillButton accessibilityRole="tab" accessibilityState={{ selected }} key={key} onPress={() => setView(key)} pillStyle={{ backgroundColor: selected ? theme.accentSoft : theme.homeSurface, borderColor: selected ? 'transparent' : theme.homeBorder }} pressedPillStyle={{ backgroundColor: theme.backgroundElevated, borderColor: 'transparent' }}>
            <ThemedText style={{ color: selected ? theme.accentStrong : theme.textSecondary }} type={selected ? 'captionBold' : 'caption'}>{label}</ThemedText>
            <ThemedText style={{ color: selected ? theme.accentStrong : theme.textTertiary }} type="caption">{countLabel(count, partialCounts)}</ThemedText>
          </CompactPillButton>;
        })}
      </ScrollView>

      {isLoading && !allTasks.length
        ? <SkeletonList count={3} label="Loading assigned tasks" />
        : visibleTasks.length
          ? <View style={styles.taskFeed}>{renderRows()}</View>
          : <EmptyState icon="task" title={noTasksTitle} body={noTasksBody} />}

      {hasMoreProjects || isLoadingMoreProjects ? <Pressable accessibilityRole="button" disabled={isLoadingMoreProjects} onPress={onLoadMoreProjects} style={[styles.loadMore, { borderColor: theme.homeBorder }]}>
        <ThemedText themeColor="textSecondary" type="captionBold">{isLoadingMoreProjects ? 'Loading Projects...' : 'Load more Projects'}</ThemedText>
      </Pressable> : null}

      <View style={styles.boardDirectory}>
        <ThemedText accessibilityRole="header" style={styles.boardDirectoryHeading} type="subtitle">Boards</ThemedText>
        {boardsLoading
          ? <SkeletonList count={3} label="Loading Boards" />
          : matchingBoards.length === 0
            ? <EmptyState icon="view-board" title={search ? 'No matching Boards' : 'No Boards yet'} body={search ? 'Try a Project or Board name.' : 'Boards in your Projects will appear here.'} />
          : matchingBoards.map((item) => {
            const unreadCount = item.unreadCount;
            const unreadLabel = unreadCount ? `, ${unreadCount} unread notifications` : '';
            return <Pressable accessibilityHint={`Opens ${item.board.name} and its tasks`} accessibilityLabel={`${item.board.name} Board, ${item.project.name} Project${unreadLabel}`} accessibilityRole="button" key={item.board._id} onPress={() => onOpenBoard(item)} style={({ pressed }) => [styles.boardRow, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent', borderBottomColor: theme.hairline }]}>
              <View style={styles.boardMarkWrap}>
                <EntityMark colorKey={item.board.markColorKey} iconKey={item.board.markIconKey} id={String(item.board._id)} kind="board" name={item.board.name} size={36} />
                {unreadCount > 0 ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.boardUnreadBadge, { backgroundColor: theme.accent, borderColor: theme.homeSurface }]}><ThemedText style={styles.boardUnreadCount} themeColor="accentInk" type="captionBold">{unreadCount > 99 ? '99+' : unreadCount}</ThemedText></View> : null}
              </View>
              <View style={styles.boardCopy}><ThemedText numberOfLines={1} type="smallBold">{item.board.name}</ThemedText><ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{item.project.name}</ThemedText></View>
              <View style={[styles.boardArrow, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}><PlatformIcon color={theme.textSecondary} name="chevron-right" size={16} /></View>
            </Pressable>;
          })}
      </View>
    </ScrollView>

    <OptionsSheet onClose={() => setCompanySheetOpen(false)} title="Switch Company" visible={companySheetOpen}>
      <SheetSection title="Company workspace">
        {companyOptions.map((company) => <SheetRow
          detail={company.id === companyId ? 'Current workspace' : undefined}
          icon="office-building"
          key={company.id}
          label={company.name}
          onPress={() => { onSelectCompany(company.id); setCompanySheetOpen(false); }}
          selected={company.id === companyId}
        />)}
      </SheetSection>
    </OptionsSheet>

    <OptionsSheet onClose={cancelFilters} title="Filter tasks" visible={filterOpen}>
      <SheetNote>Choose values for the three filters, then apply them to your task list.</SheetNote>
      {editingFilter ? <>
        <Pressable accessibilityRole="button" onPress={() => setEditingFilter(null)} style={styles.filterBack}>
          <PlatformIcon color={theme.textSecondary} name="chevron-left" size={18} />
          <ThemedText themeColor="textSecondary" type="captionBold">All filters</ThemedText>
        </Pressable>
        <SheetSection title={filterFieldTitle(editingFilter)}>
          {(editingFilter === 'status' ? statusChoices : editingFilter === 'priority' ? priorityChoices : dueDateChoices).map(({ value, label }) => <SheetRow accessibilityRole="radio" icon={editingFilter === 'status' ? 'check-circle' : editingFilter === 'priority' ? 'flag' : 'calendar'} key={value} label={label} selected={draftFilters[editingFilter] === value} onPress={() => {
            setDraftFilters((current) => ({ ...current, [editingFilter]: value }));
            setEditingFilter(null);
          }} />)}
        </SheetSection>
      </> : <View style={styles.filterFields}>
        {(['status', 'priority', 'dueDate'] as const).map((key) => <Pressable accessibilityLabel={`${filterFieldTitle(key)}: ${filterFieldLabel(key)}`} accessibilityRole="button" key={key} onPress={() => setEditingFilter(key)} style={[styles.filterField, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
          <View style={styles.filterFieldCopy}><ThemedText themeColor="textSecondary" type="caption">{filterFieldTitle(key)}</ThemedText><ThemedText numberOfLines={1} type="smallBold">{filterFieldLabel(key)}</ThemedText></View>
          <PlatformIcon color={theme.textTertiary} name="chevron-down" size={17} />
        </Pressable>)}
      </View>}
      {!editingFilter ? <View style={styles.filterActions}>
        <Pressable accessibilityRole="button" onPress={() => setDraftFilters(emptyMyTaskFilters)} style={[styles.filterSecondary, { borderColor: theme.homeBorder }]}><ThemedText themeColor="textSecondary" type="captionBold">Clear choices</ThemedText></Pressable>
        <Pressable accessibilityRole="button" onPress={cancelFilters} style={[styles.filterSecondary, { borderColor: theme.homeBorder }]}><ThemedText themeColor="textSecondary" type="captionBold">Cancel</ThemedText></Pressable>
        <Pressable accessibilityRole="button" onPress={applyFilters} style={[styles.filterApply, { backgroundColor: theme.accent }]}><ThemedText themeColor="accentInk" type="captionBold">Apply filters</ThemedText></Pressable>
      </View> : null}
    </OptionsSheet>

    <OptionsSheet onClose={() => setStatusTask(null)} title={statusTask ? `Status: ${statusTask.task.title}` : 'Change task status'} visible={Boolean(statusTask)}>
      {scopedBoard?.states.length ? <SheetSection title="Move to status">
        {scopedBoard.states.map((state) => <SheetRow accessibilityRole="radio" icon="view-column" key={state._id} label={state.name} selected={state._id === statusTask?.task.workflowStateId} onPress={() => {
          if (!statusTask) return;
          if (state._id === statusTask.task.workflowStateId) {
            setStatusTask(null);
            return;
          }
          onSetTaskStatus(statusTask, String(state._id));
          setStatusTask(null);
        }} />)}
      </SheetSection> : <SheetNote>Task statuses are unavailable right now.</SheetNote>}
    </OptionsSheet>
    <OptionsSheet onClose={onCancelTaskStatusConfirmation} title="Open checklist items" visible={Boolean(confirmationTask)}>
      <SheetNote>This task has open checklist items. Move it to {confirmationState?.name ?? 'this status'} anyway?</SheetNote>
      <View style={styles.filterActions}>
        <Pressable accessibilityRole="button" onPress={onCancelTaskStatusConfirmation} style={[styles.filterSecondary, { borderColor: theme.homeBorder }]}><ThemedText themeColor="textSecondary" type="captionBold">Cancel</ThemedText></Pressable>
        <Pressable accessibilityRole="button" onPress={onConfirmTaskStatus} style={[styles.filterApply, { backgroundColor: theme.accent }]}><ThemedText themeColor="accentInk" type="captionBold">{confirmationState?.category === 'completed' ? 'Complete anyway' : 'Move anyway'}</ThemedText></Pressable>
      </View>
    </OptionsSheet>
    {createTaskSheet}
  </ThemedView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: Spacing.three },
  globalHeading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  pageTitle: { flexShrink: 1 },
  companyPill: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.one, maxWidth: '48%', minHeight: 34, paddingHorizontal: Spacing.two },
  companyPillText: { flexShrink: 1 },
  searchFilterRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  searchField: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, flex: 1, flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  searchInput: { ...Typography.body, flex: 1, minWidth: 0, paddingVertical: Spacing.two },
  searchClear: { alignItems: 'center', borderRadius: Radius.pill, height: 32, justifyContent: 'center', width: 32 },
  filterButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, height: TouchTarget, justifyContent: 'center', position: 'relative', width: TouchTarget },
  filterCount: { alignItems: 'center', borderRadius: Radius.pill, justifyContent: 'center', minHeight: 20, minWidth: 20, paddingHorizontal: Spacing.one, position: 'absolute', right: -5, top: -5 },
  viewTabs: { alignItems: 'center', gap: Spacing.one, paddingRight: Spacing.four },
  taskFeed: { gap: Spacing.three },
  taskGroup: { gap: Spacing.one },
  taskGroupHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 32 },
  compactTaskRow: { borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  compactTaskTitleRow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.small, flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', minHeight: 30 },
  compactTaskArrow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: 28, justifyContent: 'center', width: 28 },
  compactTaskTitle: { flex: 1, minWidth: 0 },
  compactTaskMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  compactProjectPill: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.one, maxWidth: 150, minHeight: 26, paddingHorizontal: Spacing.two },
  compactProjectName: { flexShrink: 1 },
  compactTaskDue: { flexShrink: 1, minWidth: 0 },
  collapsibleGroup: { gap: Spacing.one },
  collapseButton: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, minHeight: TouchTarget },
  loadMore: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: TouchTarget },
  boardDirectory: { gap: Spacing.one, paddingTop: Spacing.four },
  boardDirectoryHeading: { paddingBottom: Spacing.one },
  boardRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, minHeight: 64, paddingHorizontal: Spacing.one, paddingVertical: Spacing.two },
  boardMarkWrap: { height: 38, position: 'relative', width: 38 },
  boardCopy: { flex: 1, gap: 2, minWidth: 0 },
  boardArrow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  boardUnreadBadge: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1.5, justifyContent: 'center', minHeight: 24, minWidth: 24, paddingHorizontal: 3, paddingVertical: 2, position: 'absolute', right: -4, top: -4 },
  boardUnreadCount: Typography.captionBold,
  filterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  filterBack: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: Spacing.one, minHeight: TouchTarget },
  filterFields: { gap: Spacing.two },
  filterField: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  filterFieldCopy: { flex: 1, gap: Spacing.half, minWidth: 0 },
  filterSecondary: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  filterApply: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, flex: 1, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.three },
});
