import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import {
  taskJobStatus,
  taskPriority,
  taskReferenceAvailability,
  taskReferenceType,
  taskSuggestionDismissalReason,
  taskSuggestionStatus,
} from './taskValidators'

export const taskAutomationTables = {
  taskSuggestions: defineTable({
    projectId: v.id('projects'),
    groupId: v.optional(v.id('groups')),
    proposedTitle: v.string(),
    proposedDescription: v.optional(v.string()),
    proposedAssigneeProjectMemberId: v.optional(v.id('projectMembers')),
    proposedPriority: taskPriority,
    proposedDueDate: v.optional(v.string()),
    status: taskSuggestionStatus,
    confidence: v.number(),
    groundingReason: v.string(),
    fingerprint: v.string(),
    possibleDuplicateTaskId: v.optional(v.id('tasks')),
    decidedByProjectMemberId: v.optional(v.id('projectMembers')),
    decisionActingCompanyId: v.optional(v.id('companies')),
    dismissalReason: v.optional(taskSuggestionDismissalReason),
    decidedTaskId: v.optional(v.id('tasks')),
    duplicateOverride: v.optional(v.boolean()),
    decisionIdempotencyKey: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    modelVersion: v.string(),
    promptVersion: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index('by_project_status', ['projectId', 'status', 'archivedAt'])
    .index('by_scope_status', ['projectId', 'groupId', 'status', 'archivedAt'])
    .index('by_project_fingerprint', ['projectId', 'fingerprint'])
    .index('by_decision_idempotency', ['projectId', 'decisionIdempotencyKey']),

  taskSuggestionReferences: defineTable({
    projectId: v.id('projects'),
    suggestionId: v.id('taskSuggestions'),
    type: taskReferenceType,
    groupId: v.optional(v.id('groups')),
    channelThreadId: v.optional(v.id('channelThreads')),
    messageId: v.optional(v.id('messages')),
    attachmentId: v.optional(v.id('attachments')),
    quote: v.optional(v.string()),
    availability: taskReferenceAvailability,
    isPrimary: v.boolean(),
    rank: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_suggestion_rank', ['suggestionId', 'rank'])
    .index('by_project_created_at', ['projectId', 'createdAt'])
    .index('by_message', ['messageId'])
    .index('by_attachment', ['attachmentId']),

  taskSuggestionHides: defineTable({
    projectId: v.id('projects'),
    suggestionId: v.id('taskSuggestions'),
    projectMemberId: v.id('projectMembers'),
    createdAt: v.number(),
  })
    .index('by_member_suggestion', ['projectMemberId', 'suggestionId'])
    .index('by_suggestion', ['suggestionId']),

  taskDetectionSettings: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    enabled: v.boolean(),
    generation: v.number(),
    highWaterSequence: v.number(),
    scheduledJobId: v.optional(v.id('_scheduled_functions')),
    lastRunStatus: v.optional(taskJobStatus),
    lastErrorCategory: v.optional(v.string()),
    updatedByProjectMemberId: v.optional(v.id('projectMembers')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_group', ['groupId'])
    .index('by_project', ['projectId']),

  taskDetectionRuns: defineTable({
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    generation: v.number(),
    mode: v.optional(v.union(v.literal('automatic'), v.literal('history'))),
    requestedByProjectMemberId: v.optional(v.id('projectMembers')),
    startSequence: v.number(),
    endSequence: v.number(),
    status: taskJobStatus,
    leaseToken: v.string(),
    leaseExpiresAt: v.number(),
    attempts: v.number(),
    candidateCount: v.optional(v.number()),
    lowConfidenceCount: v.optional(v.number()),
    errorCategory: v.optional(v.string()),
    correlationId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_group_status', ['groupId', 'status'])
    .index('by_project', ['projectId'])
    .index('by_group_generation_start', [
      'groupId',
      'generation',
      'startSequence',
    ]),

  taskArchiveSnapshots: defineTable({
    entitlementId: v.id('projectArchiveEntitlements'),
    projectId: v.id('projects'),
    sourceTable: v.string(),
    sourceId: v.string(),
    taskId: v.optional(v.id('tasks')),
    taskPublicKey: v.optional(v.string()),
    taskSearchText: v.optional(v.string()),
    groupId: v.optional(v.id('groups')),
    messageId: v.optional(v.id('messages')),
    attachmentId: v.optional(v.id('attachments')),
    payload: v.any(),
    redactedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_entitlement', ['entitlementId'])
    .index('by_entitlement_table', ['entitlementId', 'sourceTable'])
    .index('by_entitlement_task', ['entitlementId', 'taskId', 'sourceTable'])
    .index('by_entitlement_task_key', ['entitlementId', 'sourceTable', 'taskPublicKey'])
    .searchIndex('search_task_text', {
      searchField: 'taskSearchText',
      filterFields: ['entitlementId', 'sourceTable'],
    })
    .index('by_entitlement_message', ['entitlementId', 'messageId'])
    .index('by_entitlement_source', [
      'entitlementId',
      'sourceTable',
      'sourceId',
    ])
    .index('by_message', ['messageId'])
    .index('by_attachment', ['attachmentId'])
    .index('by_project', ['projectId']),

  taskExitSnapshotStaging: defineTable({
    projectCompanyId: v.id('projectCompanies'),
    projectId: v.id('projects'),
    operationId: v.optional(v.string()),
    taskId: v.optional(v.id('tasks')),
    taskPublicKey: v.optional(v.string()),
    taskSearchText: v.optional(v.string()),
    messageId: v.optional(v.id('messages')),
    attachmentId: v.optional(v.id('attachments')),
    sourceTable: v.string(),
    sourceId: v.string(),
    groupId: v.optional(v.id('groups')),
    payload: v.any(),
    cutoff: v.number(),
    createdAt: v.number(),
  })
    .index('by_project_company', ['projectCompanyId'])
    .index('by_project_company_operation', ['projectCompanyId', 'operationId'])
    .index('by_project_company_operation_table', ['projectCompanyId', 'operationId', 'sourceTable'])
    .index('by_project_company_operation_source', ['projectCompanyId', 'operationId', 'sourceTable', 'sourceId'])
    .index('by_project_company_operation_task_key', [
      'projectCompanyId',
      'operationId',
      'sourceTable',
      'taskPublicKey',
    ])
    .index('by_project_company_operation_table_task', [
      'projectCompanyId',
      'operationId',
      'sourceTable',
      'taskId',
    ])
    .index('by_project_company_operation_message', [
      'projectCompanyId',
      'operationId',
      'messageId',
    ])
    .searchIndex('search_task_text', {
      searchField: 'taskSearchText',
      filterFields: ['projectCompanyId', 'operationId', 'sourceTable'],
    })
    .index('by_project_company_table', ['projectCompanyId', 'sourceTable'])
    .index('by_project', ['projectId']),
} as const
