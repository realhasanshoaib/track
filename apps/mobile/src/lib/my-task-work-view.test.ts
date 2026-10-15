import { describe, expect, it } from 'vitest';

import {
  emptyMyTaskFilters,
  matchesMyTaskFilters,
  matchesMyTaskSearch,
  matchesMyTaskTimeView,
  matchesTaskCompanyScope,
  sortMyTasks,
  uniqueMyTasks,
} from './my-task-work-view';

function item(
  id: string,
  dueDate: string | undefined,
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none' = 'medium',
  category = 'started',
  projectName = 'Atlas',
  channelName?: string,
) {
  return {
    task: { _id: id, title: `Task ${id}`, dueDate, priority, updatedAt: 1 },
    state: { category, name: category },
    project: { name: projectName },
    group: channelName ? { name: channelName } : null,
  } as const;
}

describe('My Tasks work views', () => {
  it('keeps Personal Projects separate from each Company', () => {
    expect(matchesTaskCompanyScope(undefined, null)).toBe(true);
    expect(matchesTaskCompanyScope('company-a', null)).toBe(false);
    expect(matchesTaskCompanyScope(undefined, 'company-a')).toBe(false);
    expect(matchesTaskCompanyScope('company-a', 'company-a')).toBe(true);
    expect(matchesTaskCompanyScope('company-b', 'company-a')).toBe(false);
  });
  const today = '2026-10-01';
  const week = ['2026-09-28', '2026-09-29', '2026-09-30', today, '2026-10-02', '2026-10-03', '2026-10-04'];

  it('shows open tasks due from today through the end of this week', () => {
    expect(matchesMyTaskTimeView(item('overdue', '2026-09-30', 'urgent'), 'this-week', today, null, week)).toBe(false);
    expect(matchesMyTaskTimeView(item('today', today, 'high'), 'this-week', today, null, week)).toBe(true);
    expect(matchesMyTaskTimeView(item('saturday', '2026-10-03', 'low'), 'this-week', today, null, week)).toBe(true);
    expect(matchesMyTaskTimeView(item('next-week', '2026-10-05', 'urgent'), 'this-week', today, null, week)).toBe(false);
    expect(matchesMyTaskTimeView(item('done', today, 'urgent', 'completed'), 'this-week', today, null, week)).toBe(false);
  });

  it('limits Done to completed work and keeps every priority in All', () => {
    expect(matchesMyTaskTimeView(item('low', '2026-10-02', 'low'), 'all', today, null)).toBe(true);
    expect(matchesMyTaskTimeView(item('no-date', undefined, 'urgent'), 'all', today, null)).toBe(true);
    expect(matchesMyTaskTimeView(item('done', today, 'low', 'completed'), 'done', today, null)).toBe(true);
    expect(matchesMyTaskTimeView(item('canceled', today, 'low', 'canceled'), 'done', today, null)).toBe(false);
  });

  it('preserves a selected date as an exact due-date filter in every view', () => {
    expect(matchesMyTaskTimeView(item('selected', '2026-10-03', 'high'), 'this-week', today, '2026-10-03', week)).toBe(true);
    expect(matchesMyTaskTimeView(item('other-day', '2026-10-04', 'high'), 'all', today, '2026-10-03')).toBe(false);
  });

  it('filters status, priority, and due date without changing the base values', () => {
    const filters = { ...emptyMyTaskFilters, status: 'open' as const, priority: 'urgent' as const, dueDate: 'this-week' as const };
    const week = ['2026-09-28', '2026-09-29', '2026-09-30', today, '2026-10-02', '2026-10-03', '2026-10-04'];
    expect(matchesMyTaskFilters(item('match', '2026-10-02', 'urgent'), filters, today, week)).toBe(true);
    expect(matchesMyTaskFilters(item('priority', today, 'high'), filters, today, week)).toBe(false);
    expect(matchesMyTaskFilters(item('completed', today, 'urgent', 'completed'), filters, today, week)).toBe(false);
  });

  it('searches task, Project, Channel, and Board context case-insensitively', () => {
    const row = item('1', today, 'urgent', 'started', 'Atlas', 'release-room');
    expect(matchesMyTaskSearch(row, 'api')).toBe(false);
    expect(matchesMyTaskSearch({ ...row, task: { ...row.task, title: 'Ship API' } }, 'api')).toBe(true);
    expect(matchesMyTaskSearch(row, 'atlas')).toBe(true);
    expect(matchesMyTaskSearch(row, 'release-room')).toBe(true);
    expect(matchesMyTaskSearch(row, 'release', 'Release Board')).toBe(true);
  });

  it('deduplicates by task ID and sorts urgency before date', () => {
    const rows = [item('later', '2026-10-04', 'medium'), item('urgent', '2026-10-05', 'urgent'), item('later', today, 'low')];
    const unique = uniqueMyTasks(rows);
    expect(unique).toHaveLength(2);
    expect(unique[0]?.task.title).toBe('Task later');
    expect(sortMyTasks(unique).map((row) => row.task._id)).toEqual(['urgent', 'later']);
  });
});
