import { v } from 'convex/values'

export const taskScopeKind = v.union(v.literal('project'), v.literal('channel'))
export const taskStateCategory = v.union(
  v.literal('backlog'), v.literal('unstarted'), v.literal('started'),
  v.literal('completed'), v.literal('canceled'),
)
export const taskPriority = v.union(
  v.literal('none'), v.literal('urgent'), v.literal('high'),
  v.literal('medium'), v.literal('low'),
)
export const taskReferenceType = v.union(
  v.literal('message'), v.literal('attachment'),
)
export const taskReferenceAvailability = v.union(
  v.literal('available'), v.literal('unavailable'), v.literal('redacted'),
)
export const taskSuggestionStatus = v.union(
  v.literal('pending'), v.literal('accepted'),
  v.literal('linked'), v.literal('dismissed'),
)
export const taskSuggestionDismissalReason = v.union(
  v.literal('not_actionable'), v.literal('duplicate'),
  v.literal('wrong_details'), v.literal('sensitive'), v.literal('other'),
)
export const taskFollowerReason = v.union(
  v.literal('creator'), v.literal('assignee'),
  v.literal('commenter'), v.literal('explicit'),
)
export const taskNotificationMode = v.union(
  v.literal('important'), v.literal('all_followed'), v.literal('muted'),
)
export const taskActivityAction = v.union(
  v.literal('created'), v.literal('title_changed'),
  v.literal('description_changed'), v.literal('state_changed'),
  v.literal('assignee_changed'), v.literal('priority_changed'),
  v.literal('due_date_changed'), v.literal('labels_changed'),
  v.literal('board_changed'), v.literal('scope_changed'),
  v.literal('commented'), v.literal('archived'), v.literal('restored'),
)
export const taskJobStatus = v.union(
  v.literal('queued'), v.literal('running'), v.literal('completed'),
  v.literal('failed'), v.literal('canceled'),
)
