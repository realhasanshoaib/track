import { Stack } from 'expo-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TaskStateCategory } from '@track/shared/tasks';
import type { Id } from '../../../../convex/_generated/dataModel';
import { resolveDistinctBoardIconKeys, type EntityMarkIconKey } from '@track/shared';
import type { BoardEntry, MyTask } from '@/lib/my-task-types';
import { EmptyState } from '@/components/empty-state';
import { EntityMark } from '@/components/entity-mark';
import { OptionsSheet, SheetNote, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { SkeletonList } from '@/components/skeleton-row';
import { TaskDueChip, TaskStateBanner, TaskStatusPill } from '@/components/task-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { MaxFontScale, MobileHeaderMetrics, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useBottomTabContentInset } from '@/hooks/use-bottom-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { myTaskAttentionWeekItems } from '@/lib/my-task-attention';
import { localTaskDate, parseTaskDate } from '@/lib/task-presentation';
import { summarizeMyTaskCounts } from '@/lib/my-task-counts';
import {
  matchesMyTaskSearch,
  uniqueMyTasks,
} from '@/lib/my-task-work-view';
import { weekDateKeys } from '@/lib/task-week';
import { entityDirectoryRow, entityDirectoryRowStyle } from '@/lib/entity-directory-row';

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

type WorkspaceTaskRow = {
  key: string;
  title: string;
  projectId: string;
  projectName: string;
  projectMarkColorKey?: string | null;
  projectMarkIconKey?: string | null;
  statusLabel: string;
  statusCategory?: TaskStateCategory;
  dueDate?: string;
  onOpen: () => void;
  onStatusPress: () => void;
};

type WorkspaceBoardRow = {
  key: string;
  id: string;
  name: string;
  projectName: string;
  markColorKey?: string | null;
  markIconKey?: string | null;
  assignedTaskCount: number;
  unreadCount: number;
  onOpen: () => void;
};

function taskGroupLabel(date: string | undefined, today: string, weekDates: readonly string[]) {
  if (!date) return 'No due date';
  if (date < today) return 'Overdue';
  if (weekDates.includes(date)) return 'Due this week';
  const parsed = parseTaskDate(date);
  return parsed?.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) ?? date;
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
  const [search, setSearch] = useState('');
  const [statusTask, setStatusTask] = useState<MyTask | null>(null);
  const [companySheetOpen, setCompanySheetOpen] = useState(false);
  const previousBoardIconKeys = useRef(new Map<string, EntityMarkIconKey>());

  const allTasks = useMemo(() => uniqueMyTasks(assignedTasks), [assignedTasks]);
  const boardTaskCounts = useMemo(() => summarizeMyTaskCounts(allTasks, today).byBoard, [allTasks, today]);
  const boardById = useMemo(() => new Map(boards.map((board) => [String(board.board._id), board])), [boards]);
  const partialTasks = allTasks.some((item) => item.hasMoreAssignedTasks);
  const attentionTasks = useMemo(() => myTaskAttentionWeekItems(
    allTasks.filter((item) => matchesMyTaskSearch(item, search, boardById.get(String(item.task.boardId))?.board.name ?? '')),
    today,
    dates[dates.length - 1] ?? today,
  ), [allTasks, boardById, dates, search, today]);
  const matchingBoards = boards.filter(({ board, project }) =>
    (board.name + ' ' + project.name).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const boardIconKeys = useMemo(() => {
    const assignments = resolveDistinctBoardIconKeys(boards.map(({ board }) => ({
      createdAt: board.createdAt,
      id: String(board._id),
      iconKey: board.markIconKey,
      name: board.name,
    })), previousBoardIconKeys.current);
    previousBoardIconKeys.current = assignments;
    return assignments;
  }, [boards]);
  const scopedBoard = statusTask ? boardById.get(String(statusTask.task.boardId)) : undefined;
  const confirmationBoard = confirmationTask ? boardById.get(String(confirmationTask.task.boardId)) : undefined;
  const confirmationState = confirmationBoard?.states.find((state) => String(state._id) === confirmationStateId);

  const liveTaskRows: WorkspaceTaskRow[] = attentionTasks.map((task) => ({
    key: String(task.task._id),
    title: task.task.title,
    projectId: String(task.project._id),
    projectName: task.project.name,
    projectMarkColorKey: task.project.markColorKey,
    projectMarkIconKey: task.project.markIconKey,
    statusLabel: task.state?.name ?? 'Unknown status',
    statusCategory: task.state?.category,
    dueDate: task.task.dueDate,
    onOpen: () => onOpenTask(task),
    onStatusPress: () => setStatusTask(task),
  }));
  const liveBoardRows: WorkspaceBoardRow[] = matchingBoards.map((item) => ({
    key: String(item.board._id),
    id: String(item.board._id),
    name: item.board.name,
    projectName: item.project.name,
    markColorKey: item.board.markColorKey,
    markIconKey: boardIconKeys.get(String(item.board._id)),
    assignedTaskCount: boardTaskCounts.get(String(item.board._id))?.assignedCount ?? 0,
    unreadCount: item.unreadCount,
    onOpen: () => onOpenBoard(item),
  }));
  function renderTask(task: WorkspaceTaskRow) {
    const taskLabel = `${task.title}. ${task.projectName}. ${task.statusLabel}. ${task.dueDate ? taskGroupLabel(task.dueDate, today, dates) : 'No due date'}`;
    const titleContent = <>
      <ThemedText numberOfLines={2} style={styles.compactTaskTitle} type="smallBold">{task.title}</ThemedText>
      <View style={[styles.compactTaskArrow, { backgroundColor: theme.backgroundElevated, borderColor: theme.homeBorder }]}>
        <PlatformIcon color={theme.textSecondary} name="chevron-right" size={16} />
      </View>
    </>;
    return <View key={task.key} style={[styles.compactTaskRow, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
      <Pressable
        accessibilityHint="Opens the task"
        accessibilityLabel={taskLabel}
        accessibilityRole="button"
        onPress={task.onOpen}
        style={({ pressed }) => [styles.compactTaskTitleRow, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}
      >{titleContent}</Pressable>
      <View style={styles.compactTaskMeta}>
        <TaskStatusPill compact category={task.statusCategory} label={task.statusLabel} onPress={task.onStatusPress} />
        <View style={styles.compactProjectPill}>
          <EntityMark colorKey={task.projectMarkColorKey} iconKey={task.projectMarkIconKey} id={task.projectId} kind="project" name={task.projectName} size={15} />
          <ThemedText numberOfLines={1} style={styles.compactProjectName} themeColor="textSecondary" type="caption">{task.projectName}</ThemedText>
        </View>
        <View style={styles.compactTaskDue}><TaskDueChip category={task.statusCategory} dueDate={task.dueDate} showNoDate /></View>
      </View>
    </View>;
  }

  function renderBoard({ item }: { item: WorkspaceBoardRow }) {
    const formattedCount = new Intl.NumberFormat().format(item.assignedTaskCount);
    const displayCount = item.assignedTaskCount > 9_999
      ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, notation: 'compact' }).format(item.assignedTaskCount)
      : formattedCount;
    const taskLabel = `${formattedCount} assigned ${item.assignedTaskCount === 1 ? 'task' : 'tasks'}`;
    const unreadLabel = item.unreadCount ? `, ${item.unreadCount} unread notifications` : '';
    const rowContent = <>
      <View style={styles.boardMarkWrap}>
        <EntityMark colorKey={item.markColorKey} iconKey={item.markIconKey} id={item.id} kind="board" name={item.name} size={entityDirectoryRow.iconSize} />
        {item.assignedTaskCount > 0 ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.boardTaskBadge, { backgroundColor: theme.accentSoft, borderColor: theme.backgroundElevated }]}><ThemedText style={[styles.boardTaskCount, { color: theme.accentStrong }]} type="captionBold">{displayCount}</ThemedText></View> : null}
      </View>
      <View style={styles.boardCopy}>
        <ThemedText numberOfLines={1} type="smallBold">{item.name}</ThemedText>
        <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{item.projectName}</ThemedText>
      </View>
      <View style={styles.boardSignals}>
        {item.unreadCount > 0 ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.boardUnreadDot, { backgroundColor: theme.accentStrong }]} /> : null}
        <View style={[styles.boardArrow, { backgroundColor: theme.backgroundElevated, borderColor: theme.homeBorder }]}><PlatformIcon color={theme.textSecondary} name="chevron-right" size={16} /></View>
      </View>
    </>;

    return <View style={[styles.boardBlock, { borderBottomColor: theme.homeBorder }]}>
      <Pressable accessibilityHint={`Opens ${item.name} and its tasks`} accessibilityLabel={`${item.name} Board, ${item.projectName} Project, ${taskLabel}${unreadLabel}`} accessibilityRole="button" onPress={item.onOpen} style={({ pressed }) => [styles.boardRow, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>{rowContent}</Pressable>
    </View>;
  }

  return <ThemedView style={styles.screen}>
    <Stack.Screen options={{ headerShown: false }} />
    <FlatList
      accessibilityLabel="My Tasks and Boards"
      contentContainerStyle={[
        styles.listContent,
        {
          paddingBottom: bottomContentInset,
          paddingTop: MobileHeaderMetrics.contentTop + insets.top,
          paddingLeft: Spacing.four + insets.left,
          paddingRight: Spacing.four + insets.right,
        },
      ]}
      contentInsetAdjustmentBehavior="never"
      data={liveBoardRows}
      initialNumToRender={10}
      keyExtractor={(item) => item.key}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<View style={styles.boardListEmpty}>{boardsLoading
        ? <SkeletonList count={3} label="Loading Boards" />
        : <EmptyState icon="view-board" title={search ? 'No matching Boards' : 'No Boards yet'} body={search ? 'Try a Project or Board name.' : 'Boards in your Projects will appear here.'} />}</View>}
      ListFooterComponent={hasMoreProjects || isLoadingMoreProjects
        ? <Pressable accessibilityRole="button" disabled={isLoadingMoreProjects} onPress={onLoadMoreProjects} style={[styles.loadMore, { borderColor: theme.homeBorder }]}>
          <ThemedText themeColor="textSecondary" type="captionBold">{isLoadingMoreProjects ? 'Loading Projects...' : 'Load more Projects'}</ThemedText>
        </Pressable>
        : null}
      ListHeaderComponent={<View style={styles.listHeader}>
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
            accessibilityState={{ disabled: companyOptions.length === 0 }}
            disabled={companyOptions.length === 0}
            onPress={() => setCompanySheetOpen(true)}
            style={({ pressed }) => [styles.companySwitchButton, { backgroundColor: pressed ? theme.backgroundSelected : theme.homeSurface, borderColor: theme.homeBorder }]}
          >
            <EntityMark id={String(companyId ?? 'company')} imageUrl={companyLogoUrl ?? undefined} kind="company" name={companyName} size={26} />
            <ThemedText numberOfLines={1} style={styles.companySwitchName} type="captionBold">{companyName}</ThemedText>
            <PlatformIcon color={theme.textSecondary} name="chevron-down" size={14} weight="regular" />
          </Pressable>
        </View>

        <View style={[styles.searchField, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder }]}>
          <PlatformIcon color={theme.textTertiary} name="search" size={17} />
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

        <View style={styles.attentionSection}>
          <View style={styles.attentionHeading}>
            <View style={styles.attentionTitle}><PlatformIcon color={theme.accentStrong} name="flag" size={18} /><ThemedText accessibilityRole="header" type="subtitle">Needs attention</ThemedText></View>
            <ThemedText accessibilityLabel={`Up to 5 this week, ${liveTaskRows.length} tasks shown`} themeColor="textSecondary" type="captionBold">Up to 5 this week</ThemedText>
          </View>
          {isLoading && !allTasks.length ? <ThemedText themeColor="textSecondary" type="caption">Loading assigned work…</ThemedText>
            : liveTaskRows.length ? liveTaskRows.map(renderTask)
              : <ThemedText themeColor="textSecondary" type="caption">Urgent, high-priority, and overdue tasks due this week will appear here.</ThemedText>}
        </View>

        <View style={[styles.boardDirectory, { borderTopColor: theme.homeBorder }]}>
          <ThemedText accessibilityRole="header" style={styles.boardDirectoryHeading} type="subtitle">Boards</ThemedText>
        </View>
      </View>}
      maxToRenderPerBatch={12}
      renderItem={renderBoard}
      showsVerticalScrollIndicator={false}
      windowSize={7}
    />

    <OptionsSheet onClose={() => setCompanySheetOpen(false)} title="Switch Company" visible={companySheetOpen}>
      <SheetSection title="Company workspace">
        {companyOptions.map((company) => <SheetRow
          detail="Company conversations"
          key={company.id}
          label={company.name}
          leading={<EntityMark id={String(company.id)} imageUrl={company.logoUrl ?? undefined} kind="company" name={company.name} size={36} />}
          onPress={() => { onSelectCompany(company.id); setCompanySheetOpen(false); }}
          selected={company.id === companyId}
        />)}
      </SheetSection>
    </OptionsSheet>

    <OptionsSheet onClose={() => setStatusTask(null)} title={statusTask ? `Change status for ${statusTask.task.title} in ${statusTask.project.name}` : 'Change task status'} visible={Boolean(statusTask)}>
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
      <View style={styles.confirmationActions}>
        <Pressable accessibilityRole="button" onPress={onCancelTaskStatusConfirmation} style={[styles.confirmationSecondary, { borderColor: theme.homeBorder }]}><ThemedText themeColor="textSecondary" type="captionBold">Cancel</ThemedText></Pressable>
        <Pressable accessibilityRole="button" onPress={onConfirmTaskStatus} style={[styles.confirmationPrimary, { backgroundColor: theme.accent }]}><ThemedText themeColor="accentInk" type="captionBold">{confirmationState?.category === 'completed' ? 'Complete anyway' : 'Move anyway'}</ThemedText></Pressable>
      </View>
    </OptionsSheet>
    {createTaskSheet}
  </ThemedView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { flexGrow: 1 },
  listHeader: { gap: Spacing.three },
  globalHeading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', minHeight: TouchTarget },
  pageTitle: { flex: 1, flexShrink: 1, minWidth: 0 },
  companySwitchButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexShrink: 1, gap: Spacing.two, height: TouchTarget, justifyContent: 'flex-start', maxWidth: '62%', minWidth: TouchTarget, paddingHorizontal: Spacing.two },
  companySwitchName: { flexShrink: 1, minWidth: 0 },
  attentionSection: { gap: Spacing.one },
  attentionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 32 },
  attentionTitle: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  searchField: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, height: 44, minHeight: 44, paddingHorizontal: Spacing.three, width: '100%' },
  searchInput: { ...Typography.body, flex: 1, minWidth: 0, paddingVertical: 0 },
  searchClear: { alignItems: 'center', borderRadius: Radius.pill, height: 32, justifyContent: 'center', width: 32 },
  compactTaskRow: { borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  compactTaskTitleRow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.small, flexDirection: 'row', gap: Spacing.two, minHeight: 36 },
  compactTaskArrow: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexShrink: 0, height: 36, justifyContent: 'center', marginLeft: 'auto', width: 36 },
  compactTaskTitle: { flex: 1, minWidth: 0 },
  compactTaskMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  compactProjectPill: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: Spacing.one, maxWidth: 132, minHeight: 24, paddingHorizontal: 2 },
  compactProjectName: { flexShrink: 1, minWidth: 0 },
  compactTaskDue: { flexShrink: 1, minWidth: 0 },
  loadMore: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: TouchTarget },
  boardDirectory: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three },
  boardDirectoryHeading: { paddingBottom: Spacing.one },
  boardBlock: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: entityDirectoryRow.separatorPadding },
  boardRow: { ...entityDirectoryRowStyle, paddingRight: Spacing.three },
  boardMarkWrap: { flexShrink: 0, height: entityDirectoryRow.iconSize, position: 'relative', width: entityDirectoryRow.iconSize },
  boardCopy: { flex: 1, gap: entityDirectoryRow.copyGap, minWidth: 0 },
  boardSignals: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: Spacing.two },
  boardListEmpty: { paddingTop: Spacing.two },
  boardArrow: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: 36, justifyContent: 'center', width: 36 },
  boardTaskBadge: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: 1.5, justifyContent: 'center', minHeight: 20, minWidth: 20, paddingHorizontal: 4, position: 'absolute', right: -8, top: -7 },
  boardTaskCount: { ...Typography.captionBold, fontVariant: ['tabular-nums'] },
  boardUnreadDot: { borderRadius: Radius.pill, height: 8, width: 8 },
  confirmationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  confirmationSecondary: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  confirmationPrimary: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, flex: 1, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.three },
});
