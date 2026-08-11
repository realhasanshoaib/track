import type { TaskActivityAction, TaskPriority, TaskStateCategory } from '@track/shared/tasks';

export type TaskTranslate = (key: string, options?: Record<string, unknown>) => string;
type FormatterLocale = 'en' | 'ar';

const englishLabels: Record<string, string> = {
  'priority.none': 'No priority',
  'priority.urgent': 'Urgent',
  'priority.high': 'High',
  'priority.medium': 'Medium',
  'priority.low': 'Low',
  'task.dueToday': 'Due today',
  'task.overdue': 'Overdue · {{date}}',
  'task.due': 'Due {{date}}',
  'task.activityUnknown': 'Updated the task',
  'task.activityCreated': 'Created this task',
  'task.activityTitleChanged': 'Renamed this task',
  'task.activityDescriptionChanged': 'Updated the description',
  'task.activityStateChanged': 'Changed the status',
  'task.activityAssigneeChanged': 'Changed the assignee',
  'task.activityPriorityChanged': 'Changed the priority',
  'task.activityDueDateChanged': 'Changed the due date',
  'task.activityLabelsChanged': 'Updated the labels',
  'task.activityBoardChanged': 'Moved this task to another board',
  'task.activityScopeChanged': 'Changed the task scope',
  'task.activityCommented': 'Added a comment',
  'task.activityArchived': 'Archived this task',
  'task.activityRestored': 'Restored this task',
};

function label(t: TaskTranslate | undefined, key: string, options?: Record<string, unknown>) {
  if (t) return t(key, options);
  const template = englishLabels[key] ?? key;
  return Object.entries(options ?? {}).reduce(
    (result, [name, value]) => result.replaceAll(`{{${name}}}`, String(value)),
    template,
  );
}

export function taskPriorityLabel(priority: TaskPriority, t?: TaskTranslate) {
  return label(t, `priority.${priority}`);
}

export function taskPriorityGlyph(priority: TaskPriority) {
  if (priority === 'urgent') return '!!!';
  if (priority === 'high') return '!!';
  if (priority === 'medium') return '!';
  if (priority === 'low') return '↓';
  return '—';
}

export function taskStateTone(category?: TaskStateCategory) {
  if (category === 'completed') return 'success';
  if (category === 'canceled') return 'muted';
  if (category === 'started') return 'active';
  if (category === 'backlog') return 'muted';
  return 'neutral';
}

export function localTaskDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function taskDueLabel(
  dueDate?: string,
  today = localTaskDate(),
  category?: TaskStateCategory,
  options?: {
    formatDate?: TaskDateFormatter;
    locale?: string;
    t?: TaskTranslate;
  },
) {
  if (!dueDate) return null;
  if (dueDate === today) return label(options?.t, 'task.dueToday');
  const formatted = formatTaskDate(dueDate, options?.locale, options?.formatDate);
  if (dueDate < today && category !== 'completed' && category !== 'canceled') {
    return label(options?.t, 'task.overdue', { date: formatted });
  }
  return label(options?.t, 'task.due', { date: formatted });
}

export type TaskDateFormatter = (
  locale: FormatterLocale,
  value: Date,
  options?: Intl.DateTimeFormatOptions,
) => string;

export function formatTaskDate(value: string, locale = 'en-US', formatter?: TaskDateFormatter) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatter
    ? formatter(locale as FormatterLocale, parsed, { day: 'numeric', month: 'short' })
    : parsed.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function taskLabelColor(token: string, fallback: string) {
  if (/^#[0-9a-f]{3,8}$/i.test(token) || token.startsWith('rgb')) return token;
  const colors: Record<string, string> = {
    amber: '#d97706',
    blue: '#2563eb',
    green: '#16a34a',
    red: '#dc2626',
    violet: '#7c3aed',
  };
  return colors[token] ?? fallback;
}

const activityKeys: Record<TaskActivityAction, string> = {
  archived: 'task.activityArchived',
  assignee_changed: 'task.activityAssigneeChanged',
  board_changed: 'task.activityBoardChanged',
  commented: 'task.activityCommented',
  created: 'task.activityCreated',
  description_changed: 'task.activityDescriptionChanged',
  due_date_changed: 'task.activityDueDateChanged',
  labels_changed: 'task.activityLabelsChanged',
  priority_changed: 'task.activityPriorityChanged',
  restored: 'task.activityRestored',
  scope_changed: 'task.activityScopeChanged',
  state_changed: 'task.activityStateChanged',
  title_changed: 'task.activityTitleChanged',
};

export function taskActivityLabel(action: TaskActivityAction, t?: TaskTranslate) {
  return label(t, activityKeys[action] ?? 'task.activityUnknown');
}
