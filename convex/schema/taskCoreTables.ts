import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import {
  taskActivityAction,
  taskFollowerReason,
  taskNotificationMode,
  taskPriority,
  taskReferenceAvailability,
  taskReferenceType,
  taskStateCategory,
} from './taskValidators'

export const taskCoreTables = {
  taskBoards: defineTable({
    projectId: v.id('projects'),
    groupId: v.optional(v.id('groups')),
    name: v.string(),
    description: v.optional(v.string()),
    rank: v.optional(v.string()),
    isDefault: v.boolean(),
    createdByProjectMemberId: v.id('projectMembers'),
    actingCompanyId: v.optional(v.id('companies')),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_archived', ['projectId', 'archivedAt'])
    .index('by_scope_archived', ['projectId', 'groupId', 'archivedAt'])
    .index('by_scope_default', ['projectId', 'groupId', 'isDefault']),

  taskWorkflowStates: defineTable({
    projectId: v.id('projects'),
    boardId: v.id('taskBoards'),
    name: v.string(),
    category: taskStateCategory,
    visualToken: v.string(),
    rank: v.string(),
    isDefault: v.boolean(),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_board_rank', ['boardId', 'rank'])
    .index('by_board_default', ['boardId', 'isDefault'])
    .index('by_project_category', ['projectId', 'category']),

  tasks: defineTable({
    projectId: v.id('projects'),
    publicKey: v.string(),
    boardId: v.id('taskBoards'),
    groupId: v.optional(v.id('groups')),
    parentTaskId: v.optional(v.id('tasks')),
    workflowStateId: v.id('taskWorkflowStates'),
    rank: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    searchText: v.string(),
    assigneeProjectMemberId: v.optional(v.id('projectMembers')),
    priority: taskPriority,
    dueDate: v.optional(v.string()),
    createdByProjectMemberId: v.id('projectMembers'),
    actingCompanyId: v.optional(v.id('companies')),
    revision: v.number(),
    terminalAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    sourceSuggestionId: v.optional(v.id('taskSuggestions')),
    createIdempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_key', ['projectId', 'publicKey'])
    .index('by_project_archived', ['projectId', 'archivedAt'])
    .index('by_project_scope_archived', ['projectId', 'groupId', 'archivedAt'])
    .index('by_board', ['boardId'])
    .index('by_board_archived', ['boardId', 'archivedAt'])
    .index('by_board_archived_rank', ['boardId', 'archivedAt', 'rank'])
    .index('by_board_state_rank', ['boardId', 'workflowStateId', 'rank'])
    .index('by_board_state_archived_rank', ['boardId', 'workflowStateId', 'archivedAt', 'rank'])
    .index('by_assignee_archived', ['assigneeProjectMemberId', 'archivedAt'])
    .index('by_parent', ['parentTaskId'])
    .index('by_parent_rank', ['parentTaskId', 'rank'])
    .index('by_project_idempotency', ['projectId', 'createIdempotencyKey'])
    .searchIndex('search_tasks', {
      searchField: 'searchText',
      filterFields: ['projectId', 'groupId', 'archivedAt'],
    }),

  taskLabels: defineTable({
    projectId: v.id('projects'),
    name: v.string(),
    colorToken: v.string(),
    archivedAt: v.optional(v.number()),
    createdByProjectMemberId: v.id('projectMembers'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_archived', ['projectId', 'archivedAt'])
    .index('by_project_name', ['projectId', 'name']),

  taskLabelLinks: defineTable({
    projectId: v.id('projects'),
    taskId: v.id('tasks'),
    labelId: v.id('taskLabels'),
    createdAt: v.number(),
  })
    .index('by_task', ['taskId'])
    .index('by_project_created_at', ['projectId', 'createdAt'])
    .index('by_label', ['labelId'])
    .index('by_task_label', ['taskId', 'labelId']),

  taskReferences: defineTable({
    projectId: v.id('projects'),
    taskId: v.id('tasks'),
    type: taskReferenceType,
    groupId: v.optional(v.id('groups')),
    channelThreadId: v.optional(v.id('channelThreads')),
    messageId: v.optional(v.id('messages')),
    attachmentId: v.optional(v.id('attachments')),
    quote: v.optional(v.string()),
    availability: taskReferenceAvailability,
    isPrimary: v.boolean(),
    actorProjectMemberId: v.id('projectMembers'),
    actingCompanyId: v.optional(v.id('companies')),
    rank: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_task_rank', ['taskId', 'rank'])
    .index('by_project_created_at', ['projectId', 'createdAt'])
    .index('by_message', ['messageId'])
    .index('by_attachment', ['attachmentId']),

  taskComments: defineTable({
    projectId: v.id('projects'),
    taskId: v.id('tasks'),
    originalGroupId: v.optional(v.id('groups')),
    authorProjectMemberId: v.id('projectMembers'),
    actingCompanyId: v.optional(v.id('companies')),
    body: v.string(),
    mentionedProjectMemberIds: v.array(v.id('projectMembers')),
    revision: v.number(),
    archivedAt: v.optional(v.number()),
    idempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_task_created_at', ['taskId', 'createdAt'])
    .index('by_project_created_at', ['projectId', 'createdAt'])
    .index('by_task_idempotency', ['taskId', 'idempotencyKey']),

  taskFollowers: defineTable({
    projectId: v.id('projects'),
    taskId: v.id('tasks'),
    userId: v.id('users'),
    projectMemberId: v.id('projectMembers'),
    reason: taskFollowerReason,
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_task_member', ['taskId', 'projectMemberId'])
    .index('by_member_enabled', ['projectMemberId', 'enabled'])
    .index('by_task_enabled', ['taskId', 'enabled']),

  taskActivities: defineTable({
    projectId: v.id('projects'),
    taskId: v.id('tasks'),
    originalGroupId: v.optional(v.id('groups')),
    actorProjectMemberId: v.optional(v.id('projectMembers')),
    actingCompanyId: v.optional(v.id('companies')),
    action: taskActivityAction,
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    correlationId: v.string(),
    createdAt: v.number(),
  })
    .index('by_task_created_at', ['taskId', 'createdAt'])
    .index('by_project_created_at', ['projectId', 'createdAt']),

  taskNotificationSettings: defineTable({
    projectId: v.id('projects'),
    projectMemberId: v.id('projectMembers'),
    mode: taskNotificationMode,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_member', ['projectMemberId'])
    .index('by_project', ['projectId']),

  taskNotifications: defineTable({
    projectId: v.id('projects'),
    taskId: v.id('tasks'),
    recipientProjectMemberId: v.id('projectMembers'),
    recipientUserId: v.id('users'),
    originalGroupId: v.optional(v.id('groups')),
    eventType: v.string(),
    payload: v.any(),
    readAt: v.optional(v.number()),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  })
    .index('by_member_read', ['recipientProjectMemberId', 'readAt'])
    .index('by_member_created_at', ['recipientProjectMemberId', 'createdAt'])
    .index('by_member_idempotency', ['recipientProjectMemberId', 'idempotencyKey'])
    .index('by_project', ['projectId']),

  taskReminderJobs: defineTable({
    projectId: v.id('projects'),
    taskId: v.id('tasks'),
    recipientProjectMemberId: v.id('projectMembers'),
    recipientUserId: v.id('users'),
    kind: v.union(v.literal('due_soon'), v.literal('overdue')),
    dueDate: v.string(),
    scheduledJobId: v.optional(v.id('_scheduled_functions')),
    status: v.union(v.literal('scheduled'), v.literal('delivered'), v.literal('canceled')),
    idempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_task_status', ['taskId', 'status'])
    .index('by_member_status', ['recipientProjectMemberId', 'status'])
    .index('by_project', ['projectId']),
} as const
