import { describe, expect, it } from 'vitest';
import type { BoardColumnView } from '../components/task-board';
import { projectTaskBoard } from './task-board-projection';

function fixture(): BoardColumnView[] {
  // Only fields used by the projection are needed; rendering is verified separately.
  return [
    { state: { _id: 'todo', name: 'To do' }, tasks: [{ task: { _id: 'first', rank: 'a', workflowStateId: 'todo' }, state: { _id: 'todo', name: 'To do' } }] },
    { state: { _id: 'done', name: 'Completed' }, tasks: [{ task: { _id: 'second', rank: 'b', workflowStateId: 'done' }, state: { _id: 'done', name: 'Completed' } }] },
  ] as unknown as BoardColumnView[];
}

describe('optimistic task-board projection', () => {
  it('moves one card and updates its status without mutating saved data', () => {
    const saved = fixture();
    const projected = projectTaskBoard(saved, { taskId: 'first', stateId: 'done', index: 0 });
    expect(projected[0].tasks).toEqual([]);
    expect(projected[1].tasks.map((item) => item.task._id)).toEqual(['first', 'second']);
    expect(projected[1].tasks[0].state?.name).toBe('Completed');
    expect(projected[1].tasks[0].task.workflowStateId).toBe('done');
    expect(saved[0].tasks[0].task.workflowStateId).toBe('todo');
    expect(projectTaskBoard(saved, null)).toEqual(saved);
  });
  it('keeps the saved card visible when its destination disappears', () => {
    const saved = fixture();
    expect(projectTaskBoard(saved, { taskId: 'first', stateId: 'removed', index: 0 })).toEqual(saved);
  });
  it('clamps insertion and removes duplicate joined rows', () => {
    const saved = fixture();
    saved[0].tasks.push(saved[0].tasks[0]);
    const projected = projectTaskBoard(saved, { taskId: 'first', stateId: 'done', index: 100 });
    expect(projected[1].tasks.map((item) => item.task._id)).toEqual(['second', 'first']);
  });
  it('preserves the saved board when a pending task was deleted by another client', () => {
    const saved = fixture();
    expect(projectTaskBoard(saved, { taskId: 'removed', stateId: 'done', index: 0 })).toEqual(saved);
  });
  it('reorders within a status without duplicating or changing any saved card', () => {
    const saved = fixture();
    const second = saved[1].tasks[0];
    saved[0].tasks.push({ ...second, state: saved[0].state, task: { ...second.task, workflowStateId: saved[0].state._id } });
    saved[1].tasks = [];
    const projected = projectTaskBoard(saved, { taskId: 'first', stateId: 'todo', index: 1 });
    expect(projected[0].tasks.map((item) => item.task._id)).toEqual(['second', 'first']);
    expect(saved[0].tasks.map((item) => item.task._id)).toEqual(['first', 'second']);
    expect(projected[0].tasks.every((item) => item.task.workflowStateId === 'todo')).toBe(true);
  });
});
