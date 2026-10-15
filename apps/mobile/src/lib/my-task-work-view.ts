import type { TaskPriority } from '@track/shared/tasks';

export type MyTaskViewKey = 'this-week' | 'all' | 'done';

/** Personal Projects are a distinct scope, not a union of Company work. */
export function matchesTaskCompanyScope(companyId: string | null | undefined, selectedCompanyId: string | null) {
  return (companyId ?? null) === selectedCompanyId;
}

export type MyTaskFilters = {
  status: 'any' | 'open' | 'completed' | 'canceled';
  priority: 'any' | TaskPriority;
  dueDate: 'any' | 'today' | 'this-week' | 'overdue' | 'no-date';
};

export type MyTaskWorkItem = {
  task: {
    _id: string;
    title: string;
    priority: TaskPriority;
    dueDate?: string;
    updatedAt?: number;
  };
  state?: { category?: string; name?: string } | null;
  project: { name: string };
  group?: { name: string } | null;
};

export const emptyMyTaskFilters: MyTaskFilters = {
  status: 'any',
  priority: 'any',
  dueDate: 'any',
};

export function uniqueMyTasks<T extends { task: { _id: string } }>(items: readonly (T | null | undefined)[]) {
  const unique = new Map<string, T>();
  for (const item of items) {
    if (item) unique.set(item.task._id, item);
  }
  return [...unique.values()];
}

export function matchesMyTaskSearch(
  item: MyTaskWorkItem,
  query: string,
  boardName = '',
) {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return true;
  const haystack = [
    item.task.title,
    item.project.name,
    item.group?.name,
    boardName,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
  return haystack.includes(search);
}

export function matchesMyTaskFilters(
  item: MyTaskWorkItem,
  filters: MyTaskFilters,
  today: string,
  weekDates: readonly string[],
) {
  const category = item.state?.category;
  const dueDate = item.task.dueDate;
  const statusMatches = filters.status === 'any'
    || (filters.status === 'open' && category !== 'completed' && category !== 'canceled')
    || (filters.status === 'completed' && category === 'completed')
    || (filters.status === 'canceled' && category === 'canceled');
  const priorityMatches = filters.priority === 'any' || item.task.priority === filters.priority;
  const dueDateMatches = filters.dueDate === 'any'
    || (filters.dueDate === 'today' && dueDate === today)
    || (filters.dueDate === 'this-week' && Boolean(dueDate && weekDates.includes(dueDate)))
    || (filters.dueDate === 'overdue' && Boolean(dueDate && dueDate < today && category !== 'completed' && category !== 'canceled'))
    || (filters.dueDate === 'no-date' && !dueDate);
  return statusMatches && priorityMatches && dueDateMatches;
}

export function matchesMyTaskTimeView(
  item: MyTaskWorkItem,
  view: MyTaskViewKey,
  today: string,
  selectedDate: string | null,
  weekDates: readonly string[] = [],
) {
  const category = item.state?.category;
  const dueDate = item.task.dueDate;
  if (selectedDate && dueDate !== selectedDate) return false;
  const open = category !== 'completed' && category !== 'canceled';
  if (view === 'this-week') return open && Boolean(dueDate && dueDate >= today && weekDates.includes(dueDate));
  if (view === 'done') return category === 'completed';
  return true;
}

export function sortMyTasks<T extends MyTaskWorkItem>(items: readonly T[]) {
  const priorityRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
  return [...items].sort((left, right) =>
    priorityRank[left.task.priority] - priorityRank[right.task.priority]
    || (left.task.dueDate ?? '9999-12-31').localeCompare(right.task.dueDate ?? '9999-12-31')
    || (right.task.updatedAt ?? 0) - (left.task.updatedAt ?? 0),
  );
}
