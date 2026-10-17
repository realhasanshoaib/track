import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useRouter } from 'expo-router';
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { TaskAction, TaskStatusPill } from '@/components/task-ui';
import { OptionsSheet, SheetNote, SheetRow, SheetSection } from '@/components/options-sheet';
import { PlatformIcon } from '@/components/platform-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { taskDetailHref, type MobileTaskIdentity } from '@/lib/task-navigation';
import { shortTaskKey } from '@/lib/task-presentation';
import { useTaskLinkBatch } from '@/lib/task-link-context';
import { uniqueTaskViews } from '@/lib/unique-task-views';
import { taskErrorMessage } from '@/lib/user-facing-error';

type LinkedTask = FunctionReturnType<typeof api.tasks.listForMessages>[number]['tasks'][number];
type BoardState = FunctionReturnType<typeof api.taskBoards.list>[number]['states'][number];

/** Matches the avatar column MessageBubble reserves, so cards line up with bubbles. */
const GUTTER = 40;

type Props = {
  assistantStreamId?: Id<'assistantStreams'>;
  identity: MobileTaskIdentity | null;
  isOwnMessage?: boolean;
  messageId?: Id<'messages'>;
  /**
   * Reports whether the message or answer carries cards, so the screen can break
   * the author group after an interruption. Keyed by the message or stream id,
   * which is also the row key the thread list uses.
   */
  onCardsChange?: (rowId: string, hasCards: boolean) => void;
  projectId: Id<'projects'>;
  readOnly?: boolean;
};

export const TaskInlineCards = memo(function TaskInlineCards({
  assistantStreamId,
  identity,
  isOwnMessage,
  messageId,
  onCardsChange,
  projectId,
  readOnly = false,
}: Props) {
  const theme = useTheme();
  const router = useRouter();
  const batch = useTaskLinkBatch();
  const queryIdentity = identity ? {
    actingCompanyId: identity.companyId,
    projectMemberId: identity.membershipId,
  } : {};
  const messageTasks = useQuery(
    api.tasks.listForMessage,
    messageId && !batch ? { messageId, ...queryIdentity } : 'skip',
  );
  const assistantTasks = useQuery(
    api.tasks.listForAssistant,
    assistantStreamId && !batch ? { assistantStreamId, ...queryIdentity } : 'skip',
  );
  const tasks = messageId
    ? batch?.messageTasks.get(String(messageId)) ?? messageTasks
    : batch?.assistantTasks.get(String(assistantStreamId)) ?? assistantTasks;
  const hasCards = Boolean(tasks?.length);
  const rowId = messageId ?? assistantStreamId;
  const canChangeStatus = !readOnly && !identity?.archived;
  const boards = useQuery(api.taskBoards.list, hasCards && canChangeStatus ? {
    projectId,
    ...queryIdentity,
  } : 'skip');
  const moveTask = useMutation(api.tasks.moveTask);
  const [statusTarget, setStatusTarget] = useState<{ task: LinkedTask['task']; states: BoardState[] } | null>(null);
  const [statusError, setStatusError] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmState, setConfirmState] = useState<BoardState | null>(null);

  useEffect(() => {
    if (rowId) onCardsChange?.(rowId, hasCards);
  }, [hasCards, onCardsChange, rowId]);

  if (!tasks?.length) return null;
  const visibleTasks = uniqueTaskViews(tasks);

  function openStatusPicker(item: LinkedTask) {
    setStatusError('');
    setConfirmState(null);
    const board = boards?.find((candidate) => candidate.board._id === item.task.boardId);
    setStatusTarget({ task: item.task, states: board?.states ?? [] });
    if (!board && boards !== undefined) setStatusError('Task statuses are unavailable right now.');
  }

  const activeBoardStates = statusTarget
    ? boards?.find((candidate) => candidate.board._id === statusTarget.task.boardId)?.states ?? statusTarget.states
    : [];

  async function changeStatus(state: BoardState, confirmOpenSubtasks = false) {
    const target = statusTarget;
    if (!target || statusBusy) return;
    if (state._id === target.task.workflowStateId) {
      setStatusTarget(null);
      return;
    }
    setStatusBusy(true);
    setStatusError('');
    setConfirmState(null);
    try {
      await moveTask({
        taskId: target.task._id,
        workflowStateId: state._id,
        expectedRevision: target.task.revision,
        ...(confirmOpenSubtasks ? { confirmOpenSubtasks: true } : {}),
        ...queryIdentity,
      });
      hapticMedium();
      setStatusTarget(null);
    } catch (failure) {
      const failureCode = failure instanceof Error ? failure.message : '';
      if (failureCode.includes('task_open_subtasks_confirmation_required')) {
        setConfirmState(state);
      } else {
        setStatusError(taskErrorMessage(failure, 'The task status could not be changed. Check your connection and try again.'));
      }
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <View style={[styles.row, isOwnMessage ? styles.rowOwn : styles.rowOther]}>
      {isOwnMessage ? null : <View style={styles.gutter} />}
      <View style={styles.stack}>
        {visibleTasks.map((item) => {
          const status = item.state?.name ?? 'Unknown status';
          return (
            <View key={item.task._id} style={[styles.card, { backgroundColor: theme.backgroundElevated, borderColor: theme.hairline }]}>
              <View style={styles.sourceLabel}>
                <PlatformIcon color={theme.accentStrong} name="link" size={13} />
                <ThemedText numberOfLines={1} style={styles.sourceLabelText} themeColor="accentStrong" type="captionBold">Created from this message</ThemedText>
              </View>
              <View style={styles.header}>
                <Pressable
                  accessibilityHint="Opens the task"
                  accessibilityLabel={`Task ${item.task.publicKey}, ${status}, ${item.task.title}`}
                  accessibilityRole="button"
                  android_ripple={{ color: theme.backgroundSelected }}
                  onPress={() => {
                    hapticLight();
                    router.push(taskDetailHref(projectId, item.task.publicKey, identity));
                  }}
                  style={styles.openTask}>
                  <ThemedText numberOfLines={1} style={styles.key} themeColor="textSecondary" type="mono">
                    {shortTaskKey(item.task.publicKey)}
                  </ThemedText>
                </Pressable>
                <TaskStatusPill category={item.state?.category} label={status} onPress={canChangeStatus ? () => openStatusPicker(item) : undefined} />
              </View>
              <Pressable
                accessibilityHint="Opens the task"
                accessibilityLabel={`${item.task.title}, ${status}`}
                accessibilityRole="button"
                android_ripple={{ color: theme.backgroundSelected }}
                onPress={() => {
                  hapticLight();
                  router.push(taskDetailHref(projectId, item.task.publicKey, identity));
                }}
                style={styles.openTask}>
                <ThemedText numberOfLines={2} style={styles.taskTitle} type="small">{item.task.title}</ThemedText>
                <PlatformIcon color={theme.textTertiary} name="chevron-right" size={15} />
              </Pressable>
            </View>
          );
        })}
      </View>
      <OptionsSheet
        onClose={() => { setStatusTarget(null); setStatusError(''); setConfirmState(null); }}
        title="Change status"
        visible={Boolean(statusTarget)}>
        {statusTarget ? <SheetNote>{statusTarget.task.title}</SheetNote> : null}
        {activeBoardStates.length ? (
          <SheetSection title="Status">
            {activeBoardStates.map((state) => <SheetRow
              disabled={statusBusy}
              icon={state.category === 'completed' ? 'check-circle' : 'circle-outline'}
              key={state._id}
              label={state.name}
              loading={statusBusy && state._id === confirmState?._id}
              onPress={() => void changeStatus(state)}
              selected={state._id === statusTarget?.task.workflowStateId}
            />)}
          </SheetSection>
        ) : statusTarget ? <SheetNote state={statusError ? 'error' : undefined}>{statusError || (boards === undefined ? 'Loading statuses…' : 'No active statuses are available for this task.')}</SheetNote> : null}
        {statusError && activeBoardStates.length ? <SheetNote state="error">{statusError}</SheetNote> : null}
        {confirmState ? (
          <>
            <SheetNote state="error">This task has open checklist items. Complete it anyway?</SheetNote>
            <TaskAction disabled={statusBusy} label={statusBusy ? 'Updating…' : 'Complete anyway'} onPress={() => void changeStatus(confirmState, true)} primary />
          </>
        ) : null}
      </OptionsSheet>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  gutter: {
    width: GUTTER,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  openTask: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: Spacing.two, minHeight: 36, minWidth: 0 },
  key: {
    flexShrink: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  stack: {
    flexShrink: 1,
    gap: Spacing.one,
    maxWidth: '84%',
  },
  sourceLabel: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  sourceLabelText: { flexShrink: 1 },
  taskTitle: { flex: 1, minWidth: 0 },
});
