import type { BoardColumnView } from '../components/task-board';
import { uniqueTaskViews } from './unique-task-views';

export type PendingBoardMove = { index: number; stateId: string; taskId: string };

/** The optimistic column and card status must describe the same destination. */
export function projectTaskBoard(columns: BoardColumnView[], pending: PendingBoardMove | null) {
  const sorted = columns.map((column) => ({
    ...column,
    tasks: uniqueTaskViews(column.tasks).sort((a, b) => a.task.rank < b.task.rank ? -1 : a.task.rank > b.task.rank ? 1 : 0),
  }));
  const moved = pending && sorted.flatMap((column) => column.tasks)
    .find((item) => item.task._id === pending.taskId);
  if (!pending || !moved || !sorted.some((column) => column.state._id === pending.stateId)) return sorted;
  return sorted.map((column) => {
    const tasks = column.tasks.filter((item) => item.task._id !== pending.taskId);
    if (column.state._id !== pending.stateId) return { ...column, tasks };
    tasks.splice(Math.max(0, Math.min(pending.index, tasks.length)), 0, {
      ...moved,
      state: column.state,
      task: { ...moved.task, workflowStateId: column.state._id },
    });
    return { ...column, tasks };
  });
}
