import { FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { PlatformIcon } from '@/components/platform-icon';
import { TaskBoard, type BoardColumnView, type TaskMoveInput } from '@/components/task-board';
import type {
  MobileBoardView,
  MobileSuggestionView,
  MobileTaskView,
} from '@/components/task-detail-types';
import { TaskAction, TaskCard } from '@/components/task-ui';
import { ScreenLoading } from '@/components/screen-loading';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shortTaskKey } from '@/lib/task-presentation';
import { uniqueTaskViews } from '@/lib/unique-task-views';

export type { MobileBoardView, MobileSuggestionView, MobileTaskView };

export function TaskCollection({
  activeBoardStateId,
  assigneeName,
  bottomPadding,
  columns,
  focusedTaskId,
  listHeader,
  loadMore,
  loadingMore,
  onActiveBoardStateChange,
  onCreate,
  onMove,
  onOpen,
  onStatusPress,
  onViewAll,
  readOnly,
  selectedBoard,
  tab,
  tasks,
}: {
  activeBoardStateId?: string;
  assigneeName: (item: MobileTaskView) => string | undefined;
  bottomPadding?: number;
  columns: BoardColumnView[];
  focusedTaskId?: string;
  listHeader?: React.ReactElement | null;
  loadMore?: () => void;
  loadingMore?: boolean;
  onActiveBoardStateChange?: (stateId: string) => void;
  onCreate: () => void;
  onMove: (input: TaskMoveInput) => Promise<void>;
  onOpen: (item: MobileTaskView) => void;
  onStatusPress: (item: MobileTaskView) => void;
  onViewAll: () => void;
  readOnly: boolean;
  selectedBoard?: MobileBoardView;
  tab: 'board' | 'my' | 'all';
  tasks?: MobileTaskView[];
}) {
  if (tasks === undefined) return <ScreenLoading compact variant="tasks" />;
  if (!selectedBoard && tab === 'board') {
    return (
      <TaskEmptyState
        body="Add a task to start tracking work on this board."
        buttonLabel={readOnly ? undefined : 'Create task'}
        icon="view-board"
        onPress={onCreate}
        title="No board yet"
      />
    );
  }
  if (!tasks.length && tab === 'board') {
    return (
      <>
        <TaskEmptyState
          body="Create a task or turn a conversation into action."
          buttonLabel={readOnly ? undefined : 'Create task'}
          icon="check-box-outline"
          onPress={onCreate}
          title="No tasks yet"
        />
        <TaskLoadMore loadMore={loadMore} loading={loadingMore} />
      </>
    );
  }

  if (tab === 'board') {
    return (
      <>
        <TaskBoard
          activeStateId={activeBoardStateId}
          assigneeName={assigneeName}
          columns={columns}
          focusedTaskId={focusedTaskId}
          onActiveStateChange={onActiveBoardStateChange}
          onMove={onMove}
          onOpen={onOpen}
          readOnly={readOnly}
          states={selectedBoard?.states ?? []}
        />
        <TaskLoadMore loadMore={loadMore} loading={loadingMore} />
      </>
    );
  }

  const visibleTasks = uniqueTaskViews(tasks);
  const renderTask: ListRenderItem<MobileTaskView> = ({ item }) => (
    <TaskCard
      assignee={assigneeName(item)}
      category={item.state?.category}
      dueDate={item.task.dueDate}
      evidence={false}
      onPress={() => onOpen(item)}
      onStatusPress={readOnly ? undefined : () => onStatusPress(item)}
      priority={item.task.priority}
      publicKey={item.task.publicKey}
      stateName={item.state?.name ?? 'Unknown'}
      title={item.task.title}
    />
  );

  return (
    <FlatList
      contentContainerStyle={[styles.list, bottomPadding !== undefined && { paddingBottom: bottomPadding }]}
      data={visibleTasks}
      keyExtractor={(item) => item.task._id}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={(
        <TaskEmptyState
          body={tab === 'my' ? 'Tasks assigned to you will appear here.' : 'Create a task or turn a conversation into action.'}
          buttonLabel={tab === 'my' ? 'View all tasks' : readOnly ? undefined : 'Create task'}
          icon="check-box-outline"
          onPress={tab === 'my' ? onViewAll : onCreate}
          title={tab === 'my' ? 'Nothing assigned to you' : 'No tasks yet'}
        />
      )}
      ListFooterComponent={<TaskLoadMore loadMore={loadMore} loading={loadingMore} />}
      ListHeaderComponent={listHeader}
      renderItem={renderTask}
      showsVerticalScrollIndicator={false}
      windowSize={9}
    />
  );
}

function TaskLoadMore({ loadMore, loading }: { loadMore?: () => void; loading?: boolean }) {
  if (!loadMore && !loading) return null;
  return <TaskAction disabled={loading} label={loading ? 'Loading more…' : 'Load more tasks'} onPress={() => loadMore?.()} />;
}

export function SuggestionInbox({
  focusedSuggestionId,
  onAccept,
  onDismiss,
  onHide,
  onLink,
  readOnly,
  suggestions,
}: {
  focusedSuggestionId?: string;
  onAccept: (row: MobileSuggestionView) => void;
  onDismiss: (row: MobileSuggestionView) => void;
  onHide: (row: MobileSuggestionView) => void;
  onLink: (row: MobileSuggestionView) => void;
  readOnly: boolean;
  suggestions?: MobileSuggestionView[];
}) {
  const theme = useTheme();
  if (readOnly) {
    return (
      <EmptyState
        body="Suggestions are active-work decisions and are not available in an exit archive."
        icon="shield-lock-outline"
        title="No archived Inbox"
      />
    );
  }
  if (suggestions === undefined) return <ScreenLoading compact variant="inbox" />;
  if (!suggestions.length) {
    return (
      <EmptyState
        body="Grounded suggestions from accessible conversation will appear here."
        icon="inbox"
        title="Inbox is clear"
      />
    );
  }

  return (
    <View style={styles.list}>
      {suggestions.map((row) => (
        <View
          key={row.suggestion._id}
          style={[styles.suggestion, row.suggestion._id === focusedSuggestionId && { borderColor: theme.accent }, {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.hairline,
          }]}>
          <View style={styles.eyebrow}>
            <PlatformIcon color={theme.textSecondary} name="message" size={16} />
            <ThemedText themeColor="textSecondary" type="caption">From conversation</ThemedText>
            <View style={styles.spacer} />
            <ConfidenceMeter value={row.suggestion.confidence} />
          </View>
          <ThemedText type="subtitle">{row.suggestion.proposedTitle}</ThemedText>
          {row.suggestion.proposedDescription ? (
            <ThemedText numberOfLines={3} themeColor="textSecondary" type="small">
              {row.suggestion.proposedDescription}
            </ThemedText>
          ) : null}
          {row.references.map((reference) => (
            <View
              key={reference._id}
              style={[styles.quote, { backgroundColor: theme.accentSoft, borderLeftColor: theme.accent }]}>
              <ThemedText numberOfLines={3} type="small">
                {reference.quote ?? 'Reference unavailable'}
              </ThemedText>
            </View>
          ))}
          {row.proposedAssignee ? (
            <ThemedText themeColor="textSecondary" type="caption">
              Proposed for {row.proposedAssignee.user.displayName}
              {row.proposedAssignee.company ? ` · ${row.proposedAssignee.company.displayName}` : ''}
            </ThemedText>
          ) : null}
          {row.possibleDuplicateTask ? (
            <View style={[styles.duplicate, { backgroundColor: theme.backgroundSelected }]}>
              <PlatformIcon color={theme.textSecondary} name="content-copy" size={16} />
              <ThemedText numberOfLines={2} type="caption">
                Possible duplicate of {shortTaskKey(row.possibleDuplicateTask.publicKey)} · {row.possibleDuplicateTask.title}
              </ThemedText>
            </View>
          ) : null}
          <View style={styles.actions}>
            <TaskAction
              label={row.possibleDuplicateTask ? 'Create separately' : 'Accept'}
              onPress={() => onAccept(row)}
              primary
            />
            {row.possibleDuplicateTask ? <TaskAction label="Add reference" onPress={() => onLink(row)} /> : null}
            {row.canDismiss ? <TaskAction label="Dismiss" onPress={() => onDismiss(row)} /> : null}
            <TaskAction label="Hide" onPress={() => onHide(row)} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Confidence reads as a filled track, not a number people must interpret alone. */
function ConfidenceMeter({ value }: { value: number }) {
  const theme = useTheme();
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <View accessibilityLabel={`${percent} percent confidence`} style={styles.meter}>
      <View style={[styles.meterTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.meterFill, { backgroundColor: theme.accent, width: `${percent}%` }]} />
      </View>
      <ThemedText themeColor="textSecondary" type="captionBold">{percent}%</ThemedText>
    </View>
  );
}

function TaskEmptyState({
  body,
  buttonLabel,
  icon,
  onPress,
  title,
}: {
  body: string;
  buttonLabel?: string;
  icon: React.ComponentProps<typeof PlatformIcon>['name'];
  onPress: () => void;
  title: string;
}) {
  return (
    <View style={styles.empty}>
      <EmptyState body={body} icon={icon} title={title} />
      {buttonLabel ? <TaskAction label={buttonLabel} onPress={onPress} primary /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  duplicate: {
    alignItems: 'center',
    borderRadius: Radius.medium,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  empty: { alignSelf: 'center', gap: Spacing.three, maxWidth: 360, paddingTop: Spacing.six, width: '100%' },
  eyebrow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  list: { gap: Spacing.three, paddingBottom: Spacing.four },
  meter: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  meterFill: { height: '100%' },
  meterTrack: { borderRadius: Radius.pill, height: 4, overflow: 'hidden', width: 44 },
  quote: {
    borderLeftWidth: 3,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  spacer: { flex: 1 },
  suggestion: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
