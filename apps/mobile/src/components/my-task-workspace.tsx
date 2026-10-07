import { Stack } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Id } from '../../../../convex/_generated/dataModel';
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
import { MaxFontScale, Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
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

  const allTasks = useMemo(() => uniqueMyTasks(assignedTasks), [assignedTasks]);
  const boardTaskCounts = useMemo(() => summarizeMyTaskCounts(allTasks, today).byBoard, [allTasks, today]);
  const boardById = useMemo(() => new Map(boards.map((board) => [String(board.board._id), board])), [boards]);
  const partialTasks = allTasks.some((item) => item.hasMoreAssignedTasks);
  const attentionTasks = useMemo(() => myTaskAttentionWeekItems(
    allTasks.filter((item) => matchesMyTaskSearch(item, search, boardById.get(String(item.task.boardId))?.board.name ?? '')),
    today,
    dates[dates.length - 1] ?? today,
  ), [allTasks, boardById, dates, search, today]);
  const thisWeekCount = attentionTasks.length;
  const matchingBoards = boards.filter(({ board, project }) =>
    (board.name + ' ' + project.name).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const scopedBoard = statusTask ? boardById.get(String(statusTask.task.boardId)) : undefined;
  const confirmationBoard = confirmationTask ? boardById.get(String(confirmationTask.task.boardId)) : undefined;
  const confirmationState = confirmationBoard?.states.find((state) => String(state._id) === confirmationStateId);

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
        <View style={styles.headingCopy}>
          <ThemedText accessibilityRole="header" numberOfLines={1} style={styles.pageTitle} type="display">My Tasks</ThemedText>
          <ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{companyName}</ThemedText>
        </View>
        <Pressable
          accessibilityHint="Opens the Company selector"
          accessibilityLabel={`Switch Company. Current Company: ${companyName}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: companyOptions.length === 0 }}
          disabled={companyOptions.length === 0}
          onPress={() => setCompanySheetOpen(true)}
          style={({ pressed }) => [styles.companyPill, { backgroundColor: pressed ? theme.backgroundSelected : theme.homeSurface, borderColor: theme.homeBorder }]}
        >
          <EntityMark id={String(companyId ?? 'company')} imageUrl={companyLogoUrl ?? undefined} kind="company" name={companyName} size={30} />
          <PlatformIcon color={theme.textSecondary} name="chevron-down" size={14} weight="regular" />
        </Pressable>
      </View>

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

      <View style={styles.attentionSection}>
        <View style={styles.attentionHeading}>
          <View style={styles.attentionTitle}><PlatformIcon color={theme.accentStrong} name="flag" size={18} /><ThemedText accessibilityRole="header" type="subtitle">Needs attention</ThemedText></View>
          <ThemedText accessibilityLabel={`Top 5 this week, ${thisWeekCount} tasks`} themeColor="textSecondary" type="captionBold">Top 5 this week</ThemedText>
        </View>
        {isLoading && !allTasks.length ? <ThemedText themeColor="textSecondary" type="caption">Loading assigned work…</ThemedText>
          : attentionTasks.length ? attentionTasks.map(renderTask)
            : <ThemedText themeColor="textSecondary" type="caption">Urgent, high-priority, and overdue tasks due this week will appear here.</ThemedText>}
      </View>

      <View style={styles.boardDirectory}>
        <ThemedText accessibilityRole="header" style={styles.boardDirectoryHeading} type="subtitle">Boards</ThemedText>
        {boardsLoading
          ? <SkeletonList count={3} label="Loading Boards" />
          : matchingBoards.length === 0
            ? <EmptyState icon="view-board" title={search ? 'No matching Boards' : 'No Boards yet'} body={search ? 'Try a Project or Board name.' : 'Boards in your Projects will appear here.'} />
          : matchingBoards.map((item) => {
            const unreadCount = item.unreadCount;
            const assignedTaskCount = boardTaskCounts.get(String(item.board._id))?.assignedCount ?? 0;
            const unreadLabel = unreadCount ? `, ${unreadCount} unread notifications` : '';
            const taskLabel = `${assignedTaskCount} assigned ${assignedTaskCount === 1 ? 'task' : 'tasks'}`;
            return <Pressable accessibilityHint={`Opens ${item.board.name} and its tasks`} accessibilityLabel={`${item.board.name} Board, ${item.project.name} Project, ${taskLabel}${unreadLabel}`} accessibilityRole="button" key={item.board._id} onPress={() => onOpenBoard(item)} style={({ pressed }) => [styles.boardRow, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent', borderBottomColor: theme.hairline }]}>
              <View style={styles.boardMarkWrap}>
                <EntityMark colorKey={item.board.markColorKey} iconKey={item.board.markIconKey} id={String(item.board._id)} kind="board" name={item.board.name} size={36} />
                {assignedTaskCount > 0 ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.boardTaskBadge, { backgroundColor: theme.accent, borderColor: theme.homeSurface }]}><ThemedText style={styles.boardTaskCount} themeColor="accentInk" type="captionBold">{assignedTaskCount > 99 ? '99+' : assignedTaskCount}</ThemedText></View> : null}
                {unreadCount > 0 ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.boardUnreadDot, { backgroundColor: theme.accentStrong, borderColor: theme.homeSurface }]} /> : null}
              </View>
              <View style={styles.boardCopy}><ThemedText numberOfLines={1} type="smallBold">{item.board.name}</ThemedText><ThemedText numberOfLines={1} themeColor="textSecondary" type="caption">{item.project.name}</ThemedText></View>
              <View style={[styles.boardArrow, { backgroundColor: theme.homeSurface, borderColor: theme.homeBorder }]}><PlatformIcon color={theme.textSecondary} name="chevron-right" size={16} /></View>
            </Pressable>;
          })}
      </View>

      {hasMoreProjects || isLoadingMoreProjects ? <Pressable accessibilityRole="button" disabled={isLoadingMoreProjects} onPress={onLoadMoreProjects} style={[styles.loadMore, { borderColor: theme.homeBorder }]}>
        <ThemedText themeColor="textSecondary" type="captionBold">{isLoadingMoreProjects ? 'Loading Projects...' : 'Load more Projects'}</ThemedText>
      </Pressable> : null}

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
  content: { gap: Spacing.three },
  globalHeading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  headingCopy: { flex: 1, gap: Spacing.half, minWidth: 0 },
  pageTitle: { flexShrink: 1 },
  companyPill: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.one, height: TouchTarget, justifyContent: 'center', paddingHorizontal: Spacing.one, width: 64 },
  attentionSection: { gap: Spacing.one },
  attentionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 32 },
  attentionTitle: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  searchField: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, minHeight: TouchTarget, paddingHorizontal: Spacing.three, width: '100%' },
  searchInput: { ...Typography.body, flex: 1, minWidth: 0, paddingVertical: Spacing.two },
  searchClear: { alignItems: 'center', borderRadius: Radius.pill, height: 32, justifyContent: 'center', width: 32 },
  compactTaskRow: { borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  compactTaskTitleRow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.small, flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', minHeight: 30 },
  compactTaskArrow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: 28, justifyContent: 'center', width: 28 },
  compactTaskTitle: { flex: 1, minWidth: 0 },
  compactTaskMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  compactProjectPill: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.one, maxWidth: 150, minHeight: 26, paddingHorizontal: Spacing.two },
  compactProjectName: { flexShrink: 1 },
  compactTaskDue: { flexShrink: 1, minWidth: 0 },
  loadMore: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: TouchTarget },
  boardDirectory: { gap: Spacing.one, paddingTop: Spacing.four },
  boardDirectoryHeading: { paddingBottom: Spacing.one },
  boardRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.two, minHeight: 64, paddingHorizontal: Spacing.one, paddingVertical: Spacing.two },
  boardMarkWrap: { height: 38, position: 'relative', width: 38 },
  boardCopy: { flex: 1, gap: 2, minWidth: 0 },
  boardArrow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, height: TouchTarget, justifyContent: 'center', width: TouchTarget },
  boardTaskBadge: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.pill, borderWidth: 1.5, height: 25, justifyContent: 'center', minWidth: 25, paddingHorizontal: 4, position: 'absolute', right: -4, top: -4 },
  boardTaskCount: { ...Typography.captionBold, fontVariant: ['tabular-nums'] },
  boardUnreadDot: { borderRadius: Radius.pill, borderWidth: 1.5, height: 8, position: 'absolute', right: -2, top: 25, width: 8 },
  confirmationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  confirmationSecondary: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.three },
  confirmationPrimary: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.medium, flex: 1, justifyContent: 'center', minHeight: TouchTarget, paddingHorizontal: Spacing.three },
});
