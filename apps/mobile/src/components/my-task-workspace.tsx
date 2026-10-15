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
import { ThemedView } from '@/components/themed-view';
import { MobileHeaderMetrics, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useBottomTabContentInset } from '@/hooks/use-bottom-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { WorkspaceTopControls } from '@/components/workspace-top-controls';
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
  onCreateTaskInBoard: (board: BoardEntry) => void;
  onEditBoardMark: (board: BoardEntry) => void;
  onOpenTask: (task: MyTask) => void;
  onSetTaskStatus: (task: MyTask, workflowStateId: string) => void;
  onSelectCompany: (companyId: Id<'companies'> | null) => void;
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
  board: BoardEntry;
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
  onCreateTaskInBoard,
  onEditBoardMark,
  onOpenTask,
  onSetTaskStatus,
  onSelectCompany,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Clear the floating navigation and Create button without adding another
  // tail gap below the final Board.
  const bottomContentInset = useBottomTabContentInset(0);
  const today = localTaskDate();
  const dates = useMemo(() => weekDateKeys(today), [today]);
  const [search, setSearch] = useState('');
  const [statusTask, setStatusTask] = useState<MyTask | null>(null);
  const [boardActionTarget, setBoardActionTarget] = useState<BoardEntry | null>(null);
  const [pendingBoardAction, setPendingBoardAction] = useState<{ board: BoardEntry; action: 'create' | 'editMark' } | null>(null);
  const [companySheetOpen, setCompanySheetOpen] = useState(false);
  const previousBoardIconKeys = useRef(new Map<string, EntityMarkIconKey>());
  const boardLongPressHandled = useRef(false);

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
    board: item,
    onOpen: () => onOpenBoard(item),
  }));
  function renderTask(task: WorkspaceTaskRow) {
    const taskLabel = `Task: ${task.title}. Project: ${task.projectName}. Current status: ${task.statusLabel}. ${task.dueDate ? taskGroupLabel(task.dueDate, today, dates) : 'No due date'}`;
    return <View key={task.key} style={styles.compactTaskRow}>
      <View style={styles.compactTaskContent}>
        <Pressable
          accessible
          accessibilityHint="Opens the task"
          accessibilityLabel={taskLabel}
          accessibilityRole="button"
          onPress={task.onOpen}
          style={({ pressed }) => [styles.compactTaskOpenButton, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}
        >
          <View style={styles.compactTaskOpenCopy}>
            <ThemedText numberOfLines={2} style={styles.compactTaskTitle} type="smallBold">{task.title}</ThemedText>
            <View style={styles.compactProjectContext}>
              <EntityMark colorKey={task.projectMarkColorKey} iconKey={task.projectMarkIconKey} id={task.projectId} kind="project" name={task.projectName} size={15} />
              <ThemedText numberOfLines={1} style={styles.compactProjectName} themeColor="textSecondary" type="caption">{task.projectName}</ThemedText>
            </View>
          </View>
          <View style={[styles.compactTaskArrow, { backgroundColor: theme.backgroundElevated, borderColor: theme.homeBorder }]}>
            <PlatformIcon color={theme.textSecondary} name="chevron-right" size={16} />
          </View>
        </Pressable>
        <View style={styles.compactTaskMeta}>
          <TaskStatusPill
            accessibilityLabel={`Change status for ${task.title} in ${task.projectName}. Current status: ${task.statusLabel}`}
            compact
            category={task.statusCategory}
            label={task.statusLabel}
            onPress={task.onStatusPress}
          />
          <View style={styles.compactTaskDue}><TaskDueChip category={task.statusCategory} dueDate={task.dueDate} showNoDate /></View>
        </View>
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
    const actionActive = boardActionTarget?.board._id === item.board.board._id;

    return <View style={[styles.boardBlock, { borderBottomColor: theme.homeBorder }]}>
      <Pressable
        accessibilityHint={`Opens ${item.name} and its tasks. Long press for Board actions.`}
        accessibilityLabel={`${item.name} Board, ${item.projectName} Project, ${taskLabel}${unreadLabel}`}
        accessibilityRole="button"
        android_ripple={{ color: theme.backgroundSelected }}
        onLongPress={() => {
          boardLongPressHandled.current = true;
          setBoardActionTarget(item.board);
        }}
        onPress={() => {
          if (boardLongPressHandled.current) {
            boardLongPressHandled.current = false;
            return;
          }
          item.onOpen();
        }}
        onPressIn={() => { boardLongPressHandled.current = false; }}
        style={({ pressed }) => [
          styles.boardRow,
          pressed ? { backgroundColor: theme.backgroundSelected } : null,
        ]}
      >
        {({ pressed }) => <>
          <View style={styles.boardMarkWrap}>
            <View style={[
              styles.boardIconMask,
              {
                backgroundColor: actionActive ? theme.accentSoft : pressed ? theme.backgroundSelected : 'transparent',
                borderColor: actionActive ? theme.accentStrong : theme.textTertiary,
                borderWidth: actionActive ? 2 : pressed ? StyleSheet.hairlineWidth : 0,
              },
            ]}>
              <EntityMark colorKey={item.markColorKey} iconKey={item.markIconKey} id={item.id} kind="board" name={item.name} size={entityDirectoryRow.iconSize} />
            </View>
            {item.assignedTaskCount > 0 ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.boardTaskBadge, { backgroundColor: theme.accentSoft, borderColor: theme.backgroundElevated }]}><ThemedText style={[styles.boardTaskCount, { color: theme.accentStrong }]} type="captionBold">{displayCount}</ThemedText></View> : null}
          </View>
          <View style={styles.boardCopy}>
            <ThemedText numberOfLines={1} type="subtitle">{item.name}</ThemedText>
            <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{item.projectName}</ThemedText>
          </View>
          <View style={styles.boardSignals}>
            {item.unreadCount > 0 ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.boardUnreadDot, { backgroundColor: theme.accentStrong }]} /> : null}
            <View style={[styles.boardArrow, { backgroundColor: theme.backgroundElevated, borderColor: theme.homeBorder }]}><PlatformIcon color={theme.textSecondary} name="chevron-right" size={16} /></View>
          </View>
        </>}
      </Pressable>
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
      ListFooterComponent={<View style={styles.listFooter}>
        {hasMoreProjects || isLoadingMoreProjects ? <Pressable accessibilityRole="button" disabled={isLoadingMoreProjects} onPress={onLoadMoreProjects} style={[styles.loadMore, { borderColor: theme.homeBorder }]}>
          <ThemedText themeColor="textSecondary" type="captionBold">{isLoadingMoreProjects ? 'Loading Projects...' : 'Load more Projects'}</ThemedText>
        </Pressable> : null}
        <View style={[styles.attentionFooter, { borderTopColor: theme.homeBorder }]}>
          <View style={styles.attentionSection}>
            <View style={styles.attentionHeading}>
              <View style={styles.attentionTitle}><PlatformIcon color={theme.accentStrong} name="flag" size={18} /><ThemedText accessibilityRole="header" type="subtitle">Needs attention</ThemedText></View>
              <ThemedText accessibilityLabel={`${liveTaskRows.length} tasks selected, up to 5 this week`} themeColor="textSecondary" type="captionBold">{liveTaskRows.length ? `${liveTaskRows.length} selected` : 'All clear'}</ThemedText>
            </View>
            {isLoading && !allTasks.length ? <ThemedText themeColor="textSecondary" type="caption">Loading assigned work…</ThemedText>
              : liveTaskRows.length ? <View style={[styles.attentionList, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}>
                {liveTaskRows.map((task, index) => <View key={task.key}>
                  {renderTask(task)}
                  {index < liveTaskRows.length - 1 ? <View style={[styles.attentionDivider, { backgroundColor: theme.homeBorder }]} /> : null}
                </View>)}
              </View>
                : <View style={[styles.attentionEmpty, { backgroundColor: theme.backgroundElement, borderColor: theme.homeBorder }]}>
                  <PlatformIcon color={theme.textTertiary} name="check-circle" size={16} />
                  <ThemedText style={styles.attentionEmptyCopy} themeColor="textSecondary" type="caption">Urgent, high-priority, and overdue work will appear here.</ThemedText>
                </View>}
          </View>
        </View>
      </View>}
      ListHeaderComponent={<View style={styles.listHeader}>
        {isOffline ? <TaskStateBanner icon="cloud-off" message={allTasks.length ? 'Offline. Showing saved assignments.' : 'Offline. Reconnect to load assigned tasks and Boards.'} tone="offline" /> : null}
        {error ? <TaskStateBanner action={{ label: 'Dismiss', onPress: onDismissError }} icon="refresh" message={error} tone="danger" /> : null}
        {partialTasks ? <TaskStateBanner icon="information-outline" message="A Project has more than 500 assigned tasks. Its counts are partial." tone="offline" /> : null}
        {hasMoreProjects && !isLoadingMoreProjects ? <TaskStateBanner icon="information-outline" message="Counts include loaded Projects only. Load more Projects to update them." tone="offline" /> : null}

        <WorkspaceTopControls
          companyId={companyId ? String(companyId) : null}
          companyLogoUrl={companyLogoUrl}
          companyName={companyName}
          disabled={false}
          onSearchChange={setSearch}
          onSwitchCompany={() => setCompanySheetOpen(true)}
          search={search}
          searchAccessibilityLabel="Search tasks and Boards"
          searchPlaceholder="Search tasks and Boards"
          title="My Tasks"
        />

        <View style={styles.boardDirectory}>
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
        <SheetRow icon="person" label="Personal Projects" onPress={() => { onSelectCompany(null); setCompanySheetOpen(false); }} selected={companyId === null} />
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

    <OptionsSheet
      onClose={() => setBoardActionTarget(null)}
      onClosed={() => {
        if (!pendingBoardAction) return;
        const pending = pendingBoardAction;
        setPendingBoardAction(null);
        if (pending.action === 'create') onCreateTaskInBoard(pending.board);
        else onEditBoardMark(pending.board);
      }}
      title="Board actions"
      visible={Boolean(boardActionTarget)}
    >
      {boardActionTarget ? <>
        <SheetNote>{boardActionTarget.board.name}</SheetNote>
        <SheetSection title="Actions">
          <SheetRow
            accessibilityHint={`Starts a task in ${boardActionTarget.board.name}`}
            icon="plus"
            label="Create task in this Board"
            onPress={() => {
              setPendingBoardAction({ action: 'create', board: boardActionTarget });
              setBoardActionTarget(null);
            }}
          />
          {boardActionTarget.canManageMark ? <SheetRow
            accessibilityHint={`Changes the icon and color for ${boardActionTarget.board.name}`}
            icon="edit"
            label="Edit Board mark"
            onPress={() => {
              setPendingBoardAction({ action: 'editMark', board: boardActionTarget });
              setBoardActionTarget(null);
            }}
          /> : null}
        </SheetSection>
      </> : null}
    </OptionsSheet>

    <OptionsSheet onClose={() => setStatusTask(null)} title="Change task status" visible={Boolean(statusTask)}>
      {statusTask ? <View
        accessible
        accessibilityLabel={`Task: ${statusTask.task.title}. Project: ${statusTask.project.name}`}
        style={styles.statusTaskContext}
      >
        <ThemedText numberOfLines={1} type="captionBold">{statusTask.task.title}</ThemedText>
        <ThemedText numberOfLines={2} themeColor="textSecondary" type="caption">{statusTask.project.name}</ThemedText>
      </View> : null}
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
  listFooter: { gap: Spacing.three },
  attentionSection: { gap: Spacing.one },
  attentionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 32 },
  attentionTitle: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  attentionList: { borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  attentionDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.two },
  attentionEmpty: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, minHeight: 44, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  attentionEmptyCopy: { flex: 1, minWidth: 0 },
  compactTaskRow: { minWidth: 0, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  compactTaskContent: { flex: 1, gap: Spacing.one, minWidth: 0 },
  compactTaskOpenButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, minWidth: 0, paddingHorizontal: Spacing.one, paddingVertical: Spacing.one },
  compactTaskOpenCopy: { flex: 1, gap: Spacing.half, minWidth: 0 },
  compactTaskArrow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: 36, justifyContent: 'center', width: 36 },
  compactTaskTitle: { flex: 1, minWidth: 0 },
  compactTaskMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  statusTaskContext: { gap: Spacing.half, paddingHorizontal: Spacing.one },
  compactProjectContext: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: Spacing.one, maxWidth: '100%', minWidth: 0 },
  compactProjectName: { flexShrink: 1, minWidth: 0 },
  compactTaskDue: { flexShrink: 1, minWidth: 0 },
  loadMore: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: TouchTarget },
  boardDirectory: { paddingTop: Spacing.one },
  attentionFooter: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: Spacing.one, paddingTop: Spacing.three },
  boardDirectoryHeading: { paddingBottom: Spacing.one },
  boardBlock: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: entityDirectoryRow.separatorPadding },
  boardRow: { ...entityDirectoryRowStyle, paddingRight: Spacing.three },
  boardMarkWrap: { flexShrink: 0, height: entityDirectoryRow.iconSize, position: 'relative', width: entityDirectoryRow.iconSize },
  boardIconMask: { borderRadius: Radius.pill, height: entityDirectoryRow.iconSize, overflow: 'hidden', width: entityDirectoryRow.iconSize },
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
