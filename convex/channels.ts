import { assertProjectSnapshotWritable } from './lib/projectSnapshotLock'
import { decodeLegacyArchivedChannel } from './lib/legacyArchiveSnapshot'
import { getArchivedChannelSnapshot } from './lib/projectExitArchive'
import { hasUnanimousApproval } from '@track/shared/company'
import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { appendAuditEvent } from './lib/audit'
import { requireAuthenticatedActor } from './lib/actorContext'
import {
  requireCompanyModelEnabled,
  requireCompanyProjectManager,
  resolveCompanyProjectAccess,
} from './lib/companyPolicy'

async function activeChannelParticipantIds(ctx: MutationCtx, groupId: Id<'groups'>) {
  const memberships = await ctx.db.query('groupMembers')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect()
  const projectMembers = await Promise.all(memberships
    .filter((membership) => membership.status === 'active' && membership.projectMemberId)
    .map(async (membership) => await ctx.db.get(membership.projectMemberId!)))
  return new Set(projectMembers.flatMap((member) =>
    member?.projectCompanyId ? [String(member.projectCompanyId)] : [],
  ))
}

function sameParticipantSet(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((participantId) => right.has(participantId))
}

async function recordChannelParticipantChange(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  previousParticipantIds: ReadonlySet<string>,
  now: number,
) {
  const participantIds = await activeChannelParticipantIds(ctx, groupId)
  if (sameParticipantSet(previousParticipantIds, participantIds)) return

  const [group, pendingRequests] = await Promise.all([
    ctx.db.get(groupId),
    ctx.db.query('channelArchiveRequests')
      .withIndex('by_group_status', (q) => q.eq('groupId', groupId).eq('status', 'pending'))
      .collect(),
  ])
  if (!group) throw new Error('channel_unavailable')
  await Promise.all(pendingRequests.map((request) =>
    ctx.db.patch(request._id, { status: 'stale', updatedAt: now }),
  ))
  const lifecycleStatus = group.status === 'archive_pending' && pendingRequests.length
    ? pendingRequests[0]!.operation === 'archive' ? 'active' : 'archived'
    : group.status
  await ctx.db.patch(group._id, {
    status: lifecycleStatus,
    revision: (group.revision ?? 0) + 1,
    updatedAt: now,
  })
}

export const list = query({
  args: {
    projectId: v.id('projects'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveCompanyProjectAccess(ctx, actor, args)
    if (access.projectMember.status === 'archived') {
      const operationId = access.entitlement?.snapshotOperationId
      if (operationId) {
        const visibility = await ctx.db.query('projectExitChannelVisibility')
          .withIndex('by_operation_member', (q) =>
            q.eq('operationId', operationId).eq('projectMemberId', access.projectMember._id)).collect()
        const snapshots = await Promise.all(visibility.map((row) =>
          getArchivedChannelSnapshot(ctx, operationId, row.groupId)))
        return snapshots.filter((snapshot) => snapshot !== null)
      }
      const snapshots = new Map((access.entitlement?.channelSnapshots ?? []).map((value: unknown) => {
        const snapshot = decodeLegacyArchivedChannel(ctx, value)
        return [snapshot._id, snapshot] as const
      }))
      return (access.entitlement?.channelIds ?? [])
        .map((groupId) => snapshots.get(groupId) ?? null)
        .filter((channel) => channel !== null)
    }
    const memberships = await ctx.db
      .query('groupMembers')
      .withIndex('by_project_member_status', (q) =>
        q.eq('projectMemberId', access.projectMember._id).eq('status', 'active'),
      )
      .collect()
    return await Promise.all(memberships.map(async (membership) => {
      const channel = await ctx.db.get(membership.groupId)
      return channel ? { channel, membership } : null
    })).then((channels) => channels.filter((channel) => channel !== null))
  },
})

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
    name: v.string(),
    ownCompanyMemberIds: v.array(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireCompanyProjectManager(ctx, actor, args)
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const name = args.name.trim()
    if (!name) throw new Error('channel_name_required')
    const memberIds = Array.from(new Set([access.projectMember._id, ...args.ownCompanyMemberIds]))
    const members = await Promise.all(memberIds.map(async (id) => await ctx.db.get(id)))
    if (members.some((member) =>
      !member || member.projectId !== access.project._id || member.companyId !== access.company._id || member.status !== 'active'
    )) throw new Error('channel_member_unavailable')
    const now = Date.now()
    const groupId = await ctx.db.insert('groups', {
      projectId: access.project._id,
      kind: 'custom',
      name,
      status: 'active',
      revision: 1,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
    for (const member of members) {
      if (!member) continue
      await ctx.db.insert('groupMembers', {
        projectId: access.project._id,
        groupId,
        userId: member.userId,
        projectMemberId: member._id,
        status: 'active',
        isSteward: member._id === access.projectMember._id,
        createdAt: now,
        updatedAt: now,
      })
    }
    await appendAuditEvent(ctx, {
      companyId: access.company._id,
      projectId: access.project._id,
      groupId,
      actorId: actor.userId,
      actorProjectMemberId: access.projectMember._id,
      actingCompanyId: access.company._id,
      entityType: 'channel',
      entityId: groupId,
      action: 'channel.created',
      after: { name },
    })
    return groupId
  },
})

export const requestParticipation = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
    targetProjectCompanyId: v.id('projectCompanies'),
    selectedProjectMemberIds: v.array(v.id('projectMembers')),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveCompanyProjectAccess(ctx, actor, args)
    if (!access.capabilities.canStewardChannel) throw new Error('channel_steward_required')
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const target = await ctx.db.get(args.targetProjectCompanyId)
    if (!target || target.projectId !== access.project._id || target.status !== 'active' || target.companyId === access.company._id) {
      throw new Error('target_project_company_unavailable')
    }
    const existing = await ctx.db
      .query('channelParticipationRequests')
      .withIndex('by_group_idempotency', (q) => q.eq('groupId', args.groupId).eq('idempotencyKey', args.idempotencyKey))
      .unique()
    if (existing) return existing._id
    const selected = await Promise.all(args.selectedProjectMemberIds.map(async (id) => await ctx.db.get(id)))
    if (selected.some((member) => !member || member.projectCompanyId !== target._id || member.status !== 'active')) {
      throw new Error('target_project_member_unavailable')
    }
    const now = Date.now()
    return await ctx.db.insert('channelParticipationRequests', {
      projectId: access.project._id,
      groupId: args.groupId,
      targetProjectCompanyId: target._id,
      invitedByProjectMemberId: access.projectMember._id,
      selectedProjectMemberIds: Array.from(new Set(args.selectedProjectMemberIds)),
      status: 'pending',
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const getParticipationOptions = query({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveCompanyProjectAccess(ctx, actor, args)
    if (!access.capabilities.canStewardChannel) throw new Error('channel_steward_required')
    const participants = await ctx.db
      .query('projectCompanies')
      .withIndex('by_project_status', (q) => q.eq('projectId', args.projectId).eq('status', 'active'))
      .collect()
    return await Promise.all(participants.filter((participant) => participant.companyId !== args.actingCompanyId).map(async (participant) => {
      const [company, members] = await Promise.all([
        ctx.db.get(participant.companyId),
        ctx.db.query('projectMembers').withIndex('by_project_company_status', (q) =>
          q.eq('projectId', args.projectId).eq('companyId', participant.companyId).eq('status', 'active'),
        ).collect(),
      ])
      return {
        projectCompany: participant,
        company: company ? { _id: company._id, displayName: company.displayName } : null,
        members: await Promise.all(members.map(async (member) => {
          const user = await ctx.db.get(member.userId)
          return { membership: member, user: user ? { _id: user._id, displayName: user.displayName } : null }
        })),
      }
    }))
  },
})

export const listParticipationInvitations = query({
  args: {
    projectId: v.id('projects'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireCompanyProjectManager(ctx, actor, args)
    return await ctx.db
      .query('channelParticipationRequests')
      .withIndex('by_target_status', (q) =>
        q.eq('targetProjectCompanyId', access.projectCompany._id).eq('status', 'pending'),
      )
      .collect()
  },
})

export const decideParticipation = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
    requestId: v.id('channelParticipationRequests'),
    decision: v.union(v.literal('accept'), v.literal('decline')),
    selectedProjectMemberIds: v.array(v.id('projectMembers')),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const access = await requireCompanyProjectManager(ctx, actor, {
      projectId: args.projectId,
      actingCompanyId: args.actingCompanyId,
      projectMemberId: args.projectMemberId,
    })
    const request = await ctx.db.get(args.requestId)
    if (
      !request ||
      request.status !== 'pending' ||
      request.projectId !== access.project._id ||
      request.groupId !== args.groupId ||
      request.targetProjectCompanyId !== access.projectCompany._id
    ) return request?._id ?? null
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const now = Date.now()
    const previousParticipantIds = await activeChannelParticipantIds(ctx, args.groupId)
    if (args.decision === 'decline') {
      await ctx.db.patch(request._id, {
        status: 'declined',
        decidedByProjectMemberId: access.projectMember._id,
        decidedAt: now,
        updatedAt: now,
      })
      return request._id
    }
    const selectedIds = Array.from(new Set([access.projectMember._id, ...args.selectedProjectMemberIds]))
    const selected = await Promise.all(selectedIds.map(async (id) => await ctx.db.get(id)))
    if (selected.some((member) =>
      !member || member.projectCompanyId !== access.projectCompany._id || member.status !== 'active'
    )) throw new Error('target_project_member_unavailable')
    for (const member of selected) {
      if (!member) continue
      const existing = await ctx.db
        .query('groupMembers')
        .withIndex('by_group_project_member', (q) =>
          q.eq('groupId', request.groupId).eq('projectMemberId', member._id),
        )
        .unique()
      const payload = {
        status: 'active' as const,
        isSteward: member._id === access.projectMember._id,
        endedAt: undefined,
        updatedAt: now,
      }
      if (existing) await ctx.db.patch(existing._id, payload)
      else await ctx.db.insert('groupMembers', {
        projectId: access.project._id,
        groupId: request.groupId,
        userId: member.userId,
        projectMemberId: member._id,
        createdAt: now,
        ...payload,
      })
    }
    await ctx.db.patch(request._id, {
      status: 'accepted',
      selectedProjectMemberIds: selectedIds,
      decidedByProjectMemberId: access.projectMember._id,
      decidedAt: now,
      updatedAt: now,
    })
    await recordChannelParticipantChange(ctx, args.groupId, previousParticipantIds, now)
    return request._id
  },
})

export const updateOwnCompanyMember = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
    targetProjectMemberId: v.id('projectMembers'),
    active: v.boolean(),
    steward: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireCompanyModelEnabled()
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveCompanyProjectAccess(ctx, actor, args)
    if (!access.capabilities.canStewardChannel) throw new Error('channel_steward_required')
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const target = await ctx.db.get(args.targetProjectMemberId)
    if (!target || target.projectId !== access.project._id || target.companyId !== access.company._id || target.status !== 'active') {
      throw new Error('channel_member_unavailable')
    }
    const membership = await ctx.db
      .query('groupMembers')
      .withIndex('by_group_project_member', (q) =>
        q.eq('groupId', args.groupId).eq('projectMemberId', target._id),
      )
      .unique()
    if (membership?.isSteward && (!args.active || !args.steward)) {
      const channelMemberships = await ctx.db
        .query('groupMembers')
        .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
        .collect()
      const ownStewards = channelMemberships.filter((item) =>
        item.status === 'active' && item.isSteward && item.projectMemberId,
      )
      const ownStewardMembers = await Promise.all(ownStewards.map(async (item) => await ctx.db.get(item.projectMemberId!)))
      if (ownStewardMembers.filter((item) => item?.companyId === access.company._id).length <= 1) {
        throw new Error('last_channel_steward')
      }
    }
    const now = Date.now()
    const previousParticipantIds = await activeChannelParticipantIds(ctx, args.groupId)
    if (membership) {
      await ctx.db.patch(membership._id, {
        status: args.active ? 'active' : 'removed',
        isSteward: args.active && args.steward,
        endedAt: args.active ? undefined : now,
        updatedAt: now,
      })
      await recordChannelParticipantChange(ctx, args.groupId, previousParticipantIds, now)
      return membership._id
    }
    if (!args.active) return null
    const membershipId = await ctx.db.insert('groupMembers', {
      projectId: access.project._id,
      groupId: args.groupId,
      userId: target.userId,
      projectMemberId: target._id,
      status: 'active',
      isSteward: args.steward,
      createdAt: now,
      updatedAt: now,
    })
    await recordChannelParticipantChange(ctx, args.groupId, previousParticipantIds, now)
    return membershipId
  },
})

export const requestArchive = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
    operation: v.union(v.literal('archive'), v.literal('restore')),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveCompanyProjectAccess(ctx, actor, args)
    const isSteward = access.projectMember.role === 'manager' && access.groupMember?.status === 'active' && access.groupMember.isSteward
    if (!isSteward || access.project.status === 'archived') throw new Error('channel_steward_required')
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const existing = await ctx.db
      .query('channelArchiveRequests')
      .withIndex('by_group_idempotency', (q) => q.eq('groupId', args.groupId).eq('idempotencyKey', args.idempotencyKey))
      .unique()
    if (existing) return existing._id
    const expectedStatus = args.operation === 'archive' ? 'active' : 'archived'
    if (access.group?.status !== expectedStatus) throw new Error('channel_lifecycle_conflict')
    if (access.group?.kind === 'general' && access.project.status === 'active' && args.operation === 'archive') {
      throw new Error('general_channel_cannot_archive')
    }
    const now = Date.now()
    await ctx.db.patch(args.groupId, { status: 'archive_pending', updatedAt: now })
    return await ctx.db.insert('channelArchiveRequests', {
      projectId: args.projectId,
      groupId: args.groupId,
      channelRevision: access.group?.revision ?? 0,
      operation: args.operation,
      requestedByProjectMemberId: access.projectMember._id,
      status: 'pending',
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const listPendingArchive = query({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveCompanyProjectAccess(ctx, actor, args)
    const isSteward = access.projectMember.role === 'manager' && access.groupMember?.status === 'active' && access.groupMember.isSteward
    if (!isSteward || access.project.status === 'archived') throw new Error('channel_steward_required')
    return await ctx.db
      .query('channelArchiveRequests')
      .withIndex('by_group_status', (q) => q.eq('groupId', args.groupId).eq('status', 'pending'))
      .collect()
  },
})

export const approveArchive = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
    requestId: v.id('channelArchiveRequests'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveCompanyProjectAccess(ctx, actor, args)
    const isSteward = access.projectMember.role === 'manager' && access.groupMember?.status === 'active' && access.groupMember.isSteward
    if (!isSteward || access.project.status === 'archived') throw new Error('channel_steward_required')
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const request = await ctx.db.get(args.requestId)
    if (!request || request.status !== 'pending') return request?._id ?? null
    if (request.projectId !== args.projectId || request.groupId !== args.groupId) {
      throw new Error('channel_archive_request_scope_mismatch')
    }
    if (!access.group || access.group.revision !== request.channelRevision) {
      await ctx.db.patch(request._id, { status: 'stale', updatedAt: Date.now() })
      return request._id
    }
    const existing = await ctx.db
      .query('channelArchiveApprovals')
      .withIndex('by_request_participant', (q) =>
        q.eq('requestId', request._id).eq('projectCompanyId', access.projectCompany._id),
      )
      .unique()
    if (!existing) await ctx.db.insert('channelArchiveApprovals', {
      requestId: request._id,
      projectCompanyId: access.projectCompany._id,
      projectMemberId: access.projectMember._id,
      decision: 'approved',
      channelRevision: request.channelRevision,
      createdAt: Date.now(),
    })
    const channelMembers = await ctx.db.query('groupMembers').withIndex('by_group', (q) => q.eq('groupId', args.groupId)).collect()
    const activeMembers = channelMembers.filter((member) => member.status === 'active' && member.projectMemberId)
    const projectMembers = await Promise.all(activeMembers.map(async (member) => await ctx.db.get(member.projectMemberId!)))
    const representedProjectCompanyIds = Array.from(new Set(projectMembers.flatMap((member) => member?.projectCompanyId ? [member.projectCompanyId] : [])))
    const approvals = await ctx.db.query('channelArchiveApprovals').withIndex('by_request', (q) => q.eq('requestId', request._id)).collect()
    const approvalMap = new Map(approvals.map((approval) => [approval.projectCompanyId, approval.decision]))
    approvalMap.set(access.projectCompany._id, 'approved')
    if (!hasUnanimousApproval(representedProjectCompanyIds, approvalMap)) return request._id
    const now = Date.now()
    await ctx.db.patch(access.group._id, {
      status: request.operation === 'archive' ? 'archived' : 'active',
      revision: (access.group.revision ?? 0) + 1,
      archivedAt: request.operation === 'archive' ? now : undefined,
      updatedAt: now,
    })
    await ctx.db.patch(request._id, { status: 'approved', decidedAt: now, updatedAt: now })
    return request._id
  },
})

export const cancelArchive = mutation({
  args: {
    projectId: v.id('projects'),
    groupId: v.id('groups'),
    actingCompanyId: v.id('companies'),
    projectMemberId: v.id('projectMembers'),
    requestId: v.id('channelArchiveRequests'),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedActor(ctx)
    const access = await resolveCompanyProjectAccess(ctx, actor, args)
    const isSteward = access.projectMember.role === 'manager' &&
      access.groupMember?.status === 'active' && access.groupMember.isSteward
    if (!isSteward || access.project.status === 'archived') throw new Error('channel_steward_required')
    await assertProjectSnapshotWritable(ctx, args.projectId)
    const request = await ctx.db.get(args.requestId)
    if (!request || request.status !== 'pending') return request?._id ?? null
    if (request.projectId !== args.projectId || request.groupId !== args.groupId) {
      throw new Error('channel_archive_request_scope_mismatch')
    }
    const now = Date.now()
    await ctx.db.patch(request._id, { status: 'cancelled', decidedAt: now, updatedAt: now })
    await ctx.db.patch(args.groupId, {
      status: request.operation === 'archive' ? 'active' : 'archived',
      updatedAt: now,
    })
    return request._id
  },
})
