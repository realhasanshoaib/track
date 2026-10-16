export const taskScopeKinds = ['project', 'channel'] as const
export type TaskScopeKind = (typeof taskScopeKinds)[number]

export const taskStateCategories = [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled',
] as const
export type TaskStateCategory = (typeof taskStateCategories)[number]

export const taskPriorities = ['none', 'urgent', 'high', 'medium', 'low'] as const
export type TaskPriority = (typeof taskPriorities)[number]

export const taskReferenceTypes = [
  'message',
  'attachment',
] as const
export type TaskReferenceType = (typeof taskReferenceTypes)[number]

export const taskReferenceAvailability = ['available', 'unavailable', 'redacted'] as const
export type TaskReferenceAvailability = (typeof taskReferenceAvailability)[number]

export const taskSuggestionStatuses = ['pending', 'accepted', 'linked', 'dismissed'] as const
export type TaskSuggestionStatus = (typeof taskSuggestionStatuses)[number]

export const taskSuggestionDismissalReasons = [
  'not_actionable',
  'duplicate',
  'wrong_details',
  'sensitive',
  'other',
] as const
export type TaskSuggestionDismissalReason =
  (typeof taskSuggestionDismissalReasons)[number]

export const taskFollowerReasons = ['creator', 'assignee', 'commenter', 'explicit'] as const
export type TaskFollowerReason = (typeof taskFollowerReasons)[number]

export const taskNotificationModes = ['important', 'all_followed', 'muted'] as const
export type TaskNotificationMode = (typeof taskNotificationModes)[number]

export const taskReminderKinds = ['due_soon', 'overdue'] as const
export type TaskReminderKind = (typeof taskReminderKinds)[number]

export const taskJobStatuses = ['queued', 'running', 'completed', 'failed', 'canceled'] as const
export type TaskJobStatus = (typeof taskJobStatuses)[number]

export const taskActivityActions = [
  'created',
  'title_changed',
  'description_changed',
  'state_changed',
  'assignee_changed',
  'priority_changed',
  'due_date_changed',
  'labels_changed',
  'board_changed',
  'scope_changed',
  'commented',
  'archived',
  'restored',
] as const
export type TaskActivityAction = (typeof taskActivityActions)[number]

export type TaskCollaborationLevel = 'admin' | 'full' | 'scoped' | 'read_only'

export type TaskPolicyInput = Readonly<{
  collaboration: TaskCollaborationLevel
  activeScope: boolean
  channelMember: boolean
  createdByActor: boolean
  assignedToActor: boolean
}>

export type TaskCapabilities = Readonly<{
  canView: boolean
  canCreate: boolean
  canEdit: boolean
  canAssignOthers: boolean
  canTransfer: boolean
  canManage: boolean
  canChangeScope: boolean
  canArchive: boolean
  canComment: boolean
}>

export function resolveTaskCapabilities(input: TaskPolicyInput): TaskCapabilities {
  const canView = input.channelMember
  const writable = canView && input.activeScope && input.collaboration !== 'read_only'
  const broadEditor = input.collaboration === 'admin' || input.collaboration === 'full'
  const scopedEditor = input.createdByActor || input.assignedToActor

  return {
    canView,
    canCreate: writable,
    canEdit: writable && (broadEditor || scopedEditor),
    canAssignOthers: writable && broadEditor,
    canTransfer: writable && broadEditor,
    canManage: writable && input.collaboration === 'admin',
    canChangeScope: writable && input.collaboration === 'admin',
    canArchive: writable && input.collaboration === 'admin',
    canComment: writable,
  }
}

export function isTerminalTaskState(category: TaskStateCategory) {
  return category === 'completed' || category === 'canceled'
}

const taskDueDatePattern = /^\d{4}-\d{2}-\d{2}$/

export function isTaskDueDate(value: string) {
  if (!taskDueDatePattern.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export type TaskDueState = 'none' | 'upcoming' | 'due_today' | 'overdue'

export function getTaskDueState(
  dueDate: string | null | undefined,
  localDate: string,
  terminal: boolean,
): TaskDueState {
  if (!dueDate || terminal) return 'none'
  if (dueDate < localDate) return 'overdue'
  if (dueDate === localDate) return 'due_today'
  return 'upcoming'
}

export function normalizeTaskText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function isTaskTitle(value: string) {
  const normalized = normalizeTaskText(value)
  return normalized.length > 0 && normalized.length <= 180
}

export function isTaskDescription(value: string) {
  return value.length <= 20_000
}

export function canTransitionTaskSuggestion(
  current: TaskSuggestionStatus,
  next: TaskSuggestionStatus,
) {
  return current === 'pending' && next !== 'pending'
}

export function taskSuggestionFingerprint(input: {
  projectId: string
  groupId?: string
  sourceIds: ReadonlyArray<string>
  title: string
  description?: string
}) {
  return [
    input.projectId,
    input.groupId ?? 'project',
    [...input.sourceIds].sort().join(','),
    normalizeTaskText(input.title).toLocaleLowerCase(),
    normalizeTaskText(input.description ?? '').toLocaleLowerCase(),
  ].join('|')
}
