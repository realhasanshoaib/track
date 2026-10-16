import type {
  TaskActivityAction,
  TaskPriority,
  TaskReferenceAvailability,
  TaskReferenceType,
  TaskStateCategory,
} from '@track/shared/tasks';

const referenceLabels: Record<TaskReferenceType, string> = {
  attachment: 'Attachment',
  message: 'Conversation message',
};

export function taskReferenceLabel(type: TaskReferenceType) {
  return referenceLabels[type];
}

/** Explains why a reference cannot be opened, or returns null when it can. */
export function taskReferenceBlockedReason(
  availability: TaskReferenceAvailability,
  hasDestination: boolean,
) {
  if (availability === 'redacted') return 'Redacted — this evidence was removed from the conversation.';
  if (availability === 'unavailable') return 'Unavailable — the source conversation is out of your access.';
  if (!hasDestination) return 'This evidence has no conversation to open.';
  return null;
}

export function taskPriorityLabel(priority: TaskPriority) {
  if (priority === 'none') return 'No priority';
  return priority[0].toUpperCase() + priority.slice(1);
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
) {
  if (!dueDate) return null;
  if (dueDate === today) return 'Due today';
  if (dueDate < today && category !== 'completed' && category !== 'canceled') {
    return `Overdue · ${formatTaskDate(dueDate)}`;
  }
  return `Due ${formatTaskDate(dueDate)}`;
}

export function formatTaskDate(value: string) {
  const parsed = parseTaskDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Renders a stored date as a weekday-anchored day, such as “Fri, 7 Aug”. */
export function formatTaskDateLong(value: string) {
  const parsed = parseTaskDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', weekday: 'short' });
}

export function parseTaskDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Whole days from `today` to `dueDate`; negative when the date has passed. */
export function taskDueDays(dueDate: string, today = localTaskDate()) {
  const due = parseTaskDate(dueDate);
  const start = parseTaskDate(today);
  if (!due || !start) return null;
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

export function taskDateFromOffset(days: number, from = new Date()) {
  const target = new Date(from);
  target.setDate(target.getDate() + days);
  return localTaskDate(target);
}

/**
 * The human reading of a due date. Stored dates stay `YYYY-MM-DD`; people see
 * “Today”, “Tomorrow”, “Fri, 7 Aug”, or how far a task has slipped.
 */
export function taskDueDisplay(
  dueDate: string | undefined | null,
  today = localTaskDate(),
  category?: TaskStateCategory,
) {
  if (!dueDate) return null;
  const days = taskDueDays(dueDate, today);
  if (days === null) return { label: dueDate, overdue: false };
  const terminal = category === 'completed' || category === 'canceled';
  if (days < 0 && !terminal) {
    const elapsed = Math.abs(days);
    return { label: `Overdue · ${elapsed} day${elapsed === 1 ? '' : 's'}`, overdue: true };
  }
  if (days === 0) return { label: 'Today', overdue: false };
  if (days === 1) return { label: 'Tomorrow', overdue: false };
  if (days === -1) return { label: 'Yesterday', overdue: false };
  return { label: formatTaskDateLong(dueDate), overdue: false };
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

const activityLabels: Record<TaskActivityAction, string> = {
  archived: 'Archived this task',
  assignee_changed: 'Changed the assignee',
  board_changed: 'Moved this task to another board',
  commented: 'Added a comment',
  created: 'Created this task',
  description_changed: 'Updated the description',
  due_date_changed: 'Changed the due date',
  labels_changed: 'Updated the labels',
  priority_changed: 'Changed the priority',
  restored: 'Restored this task',
  scope_changed: 'Changed the task scope',
  state_changed: 'Changed the status',
  title_changed: 'Renamed this task',
};

export function taskActivityLabel(action: TaskActivityAction) {
  return activityLabels[action] ?? action.replaceAll('_', ' ');
}

/**
 * "T-AYWHR69F" → "T-AYW…". Full identifiers are noise in a list; the detail
 * screen offers the whole key through its copy affordance.
 */
export function shortTaskKey(publicKey: string) {
  const separator = publicKey.indexOf('-');
  const code = separator === -1 ? publicKey : publicKey.slice(separator + 1);
  if (code.length <= 3) return publicKey;
  const prefix = separator === -1 ? '' : publicKey.slice(0, separator + 1);
  return `${prefix}${code.slice(0, 3)}…`;
}
