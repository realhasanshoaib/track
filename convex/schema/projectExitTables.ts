import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { companyProjectRole, projectMemberStatus } from './companyValidators'

export const exitSnapshotStatus = v.union(
  v.literal('capturing'),
  v.literal('failed'),
  v.literal('verified'),
  v.literal('cancelled'),
)

export const exitSnapshotPhase = v.union(
  v.literal('members'),
  v.literal('channels'),
  v.literal('visibility'),
  v.literal('complete'),
)

export const exitSnapshotScope = v.union(
  v.literal('member'),
  v.literal('channel'),
)

const memberSnapshot = v.object({
  membership: v.object({
    _id: v.id('projectMembers'),
    companyId: v.optional(v.id('companies')),
    role: companyProjectRole,
    status: v.optional(projectMemberStatus),
    userId: v.id('users'),
    userDisplayNameSnapshot: v.optional(v.string()),
    companyDisplayNameSnapshot: v.optional(v.string()),
  }),
  user: v.object({
    _id: v.id('users'),
    displayName: v.string(),
  }),
  company: v.optional(v.object({
    _id: v.id('companies'),
    displayName: v.string(),
  })),
})

const channelSnapshot = v.object({
  _id: v.id('groups'),
  createdAt: v.number(),
  kind: v.string(),
  name: v.string(),
  status: v.optional(v.string()),
})

export const exitSnapshotPayload = v.union(
  v.object({
    kind: v.literal('member'),
    snapshot: memberSnapshot,
  }),
  v.object({
    kind: v.literal('channel'),
    snapshot: channelSnapshot,
  }),

)

export const projectExitTables = {
  projectExitOperations: defineTable({
    projectCompanyId: v.id('projectCompanies'),
    projectId: v.id('projects'),
    operationId: v.string(),
    cutoff: v.number(),
    status: exitSnapshotStatus,
    phase: exitSnapshotPhase,
    cursor: v.optional(v.string()),
    stagedCount: v.number(),
    error: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_company_operation', [
      'projectCompanyId',
      'operationId',
    ])
    .index('by_project_status', ['projectId', 'status'])
    .index('by_operation_status', ['operationId', 'status']),

  projectExitSnapshotStaging: defineTable({
    projectCompanyId: v.id('projectCompanies'),
    projectId: v.id('projects'),
    operationId: v.string(),
    scope: exitSnapshotScope,
    projectMemberId: v.optional(v.id('projectMembers')),
    groupId: v.optional(v.id('groups')),
    sourceKind: exitSnapshotScope,
    sourceId: v.string(),
    searchText: v.optional(v.string()),
    cutoff: v.number(),
    payload: exitSnapshotPayload,
    createdAt: v.number(),
  })
    .index('by_operation', ['operationId'])
    .index('by_operation_member', ['operationId', 'projectMemberId'])
    .index('by_operation_member_scope', [
      'operationId',
      'projectMemberId',
      'scope',
    ])

    .index('by_operation_scope', ['operationId', 'scope', 'sourceId'])
    .searchIndex('search_name_by_operation', {
      searchField: 'searchText',
      filterFields: ['operationId', 'scope', 'projectMemberId'],
    })
    .index('by_operation_source', [
      'operationId',
      'sourceKind',
      'sourceId',
      'projectMemberId',
    ]),

  projectExitChannelVisibility: defineTable({
    projectCompanyId: v.id('projectCompanies'),
    projectId: v.id('projects'),
    operationId: v.string(),
    projectMemberId: v.id('projectMembers'),
    groupId: v.id('groups'),
    createdAt: v.number(),
  })
    .index('by_operation_member', [
      'operationId',
      'projectMemberId',
      'groupId',
    ])
    .index('by_operation_group', ['operationId', 'groupId'])
    .index('by_project_company_operation', [
      'projectCompanyId',
      'operationId',
    ]),
} as const
